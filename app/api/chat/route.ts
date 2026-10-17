import { streamChat, type ChatMessage } from "@/lib/llm";
import { findRedFlags, guessLang, emergencyReply, systemPrompt } from "@/lib/triage";
import { findOrCreateConversation, addMessage } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Best-effort limit: 20 messages a minute per visitor (per server instance). */
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now); hits.set(ip, list);
  return list.length > 20;
}

type Incoming = { conversationId?: string; messages?: { role?: string; content?: string }[] };

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return Response.json({ error: "Too many messages. Please wait a minute." }, { status: 429 });

  let body: Incoming;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }

  // Only trust what we expect: user/assistant turns, short text, last 10 turns.
  const history: ChatMessage[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-10)
    .map(m => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 1000) }));
  const last = history.at(-1);
  if (!last || last.role !== "user") return Response.json({ error: "Send a message first." }, { status: 400 });

  const lang = guessLang(last.content);
  const flags = findRedFlags(last.content);
  const id = typeof body.conversationId === "string" && /^[0-9a-f-]{36}$/i.test(body.conversationId) ? body.conversationId : null;
  const conversationId = await findOrCreateConversation({ id, channel: "web", language: lang });
  await addMessage(conversationId, "user", last.content, flags.length > 0);

  const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "x-conversation-id": conversationId || "", "x-red-flag": flags.join(",") };

  // Emergencies are answered by our own rules, instantly, without the model.
  if (flags.length) {
    const text = emergencyReply(flags, lang);
    await addMessage(conversationId, "assistant", text);
    return new Response(text, { headers });
  }

  let pieces: ReadableStream<string>;
  try {
    pieces = await streamChat([{ role: "system", content: systemPrompt(lang, "web") }, ...history], req.signal);
  } catch (e) {
    console.error(e);
    return Response.json({ error: "The assistant is busy right now. Please try again in a moment." }, { status: 502 });
  }

  // Send each piece to the browser as it arrives, and save the full answer at the end.
  let full = "";
  const encoder = new TextEncoder();
  const out = pieces.pipeThrough(new TransformStream<string, Uint8Array>({
    transform(piece, controller) { full += piece; controller.enqueue(encoder.encode(piece)); },
    async flush() { if (full) await addMessage(conversationId, "assistant", full); }
  }));
  return new Response(out, { headers });
}
