import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { INBOX_FROM_ADDRESSES, PROBLEM_REPORT_SUBJECT, type MailThread, type Order, type OrderMessage } from "@shared/schema";
import { AttachmentList, MailBody } from "@/components/admin/MailBody";
import { Loader2, Paperclip, Send, X } from "lucide-react";

const mailboxes = { inbox: "Inbox", archive: "Archive", spam: "Spam" } as const;
type Mailbox = keyof typeof mailboxes;
type MailAction = "archive" | "restore" | "delete";

function changeThread(threadId: string, action: MailAction) {
  const path = `/api/admin/inbox/${encodeURIComponent(threadId)}`;
  return action === "delete"
    ? readJson(path, "DELETE")
    : readJson(`${path}/archive`, "POST", { archived: action === "archive" });
}

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

function Editor({ focusOnMount, onChange }: {
  focusOnMount: boolean;
  onChange: (html: string, text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  const run = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    onChange(ref.current?.innerHTML ?? "", ref.current?.innerText ?? "");
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border focus-within:ring-1 focus-within:ring-ring">
      <div role="group" aria-label="Message formatting" className="flex flex-wrap gap-1 border-b border-border bg-muted/30 p-2"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) event.preventDefault();
        }}>
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
        aria-multiline="true"
        data-placeholder="Write your message…"
        className="min-h-36 break-words p-4 text-sm outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6"
        onInput={() => onChange(ref.current?.innerHTML ?? "", ref.current?.innerText ?? "")}
      />
    </div>
  );
}

export function InboxPanel() {
  const [box, setBox] = useState<Mailbox>("inbox");
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<MailAction | null>(null);
  const [bulkStatus, setBulkStatus] = useState("");
  const [orders, setOrders] = useState<Order[]>();
  const [orderPicker, setOrderPicker] = useState<string | null>(null);
  const listRequest = useRef(0);
  const threadRequest = useRef(0);
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
  const [showCopyFields, setShowCopyFields] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [mode, setMode] = useState<"new" | "reply" | "replyAll" | "forward">("new");

  const load = async (nextBox = box) => {
    const request = ++listRequest.current;
    const nextThreads = await readJson<MailThread[]>(`/api/admin/inbox?box=${nextBox}`);
    if (request !== listRequest.current) return;
    setThreads(nextThreads.filter((thread) =>
      nextBox === "spam" ? thread.spam === true : !thread.spam && thread.archived === (nextBox === "archive"),
    ));
  };

  const switchBox = async (nextBox: Mailbox) => {
    threadRequest.current += 1;
    setBox(nextBox);
    setThreads([]);
    setCheckedIds(new Set());
    setBulkStatus("");
    setBundle(null);
    setSelectedId(null);
    setOrderPicker(null);
    setError("");
    setLoading(true);
    try {
      await load(nextBox);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  const showOrders = async (messageId: string) => {
    setOrderPicker(messageId);
    if (!orders) setOrders(await readJson<Order[]>("/api/admin/orders"));
  };

  useEffect(() => {
    load().catch((err) => setError(errorText(err))).finally(() => setLoading(false));
  }, []);

  const resetComposer = () => {
    setTo("");
    setCc("");
    setBcc("");
    setShowCopyFields(false);
    setFiles([]);
    setSubject("");
    setHtml("");
    setText("");
    setFiles([]);
    setMode("new");
  };

  const openThread = async (threadId: string) => {
    const request = ++threadRequest.current;
    setComposing(false);
    setSelectedId(threadId);
    setOrderPicker(null);
    setError("");
    const next = await readJson<ThreadBundle>(`/api/admin/inbox/${threadId}`);
    if (request !== threadRequest.current) return;
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
    const keep = (value: string) => value.split(/[,;]/).map((part) => part.trim()).filter((address) =>
      address && !ours.has(address.toLowerCase()) && !/^order-[0-9a-f-]{36}@stitchhandmade\.shop$/i.test(address)
    );
    setShowCopyFields(nextMode === "replyAll");
    setError("");
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
    const fromWebsite = latest?.kind === "contact" || latest?.kind === "problem_report";
    setTo(fromWebsite ? recipient : keep(recipient).join(", "));
    setCc(nextMode === "replyAll" ? [...keep(latest?.to || ""), ...keep(latest?.cc || "")].join(", ") : "");
    setBcc("");
  };

  const archive = async (archived: boolean) => {
    if (!selectedId) return;
    setSending(true);
    try {
      await changeThread(selectedId, archived ? "archive" : "restore");
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
      await changeThread(selectedId, "delete");
      setBundle(null);
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const selectedThreads = threads.filter((thread) => checkedIds.has(thread.threadId));
  const selectedCount = selectedThreads.length;

  const applyBulkAction = async (action: MailAction) => {
    if (bulkAction || selectedCount === 0) return;
    const selection = `${selectedCount} ${selectedCount === 1 ? "conversation" : "conversations"}`;
    if (action === "delete" && !window.confirm(`Permanently delete ${selection} and their attachments?`)) return;

    threadRequest.current += 1;
    setSelectedId(null);
    setBulkAction(action);
    setBulkStatus("");
    setError("");
    const completed = new Set<string>();
    try {
      for (let index = 0; index < selectedCount; index += 5) {
        const batch = selectedThreads.slice(index, index + 5);
        await Promise.allSettled(batch.map(async ({ threadId }) => {
          await changeThread(threadId, action);
          completed.add(threadId);
        }));
      }

      setThreads((current) => current.filter(({ threadId }) => !completed.has(threadId)));
      setCheckedIds(new Set(selectedThreads
        .filter(({ threadId }) => !completed.has(threadId))
        .map(({ threadId }) => threadId)));

      const verb = { archive: "Archived", restore: "Moved to inbox", delete: "Deleted" }[action];
      if (completed.size > 0) {
        setBulkStatus(`${verb} ${completed.size} ${completed.size === 1 ? "conversation" : "conversations"}.`);
      }
      const failed = selectedCount - completed.size;
      if (failed > 0) {
        setError(`Could not update ${failed} ${failed === 1 ? "conversation" : "conversations"}. Try again with the remaining selection.`);
      }
    } finally {
      setBulkAction(null);
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

  const composeTitle = {
    new: "New message", reply: "Reply", replyAll: "Reply all", forward: "Forward",
  }[mode];

  const closeComposer = () => {
    if ((to || cc || bcc || subject || text.trim() || html || files.length) &&
      !window.confirm("Discard this draft?")) return;
    for (const file of files) void removeFile(file.key);
    resetComposer();
    setComposing(false);
    setError("");
  };

  const composer = (
    <section aria-labelledby="compose-title" className="space-y-4 rounded-2xl border border-border bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 id="compose-title" className="font-display text-lg font-bold">{composeTitle}</h3>
        <Button type="button" size="icon" variant="ghost" aria-label="Close composer"
          disabled={sending} onClick={closeComposer}><X className="h-4 w-4" /></Button>
      </div>
      <div className="grid gap-3">
        <label className="grid items-center gap-1 text-sm font-medium sm:grid-cols-[4rem_1fr]">
          From
          <select className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm" value={from}
            onChange={(event) => setFrom(event.target.value)}>
            {INBOX_FROM_ADDRESSES.map((address) => <option key={address} value={address}>{address}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2 sm:items-center">
          <label className="grid min-w-0 flex-1 items-center gap-1 text-sm font-medium sm:grid-cols-[4rem_1fr]">
            To
            <Input value={to} autoFocus={mode === "new"} onChange={(event) => setTo(event.target.value)} />
          </label>
          <Button type="button" size="sm" variant="ghost" aria-expanded={showCopyFields}
            onClick={() => setShowCopyFields((open) => !open)}>Cc / Bcc</Button>
        </div>
        {showCopyFields && (
          <>
            <label className="grid items-center gap-1 text-sm font-medium sm:grid-cols-[4rem_1fr]">
              Cc <Input value={cc} onChange={(event) => setCc(event.target.value)} />
            </label>
            <label className="grid items-center gap-1 text-sm font-medium sm:grid-cols-[4rem_1fr]">
              Bcc <Input value={bcc} onChange={(event) => setBcc(event.target.value)} />
            </label>
          </>
        )}
        <label className="grid items-center gap-1 text-sm font-medium sm:grid-cols-[4rem_1fr]">
          Subject <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
        </label>
      </div>
      <Editor key={`${mode}-${selectedId ?? "new"}`}
        focusOnMount={mode === "reply" || mode === "replyAll"}
        onChange={(nextHtml, nextText) => { setHtml(nextHtml); setText(nextText); }} />
      <input ref={fileInput} type="file" multiple hidden onChange={(event) => {
        uploadFiles(event.target.files).catch((err) => setError(errorText(err)));
        event.target.value = "";
      }} />
      {files.length > 0 && <div className="flex flex-wrap gap-2">
        {files.map((file) => (
          <Button key={file.key} type="button" size="sm" variant="outline" className="max-w-full"
            aria-label={`Remove attachment ${file.filename}`} onClick={() => removeFile(file.key)}>
            <span className="truncate">{file.filename}</span><X className="h-4 w-4 shrink-0" />
          </Button>
        ))}
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
          <Paperclip className="h-4 w-4" /> Attach files
        </Button>
        <Button type="button" disabled={sending || !to.trim()} onClick={send}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      {error && !composing && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(mailboxes) as Mailbox[]).map((mailbox) => (
          <Button key={mailbox} type="button" variant={box === mailbox ? "default" : "outline"}
            className={`rounded-xl ${box === mailbox ? "border-[#2D9950] bg-[#2D9950] text-white hover:border-[#2D9950] hover:bg-[#2D9950]" : ""}`}
            disabled={bulkAction !== null} onClick={() => void switchBox(mailbox)}>
            {mailboxes[mailbox]}
          </Button>
        ))}
        <Button type="button" variant="outline" className="rounded-xl" disabled={bulkAction !== null} onClick={() => { setComposing(true); setBundle(null); setSelectedId(null); resetComposer(); }}>Compose</Button>
      </div>

      {bulkStatus && <p role="status" className="text-sm text-muted-foreground">{bulkStatus}</p>}

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
          {!bundle.thread.spam && !composing && <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" className="rounded-xl" onClick={() => startReply("reply")}>Reply</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => startReply("replyAll")}>Reply all</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => startReply("forward")}>Forward</Button>
          </div>}
          {composing && mode !== "new" ? <div className="mt-4">{composer}</div> : null}
          <div className="mt-6 space-y-3">
            {bundle.messages.map((message) => (
              <article key={message.id} className={`rounded-2xl border p-4 ${message.direction === "in" ? "bg-muted/40" : "bg-white"}`}>
                {message.kind === "problem_report" && (
                  <h3 className="mb-2 font-semibold text-[#D11C30]">From Report a Problem</h3>
                )}
                <p className="text-xs text-muted-foreground">
                  {message.from} → {message.to}
                  {message.cc ? ` · cc ${message.cc}` : ""}
                  {" · "}{new Date(message.createdAt).toLocaleString()}
                  {message.spam ? (message.id.startsWith("ses-spam-") ? " · SES spam check failed" : " · spam or virus check failed") : ""}
                  {message.delivered === false ? " · not delivered" : ""}
                </p>
                {message.subject !== bundle.thread.subject && <p className="mt-1 text-sm font-semibold">{message.subject}</p>}
                {bundle.thread.spam ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm">{message.text}</p>
                ) : (
                  <>
                    <MailBody message={message} />
                    <AttachmentList message={message} />
                  </>
                )}
                {message.deliveryError && <p className="mt-2 text-sm text-destructive">{message.deliveryError}</p>}
                {message.direction === "in" && !bundle.thread.spam && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {orderPicker !== message.id ? (
                      <Button size="sm" variant="outline" className="rounded-xl"
                        onClick={() => showOrders(message.id).catch((err) => {
                          setOrderPicker(null);
                          setError(errorText(err));
                        })}>
                        Attach to order
                      </Button>
                    ) : !orders ? (
                      <span className="text-sm text-muted-foreground">Loading orders…</span>
                    ) : orders.length === 0 ? (
                      <span className="text-sm text-muted-foreground">No orders available.</span>
                    ) : orders.map((order) => (
                      <Button key={order.id} size="sm" variant="ghost" className="rounded-xl" onClick={() => attach(message.id.startsWith("ses-spam-") ? message.id : message.messageId || message.id, order.id)}>
                        Add to {order.name}
                      </Button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>

        </div>
      ) : composing ? null : (
        <div className="overflow-hidden rounded-3xl border border-border bg-white">
          {threads.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">{box === "spam" ? "No spam messages." : box === "archive" ? "Nothing is archived." : "The inbox is empty."}</p>
          ) : (
            <div className="divide-y">
              <div className="flex flex-wrap items-center gap-3 p-4" aria-busy={bulkAction !== null}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={selectedCount === threads.length ? true : selectedCount > 0 ? "indeterminate" : false}
                    className="relative data-[state=indeterminate]:after:absolute data-[state=indeterminate]:after:inset-x-0.5 data-[state=indeterminate]:after:top-1/2 data-[state=indeterminate]:after:h-0.5 data-[state=indeterminate]:after:bg-current data-[state=indeterminate]:[&_svg]:hidden"
                    disabled={bulkAction !== null}
                    onCheckedChange={(checked) => setCheckedIds(new Set(
                      checked === true ? threads.map(({ threadId }) => threadId) : [],
                    ))}
                  />
                  Select all
                </label>
                {selectedCount > 0 && (
                  <>
                    <span className="text-sm text-muted-foreground" aria-live="polite">{selectedCount} selected</span>
                    <Button size="sm" variant="outline" disabled={bulkAction !== null}
                      onClick={() => void applyBulkAction(box === "inbox" ? "archive" : "restore")}>
                      {box === "inbox" ? "Archive selected" : "Move selected to inbox"}
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" disabled={bulkAction !== null}
                      onClick={() => void applyBulkAction("delete")}>
                      Delete selected
                    </Button>
                    {bulkAction && <Loader2 aria-label="Updating conversations" className="h-4 w-4 animate-spin" />}
                  </>
                )}
              </div>
              {threads.map((thread) => (
                <div key={thread.threadId} className="flex items-center pl-4 hover:bg-muted/30">
                  <Checkbox
                    aria-label={`Select ${thread.subject} from ${thread.correspondent || "unknown sender"}`}
                    checked={checkedIds.has(thread.threadId)}
                    disabled={bulkAction !== null}
                    onCheckedChange={(checked) => setCheckedIds((current) => {
                      const next = new Set(current);
                      if (checked === true) next.add(thread.threadId);
                      else next.delete(thread.threadId);
                      return next;
                    })}
                  />
                  <button type="button" disabled={bulkAction !== null}
                    onClick={() => openThread(thread.threadId).catch((err) => setError(errorText(err)))}
                    className="flex min-w-0 flex-1 items-center justify-between gap-4 p-4 text-left">
                    <span>
                      <span className="font-semibold">{thread.correspondent || "(no sender)"}</span>
                      <span className={`block text-sm ${thread.subject === PROBLEM_REPORT_SUBJECT ? "font-bold text-[#D11C30]" : ""}`}>{thread.subject}</span>
                      <span className="block text-sm text-muted-foreground">{thread.snippet}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {thread.unreadCount > 0 ? <span className="mr-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">{thread.unreadCount}</span> : null}
                      {new Date(thread.lastMessageAt).toLocaleDateString()}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
