import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { logError } from "./logging";

const app = express();
const httpServer = createServer(app);
app.disable("x-powered-by");

// Viewer, CloudFront, then the ECS load balancer. Trusting those two hops
// makes req.ip the visitor, which the admin login limiter uses.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 2);
}

app.use("/api", (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.use("/api/admin", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

async function start() {
  await registerRoutes(httpServer, app);

  // Unknown API paths must not fall through to the website HTML. A 200 page
  // would look like a successful password change to the browser.
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV !== "production") {
    // Product images live on CloudFront. In local dev, serve that path from there.
    app.use("/images", async (req, res) => {
      try {
        const upstream = await fetch(`https://stitchhandmade.shop${req.originalUrl}`);
        res.status(upstream.status);
        const type = upstream.headers.get("content-type");
        if (type) res.setHeader("content-type", type);
        res.send(Buffer.from(await upstream.arrayBuffer()));
      } catch {
        res.status(502).json({ message: "Image CDN is unavailable" });
      }
    });
  }

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
    if (res.headersSent) {
      logError("Response failed after headers were sent", error);
      return next(new Error("Response failed"));
    }
    if (status === 400) return res.status(400).json({ message: "Invalid request." });
    if (status === 413) return res.status(413).json({ message: "Request body is too large." });
    if (status === 415) return res.status(415).json({ message: "Unsupported request format." });
    if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500) {
      return res.sendStatus(status);
    }
    logError("Unhandled server error", error);
    return res.status(500).json({ message: "Internal server error" });
  });

  // Serve the API and the client on the port in the PORT environment variable.
  // Default to 3000 locally: macOS reserves 5000 for AirPlay Receiver on some setups.
  // reusePort is not supported on macOS, so it is not set.
  const port = parseInt(process.env.PORT || "3000", 10);
  httpServer.listen(
    {
      port,
      host: process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
    },
    () => {
      console.info(`Serving on port ${port}`);
    },
  );
}

httpServer.on("error", (error) => {
  logError("HTTP server failed", error);
  process.exit(1);
});

start().catch((error) => {
  logError("Server startup failed", error);
  process.exit(1);
});
