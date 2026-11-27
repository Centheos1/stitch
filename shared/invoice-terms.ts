import { z } from "zod";

export const DEFAULT_INVOICE_TERMS_DAYS = 14;
export const invoiceTermsSchema = z.object({
  days: z.number().int().min(0).max(365),
  paymentDetails: z.string().trim().max(1000, "Use at most 1,000 characters for payment details.").optional(),
});
export type InvoiceTerms = z.infer<typeof invoiceTermsSchema>;
export const invoiceNumberSchema = z.string().regex(/^\d{6}$/);
export const invoiceDraftSettingsSchema = invoiceTermsSchema.extend({ invoiceNumber: invoiceNumberSchema });

const sydneyDate = new Intl.DateTimeFormat("en-AU", {
  day: "numeric", month: "numeric", year: "numeric", timeZone: "Australia/Sydney",
});
const dueDate = new Intl.DateTimeFormat("en-AU", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
});

export function invoicePaymentDue(days: number, sentAt = new Date()): string {
  const parts = Object.fromEntries(sydneyDate.formatToParts(sentAt).map(({ type, value }) => [type, value]));
  return dueDate.format(new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days)));
}

export function invoiceDueHtml(days: number): string {
  return `<span data-invoice-due="true">${invoicePaymentDue(days)}</span>`;
}
