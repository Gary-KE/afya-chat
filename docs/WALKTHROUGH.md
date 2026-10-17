# Afya Chat: how it works, in plain words

Read this until you can explain every part without looking. Interviewers will ask "why did you do it this way?" more than "what does this line do?".

## 1. One message, start to finish (web)

1. The person types in `app/page.tsx` and presses Send.
2. The page sends the last 10 messages to `POST /api/chat` as JSON.
3. `app/api/chat/route.ts`:
   - limits each visitor to 20 messages a minute,
   - keeps only `user`/`assistant` messages, 1,000 characters each,
   - guesses the language (English or Kiswahili),
   - runs the **red-flag check** (`lib/triage.ts`). If it matches, it answers with emergency guidance straight away and never calls the model,
   - otherwise calls the model with a **system prompt** (rules: not a doctor, ask follow-ups, always give a next step, Kenyan emergency numbers),
   - **streams** the answer back while also saving it to the database when it finishes.
4. The page reads the response body piece by piece (`res.body.getReader()`) and updates the bubble, so the text appears as it is written.

**Why stream?** A full answer takes a few seconds. Streaming shows the first words in under a second, so it feels fast, which matters on slow mobile networks.

**How does streaming work?** The model sends Server-Sent Events: lines like `data: {"choices":[{"delta":{"content":"Hel"}}]}`. `lib/sse.ts` splits the bytes into lines (a line can be cut across two network chunks, so it keeps the unfinished part in a buffer), reads the JSON, and passes on only the text. The route then turns that text back into bytes for the browser.

## 2. One message on WhatsApp

1. Someone messages the Twilio WhatsApp number. Twilio sends a form POST to `/api/whatsapp` with `From` and `Body`.
2. **Signature check** (`lib/twilio.ts`): Twilio signs the request with HMAC-SHA1 using the account's auth token. We rebuild the signature from the URL plus the sorted form fields and compare in constant time. Wrong signature → 403. Without this, anyone could post fake messages or run up our AI bill.
3. The phone number is turned into a **salted SHA-256 hash** (`lib/privacy.ts`) to find this person's conversation. We store the hash and a masked number, never the real number.
4. We load the last 8 messages so the model remembers the conversation, run the red-flag check, call the model (not streamed: Twilio needs the full text), and reply with **TwiML** (`<Response><Message>…</Message></Response>`), XML-escaped.
5. WhatsApp replies are kept under 120 words with no headings, because long formatted text reads badly on WhatsApp.

## 3. The database (Supabase = hosted PostgreSQL)

- `conversations`: channel (web/whatsapp), hashed + masked contact, language, red_flag, timestamps.
- `messages`: conversation_id, role, content (max 4,000 characters), time. Deleting a conversation deletes its messages (`on delete cascade`).
- Indexes on `(conversation_id, created_at)` and `updated_at` because those are the queries we run.
- **Row-level security is on with no policies.** The browser never talks to the database. Only the server, using the service-role key (kept in Vercel's environment variables), can read or write. Health data must not be readable with a public key.

## 4. The dashboard

- `middleware.ts` asks for a password (HTTP Basic auth) on `/dashboard` and `/api/conversations`.
- The page polls every 5 seconds and puts red-flag conversations first.
- **Honest limit:** polling is simple and reliable; Supabase Realtime would push changes instantly. I'd add it together with proper clinician accounts (Supabase Auth) so realtime access is tied to a logged-in user.

## 5. Decisions you should be ready to defend

| Question | Answer |
|---|---|
| Why rules before the AI for emergencies? | The model can be slow, wrong or offline. Danger signs must always get the same instant, safe answer. Rules are predictable and testable. |
| Why not store phone numbers? | Kenya's Data Protection Act treats health data as sensitive. If the database leaks, hashes and masked numbers don't expose people. |
| Why an OpenAI-compatible API? | Swap models (Groq, OpenAI, a self-hosted model) by changing three environment variables, no code changes. |
| Why validate input on the server? | The browser can send anything. The server keeps only known roles, short text and the last 10 turns, which also caps cost. |
| What would you do with more time? | Clinician logins, Supabase Realtime, a shared rate limit (Redis), SMS for feature phones, more local languages, evaluation tests for answer quality, FHIR export of triage summaries. |
| How did you test it? | Unit tests for red flags in both languages, language guessing, phone hashing/masking, Twilio signatures (genuine and tampered), and stream parsing with chunks cut at random places. I also ran the chat and WhatsApp handlers against a fake model. |

## 6. Words to know

- **Streaming / SSE**: sending a response in pieces as it is produced.
- **Webhook**: a URL another service (Twilio) calls when something happens.
- **HMAC**: a signature made with a secret key; proves who sent the message and that it wasn't changed.
- **Row-level security (RLS)**: PostgreSQL rules that decide which rows a user may see.
- **TwiML**: Twilio's XML for "reply with this message".
- **System prompt**: the standing instructions the model gets before the conversation.
- **Edge vs Node runtime**: middleware runs at the edge (fast, limited); the API routes use Node because they need `crypto`.
