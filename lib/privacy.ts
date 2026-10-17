import { createHash } from "node:crypto";

/**
 * Phone numbers are personal data (Kenya Data Protection Act, 2019).
 * We never store the raw number: we keep a salted hash to find the conversation
 * again, and a masked version (+2547••••234) so the dashboard can tell chats apart.
 */
export function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "");
  if (/^0\d{9}$/.test(digits)) return "+254" + digits.slice(1);
  if (/^254\d{9}$/.test(digits)) return "+" + digits;
  return digits;
}

export function hashContact(raw: string, salt: string): string {
  return createHash("sha256").update(salt + "|" + normalizePhone(raw)).digest("hex");
}

export function maskPhone(raw: string): string {
  const p = normalizePhone(raw);
  if (p.length < 8) return "••••";
  return p.slice(0, 5) + "••••" + p.slice(-3);
}
