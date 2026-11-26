import { invoiceDueHtml } from "@shared/invoice-terms";
import { INVOICE_LOGO_HTML } from "@shared/branding";
import type { Order, OrderItem } from "@shared/schema";

export const INVOICE_PAYMENT_PLACEHOLDER = "[Add payment details]";
const businessEmail = "order@stitchhandmade.shop";
const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const date = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "Australia/Sydney" });

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export type InvoiceDraft = { to: string; subject: string; html: string };

export function createInvoiceDraft(order: Order, items: OrderItem[], dueDays: number): InvoiceDraft {
  const invoiceNumber = `INV-${order.id.toUpperCase()}`;
  let subtotal = 0;
  const rows = items.map((item) => {
    const unitPrice = item.unitPrice ?? item.priceAtTime ?? 0;
    const amount = unitPrice * item.quantity;
    subtotal += amount;
    const options = (item.options ?? []).map(({ name, choice }) => `${name}: ${choice}`).join(", ");
    const name = escapeHtml(item.productName || "Item");
    return `<tr><td>${name}${options ? ` (${escapeHtml(options)})` : ""}</td><td>${item.quantity}</td><td>${money.format(unitPrice / 100)}</td><td>${money.format(amount / 100)}</td></tr>`;
  }).join("");
  const shipping = order.shippingAmount ?? order.totalAmount - subtotal;
  const address = escapeHtml(order.address).replace(/\r?\n/g, "<br>");
  const postcode = order.shippingPostcode ? `<br>Postcode ${escapeHtml(order.shippingPostcode)}` : "";

  return {
    to: order.email,
    subject: `STITCH payment invoice ${invoiceNumber}`,
    html: `${INVOICE_LOGO_HTML}
<h2>STITCH — Payment Invoice</h2>
<p><strong>Invoice number</strong> ${escapeHtml(invoiceNumber)}<br>
<strong>Order reference</strong> ${escapeHtml(order.id)}<br>
<strong>Order date</strong> ${date.format(new Date(order.createdAt))}<br>
<strong>Payment due</strong> ${invoiceDueHtml(dueDays)}</p>
<p><strong>From</strong><br>STITCH<br>${businessEmail}</p>
<p><strong>Bill to</strong><br>${escapeHtml(order.name)}<br>${escapeHtml(order.email)}</p>
<p><strong>Ship to</strong><br>${address}${postcode}</p>
<table cellpadding="6" cellspacing="0" border="1">
<thead><tr><th>Item</th><th>Quantity</th><th>Unit price (AUD)</th><th>Amount (AUD)</th></tr></thead>
<tbody>${rows}
<tr><th colspan="3" align="left">Subtotal</th><td>${money.format(subtotal / 100)}</td></tr>
<tr><th colspan="3" align="left">Shipping</th><td>${money.format(shipping / 100)}</td></tr>
<tr><th colspan="3" align="left">Total due</th><td><strong>${money.format(order.totalAmount / 100)}</strong></td></tr>
</tbody></table>
<h3>How to pay</h3>
<p><strong>Payment details</strong> ${INVOICE_PAYMENT_PLACEHOLDER}<br>
<strong>Payment reference</strong> ${escapeHtml(invoiceNumber)}</p>
<p>We’ll begin making your order once payment has been received. If you have any questions, reply to this email.</p>
<p>Thank you for shopping with STITCH!</p>`,
  };
}
