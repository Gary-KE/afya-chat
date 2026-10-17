import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio signs every webhook. Anyone can POST to our URL, so we only answer
 * requests whose X-Twilio-Signature matches: HMAC-SHA1 (auth token) of the full URL
 * followed by every form field name and value, sorted by name, then base64.
 */
export function validTwilioSignature(url: string, params: Record<string, string>, signature: string, authToken: string): boolean {
  if (!signature || !authToken) return false;
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** TwiML reply: Twilio sends this text back to the person on WhatsApp. */
export function twimlMessage(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xml(text.slice(0, 1500))}</Message></Response>`;
}
