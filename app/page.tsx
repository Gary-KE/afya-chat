"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; emergency?: boolean };

const STARTERS = ["My child has had a fever since yesterday", "Nina maumivu ya kichwa na homa", "Is this rash something to worry about?", "Headache for 3 days"];

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const conversationId = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { conversationId.current = sessionStorage.getItem("afya-conversation"); } catch {} }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(""); setInput(""); setBusy(true);
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages([...next, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId.current, messages: next.map(({ role, content }) => ({ role, content })) })
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error || "Something went wrong. Please try again.");
      const id = res.headers.get("x-conversation-id");
      if (id) { conversationId.current = id; try { sessionStorage.setItem("afya-conversation", id); } catch {} }
      const emergency = !!res.headers.get("x-red-flag");
      // Read the answer piece by piece and show it as it arrives.
      const reader = res.body.getReader(), decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: answer, emergency }]);
      }
    } catch (e) {
      setMessages(next);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  return (
    <main className="chat">
      <header className="top">
        <div className="brand"><span className="logo" aria-hidden="true">A</span><div><b>Afya Chat</b><small>Health guidance · English &amp; Kiswahili</small></div></div>
        <a href="/dashboard">Dashboard</a>
      </header>

      <div className="log" ref={logRef} aria-live="polite">
        {messages.length === 0 && (
          <div className="hello">
            <h1>How are you feeling today?</h1>
            <p>Describe your symptoms and I’ll help you decide what to do next: care at home, a clinic visit, or hospital now. You can write in English or Kiswahili. The same assistant answers on WhatsApp.</p>
            <div className="chips">{STARTERS.map(s => <button key={s} className="chip" type="button" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}${m.emergency ? " emergency" : ""}${busy && i === messages.length - 1 && m.role === "assistant" ? " typing" : ""}`}>{m.content}</div>
        ))}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div>
        <form className="composer" onSubmit={e => { e.preventDefault(); send(input); }}>
          <label htmlFor="msg" className="sr-only" style={{ position: "absolute", left: -9999 }}>Your message</label>
          <textarea id="msg" rows={1} value={input} maxLength={1000} placeholder="Type how you feel…" onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
          <button className="send" type="submit" disabled={busy || !input.trim()}>Send</button>
        </form>
        <p className="note">General health information, not a diagnosis. In an emergency call 999 or 112.</p>
      </div>
    </main>
  );
}
