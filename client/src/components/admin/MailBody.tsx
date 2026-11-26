import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { OrderMessage } from "@shared/schema";
import { Button } from "@/components/ui/button";

export function MailBody({ message }: { message: OrderMessage }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!message.htmlKey) return;
    setHtml(null);
    let cancelled = false;
    apiRequest("GET", `/api/admin/mail/messages/${message.id}/body`)
      .then((res) => res.json() as Promise<{ html: string }>)
      .then((body) => {
        if (!cancelled) setHtml(body.html || "");
      })
      .catch(() => {
        if (!cancelled) setHtml("");
      });
    return () => {
      cancelled = true;
    };
  }, [message.id, message.htmlKey]);

  if (!message.htmlKey || html === "") return <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>;
  if (html === null) return <p className="mt-2 text-sm text-muted-foreground">Loading message…</p>;
  return (
    <iframe
      sandbox=""
      srcDoc={html}
      title={message.subject || "Email"}
      className="mt-2 h-96 w-full rounded-xl border border-border bg-white"
    />
  );
}

export function AttachmentList({ message }: { message: OrderMessage }) {
  const files = message.attachments ?? [];
  if (files.length === 0) return null;

  const download = async (id: string, filename: string) => {
    const res = await apiRequest("GET", `/api/admin/mail/messages/${message.id}/attachments/${id}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {files.map((file) => (
        <Button key={file.id} type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => download(file.id, file.filename)}>
          {file.filename} ({Math.max(1, Math.round(file.size / 1024))} KB)
        </Button>
      ))}
    </div>
  );
}
