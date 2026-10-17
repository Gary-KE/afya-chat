import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only database access. The service role key never reaches the browser,
 * and row-level security is on with no public policies, so the database can only
 * be read through these API routes. If Supabase isn't configured the app still
 * works; it just doesn't save conversations.
 */
let client: SupabaseClient | null | undefined;
export function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

export type Channel = "web" | "whatsapp";
export type Conversation = { id: string; channel: Channel; contact_masked: string | null; language: string; red_flag: boolean; created_at: string; updated_at: string; last_message?: string | null };

/** Web chats are found by id; WhatsApp chats by the hashed phone number. */
export async function findOrCreateConversation(opts: { id?: string | null; channel: Channel; contactHash?: string; contactMasked?: string; language: string }): Promise<string | null> {
  const d = db(); if (!d) return null;
  if (opts.id) {
    const { data } = await d.from("conversations").select("id").eq("id", opts.id).eq("channel", "web").maybeSingle();
    if (data) return data.id;
  }
  if (opts.contactHash) {
    const { data } = await d.from("conversations").select("id").eq("channel", opts.channel).eq("contact_hash", opts.contactHash).maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await d.from("conversations").insert({
    channel: opts.channel, contact_hash: opts.contactHash ?? null, contact_masked: opts.contactMasked ?? null, language: opts.language
  }).select("id").single();
  if (error) { console.error("create conversation", error.message); return null; }
  return data.id;
}

export async function addMessage(conversationId: string | null, role: "user" | "assistant", content: string, redFlag = false) {
  const d = db(); if (!d || !conversationId) return;
  await d.from("messages").insert({ conversation_id: conversationId, role, content: content.slice(0, 4000) });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (redFlag) patch.red_flag = true;
  await d.from("conversations").update(patch).eq("id", conversationId);
}

/** The last few turns, oldest first, so the model remembers the conversation. */
export async function recentMessages(conversationId: string | null, limit = 10): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const d = db(); if (!d || !conversationId) return [];
  const { data } = await d.from("messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(limit);
  return (data || []).reverse() as { role: "user" | "assistant"; content: string }[];
}

export async function listConversations(limit = 50): Promise<Conversation[]> {
  const d = db(); if (!d) return [];
  const { data } = await d.from("conversations").select("id, channel, contact_masked, language, red_flag, created_at, updated_at").order("updated_at", { ascending: false }).limit(limit);
  const rows = (data || []) as Conversation[];
  await Promise.all(rows.map(async r => {
    const { data: m } = await d.from("messages").select("content").eq("conversation_id", r.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    r.last_message = m?.content ?? null;
  }));
  return rows;
}

export async function conversationMessages(id: string) {
  const d = db(); if (!d) return [];
  const { data } = await d.from("messages").select("role, content, created_at").eq("conversation_id", id).order("created_at", { ascending: true }).limit(200);
  return data || [];
}
