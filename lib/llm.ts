import { sseToText } from "./sse";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function config() {
  const base = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "llama-3.1-8b-instant";
  if (!key) throw new Error("LLM_API_KEY is not set");
  return { base: base.replace(/\/$/, ""), key, model };
}

async function call(messages: ChatMessage[], stream: boolean, signal?: AbortSignal) {
  const { base, key, model } = config();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, stream, temperature: 0.3, max_tokens: 500 }),
    signal
  });
  if (!res.ok) throw new Error(`AI service error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

/** Streaming answer for the web chat: text arrives piece by piece. */
export async function streamChat(messages: ChatMessage[], signal?: AbortSignal): Promise<ReadableStream<string>> {
  const res = await call(messages, true, signal);
  if (!res.body) throw new Error("AI service returned no body");
  return sseToText(res.body);
}

/** Whole answer at once, for WhatsApp (Twilio needs the full reply). */
export async function completeChat(messages: ChatMessage[]): Promise<string> {
  const res = await call(messages, false, AbortSignal.timeout(12000));
  const json = await res.json();
  return String(json?.choices?.[0]?.message?.content || "").trim();
}
