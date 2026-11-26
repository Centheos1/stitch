export const STITCH_LOGO_PATH = "/images/fe519ba2e15291847007a47adb5bac4169abae96080eb5c8c0a6e178b787d985.png";
export const STITCH_LOGO_URL = `https://stitchhandmade.shop${STITCH_LOGO_PATH}`;
export const INVOICE_LOGO_HTML = `<p><img src="${STITCH_LOGO_URL}" alt="STITCH logo" width="96" height="88"></p>`;

export function isPaymentInvoice(text: string): boolean {
  return /^(?:STITCH\s*[—–-]\s*)?Payment Invoice\b/i.test(text.trim());
}
