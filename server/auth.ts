import { GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { createHmac, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { logError } from "./logging";

const COOKIE_NAME = "stitch_admin";
const SESSION_MS = 12 * 60 * 60 * 1000;
const SECRET_CACHE_MS = 30_000;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 1024;

const ADMIN_PASSWORD_SECRET_ID = process.env.ADMIN_PASSWORD_SECRET_ID || "stitch/admin-password";
const SESSION_SECRET_ID = process.env.SESSION_SECRET_ID || "stitch/session-secret";

const secrets = new SecretsManagerClient({
  region: process.env.AWS_REGION || "ap-southeast-2",
});

type CachedSecret = { value: string; expires: number };
const secretCache = new Map<string, CachedSecret>();
const secretReads = new Map<string, Promise<string>>();
const loginFailures = new Map<string, number[]>();

async function readSecret(secretId: string, force = false): Promise<string> {
  if (!force) {
    const cached = secretCache.get(secretId);
    if (cached && cached.expires > Date.now()) return cached.value;
    const pending = secretReads.get(secretId);
    if (pending) return pending;
  }

  const read = (async () => {
    const result = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
    const value = result.SecretString?.trim() ?? "";
    if (!value) throw new Error(`Secret ${secretId} is empty`);
    secretCache.set(secretId, { value, expires: Date.now() + SECRET_CACHE_MS });
    return value;
  })().finally(() => {
    if (secretReads.get(secretId) === read) secretReads.delete(secretId);
  });

  if (!force) secretReads.set(secretId, read);
  return read;
}

function rememberPassword(password: string): void {
  secretCache.set(ADMIN_PASSWORD_SECRET_ID, {
    value: password,
    expires: Date.now() + SECRET_CACHE_MS,
  });
}

function passwordTag(password: string, sessionSecret: string): string {
  return createHmac("sha256", sessionSecret).update(`password:${password}`).digest("base64url").slice(0, 22);
}

function signaturesMatch(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function passwordsMatch(submitted: string, expected: string): boolean {
  const left = createHmac("sha256", "stitch-admin-password").update(submitted).digest();
  const right = createHmac("sha256", "stitch-admin-password").update(expected).digest();
  return timingSafeEqual(left, right);
}

function mintToken(sessionSecret: string, password: string): string {
  const payload = Buffer.from(`${Date.now() + SESSION_MS}.${passwordTag(password, sessionSecret)}`).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readToken(token: string, sessionSecret: string): { expires: number; tag: string } | undefined {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  if (!signaturesMatch(signature, expected)) return undefined;

  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const split = decoded.lastIndexOf(".");
  if (split <= 0) return undefined;
  const expires = Number(decoded.slice(0, split));
  if (!Number.isFinite(expires)) return undefined;
  return { expires, tag: decoded.slice(split + 1) };
}

function readCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (name !== COOKIE_NAME) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function writeCookie(res: Response, value: string, maxAgeSeconds: number): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`,
  );
}

function clientAddress(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function recentFailures(ip: string): number[] {
  const now = Date.now();
  const recent = (loginFailures.get(ip) ?? []).filter((at) => now - at < FAILURE_WINDOW_MS);
  if (recent.length === 0) loginFailures.delete(ip);
  else loginFailures.set(ip, recent);
  return recent;
}

function recordFailure(ip: string): void {
  const recent = recentFailures(ip);
  recent.push(Date.now());
  loginFailures.set(ip, recent);
}

async function currentPassword(force = false): Promise<string> {
  return readSecret(ADMIN_PASSWORD_SECRET_ID, force);
}

async function sessionIsValid(req: Request): Promise<boolean> {
  const token = readCookie(req);
  if (!token) return false;
  const sessionSecret = await readSecret(SESSION_SECRET_ID);
  const parsed = readToken(token, sessionSecret);
  if (!parsed || parsed.expires <= Date.now()) return false;
  const password = await currentPassword();
  const tag = passwordTag(password, sessionSecret);
  if (signaturesMatch(parsed.tag, tag)) return true;
  // Another task may have just stored a new password. Check the secret itself
  // before treating a signed cookie as signed out.
  const fresh = await currentPassword(true);
  return signaturesMatch(parsed.tag, passwordTag(fresh, sessionSecret));
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store");
  void sessionIsValid(req).then(
    (valid) => {
      if (!valid) {
        res.setHeader("Cache-Control", "no-store");
        res.status(401).json({ message: "Sign in required" });
        return;
      }
      next();
    },
    (err) => {
      logError("Check admin session", err);
      res.setHeader("Cache-Control", "no-store");
      res.status(500).json({ message: "Could not check admin session" });
    },
  );
}

export function login(req: Request, res: Response): void {
  const ip = clientAddress(req);
  if (recentFailures(ip).length >= MAX_FAILURES) {
    res.setHeader("Cache-Control", "no-store");
    res.status(429).json({ message: "Too many attempts. Try again later." });
    return;
  }

  const password = typeof req.body?.password === "string" ? req.body.password.trim() : "";
  if (!password || password.length > MAX_PASSWORD_LENGTH) {
    recordFailure(ip);
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json({ message: "Incorrect password" });
    return;
  }

  void (async () => {
    const sessionSecret = await readSecret(SESSION_SECRET_ID);
    let expected = await currentPassword();
    if (!passwordsMatch(password, expected)) expected = await currentPassword(true);
    if (!passwordsMatch(password, expected)) {
      recordFailure(ip);
      res.setHeader("Cache-Control", "no-store");
      res.status(401).json({ message: "Incorrect password" });
      return;
    }
    loginFailures.delete(ip);
    writeCookie(res, mintToken(sessionSecret, expected), SESSION_MS / 1000);
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true });
  })().catch((err) => {
    logError("Admin login", err);
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ message: "Could not verify the password" });
  });
}

export function changePassword(req: Request, res: Response): void {
  const ip = clientAddress(req);
  if (recentFailures(ip).length >= MAX_FAILURES) {
    res.setHeader("Cache-Control", "no-store");
    res.status(429).json({ message: "Too many attempts. Try again later." });
    return;
  }

  const current = typeof req.body?.currentPassword === "string" ? req.body.currentPassword.trim() : "";
  const next = typeof req.body?.newPassword === "string" ? req.body.newPassword.trim() : "";
  if (!current) {
    res.setHeader("Cache-Control", "no-store");
    res.status(400).json({ message: "Enter your current password." });
    return;
  }
  if (next.length < MIN_PASSWORD_LENGTH || next.length > MAX_PASSWORD_LENGTH) {
    res.setHeader("Cache-Control", "no-store");
    res.status(400).json({ message: "Use a new password of at least 12 characters." });
    return;
  }
  if (current === next) {
    res.setHeader("Cache-Control", "no-store");
    res.status(400).json({ message: "Choose a different password." });
    return;
  }

  void (async () => {
    const sessionSecret = await readSecret(SESSION_SECRET_ID);
    let expected = await currentPassword();
    if (!passwordsMatch(current, expected)) expected = await currentPassword(true);
    if (!passwordsMatch(current, expected)) {
      recordFailure(ip);
      res.setHeader("Cache-Control", "no-store");
      res.status(401).json({ message: "Current password is incorrect" });
      return;
    }
    await secrets.send(new PutSecretValueCommand({
      SecretId: ADMIN_PASSWORD_SECRET_ID,
      SecretString: next,
    }));
    rememberPassword(next);
    writeCookie(res, mintToken(sessionSecret, next), SESSION_MS / 1000);
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true });
  })().catch((err) => {
    logError("Change admin password", err);
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ message: "Could not update the password" });
  });
}

export function logout(_req: Request, res: Response): void {
  writeCookie(res, "", 0);
  res.setHeader("Cache-Control", "no-store");
  res.json({ success: true });
}
