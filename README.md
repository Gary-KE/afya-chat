# Afya Chat

A health-guidance assistant that answers on **WhatsApp** and the **web**, with **streaming AI replies**, a **safety layer for emergencies**, and a **clinician dashboard**. Built with Next.js 14, TypeScript and Supabase (PostgreSQL).

Built by **Gerishom Manoah** (with AI pair-programming) as a working demo of the stack used for AI-native health products in Africa.

## What it does

- **Web chat** (`/`): describe symptoms in English or Kiswahili; the answer streams in word by word.
- **WhatsApp** (`/api/whatsapp`): the same assistant through Twilio. Every request is checked against Twilio's signature, so nobody else can post to it.
- **Emergency rules first**: messages that mention danger signs (chest pain, difficulty breathing, heavy bleeding, a very sick child, self-harm…) get an immediate reply with Kenyan emergency numbers (999 / 112, Red Cross 1199), without waiting for the model.
- **Dashboard** (`/dashboard`, password protected): every conversation from both channels, red flags first, refreshing every 5 seconds.
- **Privacy by design**: phone numbers are never stored. The database keeps a salted SHA-256 hash (to find the conversation again) and a masked number (+2547••••678). Row-level security is on with no public policies, so data is only reachable through the server.

## How it works

```
WhatsApp ──► Twilio ──► /api/whatsapp ─┐
                                       ├─► red-flag check ──► emergency reply
Browser ───────────────► /api/chat ────┤
                                       └─► AI model (streams) ──► reply
                                                │
                         Supabase (Postgres) ◄──┘  conversations + messages
                                ▲
             /dashboard ────────┘  (password, polls every 5 s)
```

| Folder | What's inside |
|---|---|
| `app/page.tsx` | Chat screen: sends the conversation, reads the streamed answer |
| `app/api/chat/route.ts` | Validates input, rate-limits, runs the red-flag check, streams the model's answer and saves it |
| `app/api/whatsapp/route.ts` | Verifies the Twilio signature, finds the conversation by hashed number, replies in TwiML |
| `app/dashboard/page.tsx` + `app/api/conversations` | Clinician view |
| `middleware.ts` | Password check for the dashboard and its API |
| `lib/triage.ts` | Red-flag rules (English + Kiswahili), language guess, system prompt |
| `lib/llm.ts`, `lib/sse.ts` | Any OpenAI-compatible model; turns the server-sent-event stream into text |
| `lib/db.ts`, `supabase/schema.sql` | Database access and tables |
| `lib/privacy.ts`, `lib/twilio.ts` | Phone hashing/masking, webhook signature check |
| `tests/` | Unit tests: red flags, language, privacy, signatures, stream parsing |

## Set it up (all from a phone browser)

1. **Supabase**: create a free project → SQL Editor → paste `supabase/schema.sql` → Run. From Project Settings → API copy the Project URL and the `service_role` key.
2. **AI model**: create a free key at console.groq.com (or use any OpenAI-compatible API).
3. **Vercel**: vercel.com → Add New Project → import this GitHub repo → add the environment variables from `.env.example` → Deploy.
4. **WhatsApp**: Twilio Console → Messaging → Try it out → Send a WhatsApp message (join the sandbox from your phone). In Sandbox settings set "When a message comes in" to `https://YOUR-APP.vercel.app/api/whatsapp` (POST). Add your Twilio Auth Token to Vercel as `TWILIO_AUTH_TOKEN` and redeploy.
5. Open `/dashboard`, sign in as `admin` with your `DASHBOARD_PASSWORD`.

## Tests

```
npm test
```

## Limits and next steps

- The assistant gives general guidance, not a diagnosis, and should be reviewed by clinicians before real use.
- The dashboard polls every 5 seconds; Supabase Realtime (with authenticated clinician accounts) would push updates instantly.
- The rate limit is per server instance; a shared store (e.g. Redis) would make it global.
- Next: Supabase Auth for clinicians, data retention jobs, SMS fallback for feature phones, more languages (Dholuo, Luhya, Kikuyu), and FHIR export of triage summaries.
