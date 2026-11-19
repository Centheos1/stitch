import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { INBOX_FROM_ADDRESSES, type MailThread, type Order, type OrderMessage } from "@shared/schema";
import { AttachmentList, MailBody } from "@/components/admin/MailBody";
import { Loader2 } from "lucide-react";

type ThreadBundle = { thread: MailThread; messages: OrderMessage[] };
type PendingFile = { key: string; filename: string; contentType: string };

async function readJson<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await apiRequest(method, path, body);
  return res.json() as Promise<T>;
}

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Something went wrong";
  const json = raw.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(json) as { message?: string };
    return parsed.message || json;
  } catch {
    return json;
  }
}

function Editor({ onChange }: { onChange: (html: string, text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const run = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    onChange(ref.current?.innerHTML ?? "", ref.current?.innerText ?? "");
  };
  return (
    <div>
      <div className="mb-2 flex gap-2">
        <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => run("bold")}>Bold</Button>
        <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => run("italic")}>Italic</Button>
        <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => run("insertUnorderedList")}>List</Button>
        <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => {
          const url = window.prompt("Link address");
          if (url) run("createLink", url);
        }}>Link</Button>
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-label="Message"
        className="min-h-40 rounded-2xl border border-border p-4 text-sm"
        onInput={() => onChange(ref.current?.innerHTML ?? "", ref.current?.innerText ?? "")}
      />
    </div>
  );
}

export function InboxPanel() {
  const [box, setBox] = useState<"inbox" | "archive">("inbox");
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ThreadBundle | null>(null);
  const [composing, setComposing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [from, setFrom] = useState<string>(INBOX_FROM_ADDRESSES[0]);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [mode, setMode] = useState<"new" | "reply" | "replyAll" | "forward">("new");

  const load = async (nextBox = box) => {
    const [nextThreads, nextOrders] = await Promise.all([
      readJson<MailThread[]>(`/api/admin/inbox?box=${nextBox}`),
      readJson<Order[]>("/api/admin/orders"),
    ]);
    setThreads(nextThreads);
    setOrders(nextOrders);
  };

  useEffect(() => {
    load().catch((err) => setError(errorText(err))).finally(() => setLoading(false));
  }, []);

  const resetComposer = () => {
    setTo("");
    setCc("");
    setBcc("");
    setSubject("");
    setHtml("");
    setText("");
    setFiles([]);
    setMode("new");
  };

  const openThread = async (threadId: string) => {
    setComposing(false);
    setSelectedId(threadId);
    setError("");
    const next = await readJson<ThreadBundle>(`/api/admin/inbox/${threadId}`);
    setBundle(next);
    setThreads((current) => current.map((thread) => thread.threadId === threadId ? { ...thread, unreadCount: 0 } : thread));
  };

  const uploadFiles = async (list: FileList | null) => {
    if (!list) return;
    setError("");
    for (const file of Array.from(list)) {
      if (file.size > 10 * 1024 * 1024) {
        setError("Attachments must be 10 MB or smaller.");
        continue;
      }
      const target = await readJson<{ uploadUrl: string; key: string; filename: string }>("/api/admin/mail/upload-url", "POST", {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });
      const uploaded = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploaded.ok) {
        setError("The attachment was not uploaded.");
        continue;
      }
      setFiles((current) => [...current, { key: target.key, filename: target.filename, contentType: file.type || "application/octet-stream" }]);
    }
  };

  const removeFile = async (key: string) => {
    setFiles((current) => current.filter((file) => file.key !== key));
    await apiRequest("DELETE", "/api/admin/mail/uploads", { key }).catch(() => undefined);
  };

  const send = async () => {
    setSending(true);
    setError("");
    try {
      const sent = await readJson<{ threadId: string }>("/api/admin/mail/send", "POST", {
        from, to, cc, bcc, subject, html, text, mode,
        threadId: mode === "new" ? "" : selectedId,
        attachments: files,
      });
      resetComposer();
      setComposing(false);
      await load();
      await openThread(sent.threadId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const startReply = (nextMode: "reply" | "replyAll" | "forward") => {
    const latest = bundle?.messages[bundle.messages.length - 1];
    const ours = new Set<string>([...INBOX_FROM_ADDRESSES, "orders@stitchhandmade.shop", from]);
    const keep = (value: string) => value.split(/[,;]/).map((part) => part.trim()).filter((address) => address && !ours.has(address.toLowerCase()) && !address.toLowerCase().startsWith("order-"));
    setMode(nextMode);
    setComposing(true);
    setHtml("");
    setText("");
    setFiles([]);
    setSubject(latest?.subject || "");
    if (nextMode === "forward") {
      setTo("");
      setCc("");
      setBcc("");
      return;
    }
    const recipient = latest?.direction === "in" ? latest.from : latest?.to || "";
    setTo(keep(recipient).join(", "));
    setCc(nextMode === "replyAll" ? [...keep(latest?.to || ""), ...keep(latest?.cc || "")].join(", ") : "");
    setBcc("");
  };

  const archive = async (archived: boolean) => {
    if (!selectedId) return;
    setSending(true);
    try {
      await readJson(`/api/admin/inbox/${selectedId}/archive`, "POST", { archived });
      setBundle(null);
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !window.confirm("Delete this conversation? The messages and attachments are removed.")) return;
    setSending(true);
    try {
      await readJson(`/api/admin/inbox/${selectedId}`, "DELETE");
      setBundle(null);
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const attach = async (messageId: string, orderId: string) => {
    setError("");
    try {
      await readJson(`/api/admin/inbox/${encodeURIComponent(messageId)}/attach`, "POST", { orderId });
      setBundle(null);
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-muted-foreground"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;
  }

  const composer = (
    <div className="space-y-3 rounded-3xl border border-border bg-white p-6">
      <label className="block text-sm font-semibold">
        From
        <select className="mt-1 w-full rounded-xl border border-border p-3 text-sm" value={from} onChange={(event) => setFrom(event.target.value)}>
          {INBOX_FROM_ADDRESSES.map((address) => <option key={address} value={address}>{address}</option>)}
        </select>
      </label>
      <Input value={to} onChange={(event) => setTo(event.target.value)} placeholder="To" className="rounded-xl" />
      <Input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="Cc" className="rounded-xl" />
      <Input value={bcc} onChange={(event) => setBcc(event.target.value)} placeholder="Bcc" className="rounded-xl" />
      <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" className="rounded-xl" />
      <Editor key={`${mode}-${selectedId ?? "new"}`} onChange={(nextHtml, nextText) => { setHtml(nextHtml); setText(nextText); }} />
      <input type="file" multiple onChange={(event) => { uploadFiles(event.target.files).catch((err) => setError(errorText(err))); event.target.value = ""; }} />
      <div className="flex flex-wrap gap-2">
        {files.map((file) => (
          <Button key={file.key} type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => removeFile(file.key)}>{file.filename} ×</Button>
        ))}
      </div>
      <Button className="rounded-xl" disabled={sending} onClick={send}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={box === "inbox" ? "default" : "outline"} className="rounded-xl" onClick={() => { setBox("inbox"); setBundle(null); setSelectedId(null); load("inbox").catch((err) => setError(errorText(err))); }}>Inbox</Button>
        <Button type="button" variant={box === "archive" ? "default" : "outline"} className="rounded-xl" onClick={() => { setBox("archive"); setBundle(null); setSelectedId(null); load("archive").catch((err) => setError(errorText(err))); }}>Archive</Button>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => { setComposing(true); setBundle(null); setSelectedId(null); resetComposer(); }}>Compose</Button>
      </div>

      {composing && mode === "new" ? composer : null}

      {bundle && selectedId ? (
        <div className="rounded-3xl border border-border bg-white p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setBundle(null); setSelectedId(null); setComposing(false); }}>All mail</Button>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="rounded-xl" disabled={sending} onClick={() => archive(box === "inbox")}>{box === "inbox" ? "Archive" : "Move to inbox"}</Button>
              <Button size="sm" variant="outline" className="rounded-xl" disabled={sending} onClick={remove}>Delete</Button>
            </div>
          </div>
          <h2 className="font-display text-2xl font-bold">{bundle.thread.subject}</h2>
          <p className="text-sm text-muted-foreground">{bundle.thread.correspondent}</p>
          <div className="mt-6 space-y-3">
            {bundle.messages.map((message) => (
              <article key={message.id} className={`rounded-2xl border p-4 ${message.direction === "in" ? "bg-muted/40" : "bg-white"}`}>
                <p className="text-xs text-muted-foreground">
                  {message.from} → {message.to}
                  {message.cc ? ` · cc ${message.cc}` : ""}
                  {" · "}{new Date(message.createdAt).toLocaleString()}
                  {message.spam ? " · spam or virus check failed" : ""}
                  {message.delivered === false ? " · not delivered" : ""}
                </p>
                <p className="mt-1 text-sm font-semibold">{message.subject}</p>
                <MailBody message={message} />
                <AttachmentList message={message} />
                {message.deliveryError && <p className="mt-2 text-sm text-destructive">{message.deliveryError}</p>}
                {message.direction === "in" && orders.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {orders.map((order) => (
                      <Button key={order.id} size="sm" variant="ghost" className="rounded-xl" onClick={() => attach(message.messageId || message.id, order.id)}>
                        Add to {order.name}
                      </Button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" className="rounded-xl" onClick={() => startReply("reply")}>Reply</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => startReply("replyAll")}>Reply all</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => startReply("forward")}>Forward</Button>
          </div>
          {composing && mode !== "new" ? <div className="mt-4">{composer}</div> : null}
        </div>
      ) : composing ? null : (
        <div className="overflow-hidden rounded-3xl border border-border bg-white">
          {threads.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">{box === "archive" ? "Nothing is archived." : "The inbox is empty."}</p>
          ) : (
            <div className="divide-y">
              {threads.map((thread) => (
                <button key={thread.threadId} type="button" onClick={() => openThread(thread.threadId).catch((err) => setError(errorText(err)))} className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/30">
                  <span>
                    <span className="font-semibold">{thread.correspondent || "(no sender)"}</span>
                    <span className="block text-sm">{thread.subject}</span>
                    <span className="block text-sm text-muted-foreground">{thread.snippet}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {thread.unreadCount > 0 ? <span className="mr-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">{thread.unreadCount}</span> : null}
                    {new Date(thread.lastMessageAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
