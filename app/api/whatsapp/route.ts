import { completeChat } from "@/lib/llm";
import { findRedFlags, guessLang, emergencyReply, systemPrompt, DISCLAIMER } from "@/lib/triage";
import { findOrCreateConversation, addMessage, recentMessages } from "@/lib/db";
import { hashContact, maskPhone } from "@/lib/privacy";
import { validTwilioSignature, twimlMessage } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const xml = (text: string) => new Response(twimlMessage(text), { headers: { "Content-Type": "text/xml; charset=utf-8" } });

/** Twilio calls this URL every time someone sends a WhatsApp message to our number. */
export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === "string") params[k] = v; });

  // 1. Only accept genuine Twilio requests.
  const url = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, "") + "/api/whatsapp" : req.url;
  if (!validTwilioSignature(url, params, req.headers.get("x-twilio-signature") || "", process.env.TWILIO_AUTH_TOKEN || "")) {
    return new Response("Forbidden", { status: 403 });
  }

  const from = params.From || "", text = (params.Body || "").trim().slice(0, 1000);
  if (!text) return xml("Hi! I'm Afya. Tell me how you're feeling and I'll help you decide what to do. " + DISCLAIMER);

  // 2. Find this person's conversation by a salted hash of their number.
  const lang = guessLang(text);
  const flags = findRedFlags(text);
  const conversationId = await findOrCreateConversation({ channel: "whatsapp", contactHash: hashContact(from, process.env.CONTACT_SALT || "afya"), contactMasked: maskPhone(from), language: lang });
  const history = await recentMessages(conversationId, 8);
  await addMessage(conversationId, "user", text, flags.length > 0);

  // 3. Emergencies first; otherwise ask the model with the recent history.
  let reply: string;
  if (flags.length) reply = emergencyReply(flags, lang);
  else {
    try {
      reply = await completeChat([{ role: "system", content: systemPrompt(lang, "whatsapp") }, ...history, { role: "user", content: text }]);
    } catch (e) {
      console.error(e);
      reply = lang === "sw" ? "Samahani, kuna tatizo kidogo. Tafadhali jaribu tena baada ya dakika moja." : "Sorry, I'm having trouble right now. Please try again in a minute.";
    }
    if (history.length === 0) reply += "\n\n" + DISCLAIMER;
  }
  await addMessage(conversationId, "assistant", reply);
  return xml(reply);
}
