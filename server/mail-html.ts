import sanitizeHtml from "sanitize-html";
import type { MailAttachment } from "@shared/schema";
import { signedGet } from "./mail-files";

const allowedTags = sanitizeHtml.defaults.allowedTags.concat([
  "img", "span", "font", "center", "style", "h1", "h2", "u", "s", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
]);

export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

export function sanitizeMailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      "*": ["style", "class", "align", "valign", "width", "height", "bgcolor", "border", "cellpadding", "cellspacing", "colspan", "rowspan"],
      a: ["href", "name", "target"],
      img: ["src", "alt", "width", "height"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowVulnerableTags: true,
  });
}

function sameCid(left: string, right: string): boolean {
  return left.replace(/[<>]/g, "").trim().toLowerCase() === right.replace(/[<>]/g, "").trim().toLowerCase();
}

export async function renderMailHtml(html: string, attachments: MailAttachment[]): Promise<string> {
  let rendered = html;
  for (const file of attachments) {
    if (!file.contentId) continue;
    const url = await signedGet(file.key);
    if (!url) continue;
    rendered = rendered.replace(/cid:([^"'>\s]+)/gi, (match, cid: string) => sameCid(cid, file.contentId || "") ? url : match);
  }
  return sanitizeMailHtml(rendered);
}
