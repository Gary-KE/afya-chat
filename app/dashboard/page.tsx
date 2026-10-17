"use client";
import { useCallback, useEffect, useState } from "react";

type Conversation = { id: string; channel: "web" | "whatsapp"; contact_masked: string | null; language: string; red_flag: boolean; updated_at: string; last_message?: string | null };
type Message = { role: "user" | "assistant"; content: string; created_at: string };

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(iso).toLocaleDateString("en-KE");
};

/** Clinician view: every conversation from web and WhatsApp, red flags first. Refreshes every 5 seconds. */
export default function Dashboard() {
  const [rows, setRows] = useState<Conversation[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/conversations", { cache: "no-store" });
    if (res.ok) setRows((await res.json()).conversations);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const get = async () => { const r = await fetch(`/api/conversations/${open}`, { cache: "no-store" }); if (r.ok && alive) setThread((await r.json()).messages); };
    get(); const t = setInterval(get, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [open]);

  const sorted = [...rows].sort((a, b) => Number(b.red_flag) - Number(a.red_flag) || b.updated_at.localeCompare(a.updated_at));
  const today = rows.filter(r => Date.now() - new Date(r.updated_at).getTime() < 86400000).length;

  return (
    <main className="dash">
      <h1>Afya conversations</h1>
      <div className="stats">
        <div className="stat"><b>{rows.length}</b><span>Conversations</span></div>
        <div className="stat"><b>{rows.filter(r => r.red_flag).length}</b><span>Red flags</span></div>
        <div className="stat"><b>{rows.filter(r => r.channel === "whatsapp").length}</b><span>On WhatsApp</span></div>
        <div className="stat"><b>{today}</b><span>Active today</span></div>
      </div>
      <div className="split">
        <div className="list">
          {loaded && rows.length === 0 && <p className="empty">No conversations yet. Send a message from the chat page or WhatsApp and it appears here within 5 seconds.</p>}
          {sorted.map(r => (
            <button key={r.id} className="row" type="button" aria-pressed={open === r.id} onClick={() => setOpen(r.id)}>
              <span className="meta">
                <span className="tag">{r.channel === "whatsapp" ? "WhatsApp" : "Web"}</span>
                {r.red_flag && <span className="tag red">Red flag</span>}
                <span>{r.contact_masked || "Web visitor"}</span><span>· {r.language === "sw" ? "Kiswahili" : "English"}</span><span>· {ago(r.updated_at)}</span>
              </span>
              <p>{r.last_message || "…"}</p>
            </button>
          ))}
        </div>
        <section className="thread" aria-label="Conversation">
          {!open && <p className="empty">Choose a conversation to read it.</p>}
          {open && thread.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content}</div>)}
        </section>
      </div>
    </main>
  );
}
