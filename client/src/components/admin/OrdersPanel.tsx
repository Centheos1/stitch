import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import type { Order, OrderItem, OrderMessage } from "@shared/schema";
import { AttachmentList, MailBody } from "@/components/admin/MailBody";
import { Loader2 } from "lucide-react";

type OrderBundle = { order: Order; items: OrderItem[]; messages: OrderMessage[] };

const STATUSES = ["approved", "paid", "fulfilled", "declined"] as const;

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function readJson<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await apiRequest(method, path, body);
  return res.json() as Promise<T>;
}

export function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<OrderBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);

  const loadLists = async () => {
    setOrders(await readJson<Order[]>("/api/admin/orders"));
  };

  const openOrder = async (id: string) => {
    setSelectedId(id);
    setError("");
    const next = await readJson<OrderBundle>(`/api/admin/orders/${id}`);
    setBundle(next);
    setOrders((current) => current.map((order) => order.id === id ? { ...order, unreadCount: 0 } : order));
  };

  useEffect(() => {
    loadLists()
      .catch(() => setError("Could not load orders."))
      .finally(() => setLoading(false));
  }, []);

  const send = async (kind: "question" | "reply" | "payment_request") => {
    if (!selectedId) return;
    setSending(true);
    setError("");
    try {
      const amountCents = Math.round(Number(amount) * 100);
      await readJson(`/api/admin/orders/${selectedId}/messages`, "POST", {
        kind,
        text,
        amountCents: kind === "payment_request" ? amountCents : undefined,
      });
      setText("");
      setAmount("");
      await openOrder(selectedId);
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Could not send.");
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status: string) => {
    if (!selectedId) return;
    setSending(true);
    setError("");
    try {
      await readJson(`/api/admin/orders/${selectedId}/status`, "POST", { status });
      await openOrder(selectedId);
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Could not update the order.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-muted-foreground"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-destructive text-sm">{error}</p>}

      {bundle && selectedId ? (
        <div className="bg-white rounded-3xl border border-border p-6">
          <Button variant="outline" size="sm" className="rounded-xl mb-4" onClick={() => { setBundle(null); setSelectedId(null); }}>
            All orders
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold">{bundle.order.name}</h2>
              <p className="text-sm text-muted-foreground">{bundle.order.email}</p>
              <p className="text-sm text-muted-foreground">{bundle.order.address}</p>
            </div>
            <div className="text-right">
              <p className="font-bold">{money(bundle.order.totalAmount)}</p>
              <p className="text-sm capitalize">{bundle.order.status.replaceAll("_", " ")}</p>
              {bundle.order.paymentRequestAmount ? (
                <p className="text-sm">Payment asked: {money(bundle.order.paymentRequestAmount)}</p>
              ) : null}
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {bundle.items.map((item) => (
              <li key={item.id} className="text-sm">
                {item.quantity} × {item.productName || "Item"} — {money(item.unitPrice ?? item.priceAtTime ?? 0)}
                {(item.options ?? []).length > 0 && (
                  <span className="text-muted-foreground"> ({(item.options ?? []).map((option) => `${option.name}: ${option.choice}`).join(", ")})</span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <AlertDialog key={status}>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="rounded-xl capitalize" disabled={sending}>
                    Mark {status}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm status change</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to mark this order {status}?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => setStatus(status)}>Yes</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ))}
          </div>
          <div className="mt-6 space-y-3">
            {bundle.messages.map((message) => (
              <article key={message.id} className={`rounded-2xl border p-4 ${message.direction === "in" ? "bg-muted/40" : "bg-white"}`}>
                <p className="text-xs text-muted-foreground">
                  {message.direction === "in" ? "From customer" : "Sent"} · {new Date(message.createdAt).toLocaleString()}
                  {message.spam ? " · spam check failed" : ""}
                  {message.delivered === false ? " · not delivered" : ""}
                </p>
                <p className="font-semibold text-sm mt-1">{message.subject}</p>
                <MailBody message={message} />
                <AttachmentList message={message} />
                {message.deliveryError && <p className="mt-2 text-sm text-destructive">{message.deliveryError}</p>}
              </article>
            ))}
          </div>
          <div className="mt-6 space-y-3">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write a question, a reply, or payment instructions"
              className="w-full min-h-28 rounded-2xl border border-border p-4 text-sm"
            />
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Payment amount, e.g. 24.00" className="rounded-xl" />
            <div className="flex flex-wrap gap-2">
              <Button className="rounded-xl" disabled={sending || !text.trim()} onClick={() => send("question")}>Send question</Button>
              <Button variant="outline" className="rounded-xl" disabled={sending || !text.trim()} onClick={() => send("reply")}>Send reply</Button>
              <Button variant="outline" className="rounded-xl" disabled={sending || !text.trim() || !amount} onClick={() => send("payment_request")}>Request payment</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-border overflow-hidden">
          {orders.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No orders yet.</p>
          ) : (
            <div className="divide-y">
              {orders.map((order) => (
                <button key={order.id} type="button" onClick={() => openOrder(order.id)} className="w-full text-left p-4 hover:bg-muted/30 flex items-center justify-between gap-4">
                  <span>
                    <span className="font-semibold">{order.name}</span>
                    <span className="block text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleString()} · {order.status.replaceAll("_", " ")}</span>
                  </span>
                  <span className="font-bold">
                    {(order.unreadCount ?? 0) > 0 ? <span className="mr-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">{order.unreadCount}</span> : null}
                    {money(order.totalAmount)}
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
