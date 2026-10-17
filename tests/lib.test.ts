import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { findRedFlags, guessLang, emergencyReply, systemPrompt } from "../lib/triage.ts";
import { normalizePhone, hashContact, maskPhone } from "../lib/privacy.ts";
import { validTwilioSignature, twimlMessage } from "../lib/twilio.ts";
import { sseToText } from "../lib/sse.ts";

test("red flags: English and Kiswahili emergencies are caught", () => {
  assert.deepEqual(findRedFlags("I have crushing chest pain and sweating"), ["chest"]);
  assert.ok(findRedFlags("my baby is not feeding and very hot").includes("child"));
  assert.ok(findRedFlags("Siwezi kupumua vizuri").includes("breathing"));
  assert.ok(findRedFlags("nataka kujiua").includes("self-harm"));
  assert.deepEqual(findRedFlags("I have a mild headache since morning"), []);
  assert.deepEqual(findRedFlags("Nina homa kidogo na kikohozi"), []);
});

test("language guess", () => {
  assert.equal(guessLang("Nina maumivu ya kichwa na homa tangu jana"), "sw");
  assert.equal(guessLang("I have had a headache since yesterday"), "en");
});

test("emergency reply points to Kenyan emergency numbers", () => {
  assert.match(emergencyReply(["chest"], "en"), /999/);
  assert.match(emergencyReply(["self-harm"], "sw"), /1199/);
  assert.match(systemPrompt("sw", "whatsapp"), /Kiswahili/);
});

test("privacy: phone numbers are normalised, hashed and masked", () => {
  assert.equal(normalizePhone("whatsapp:+254712345678"), "+254712345678");
  assert.equal(normalizePhone("0712345678"), "+254712345678");
  assert.equal(hashContact("0712345678", "s"), hashContact("whatsapp:+254712345678", "s"));
  assert.notEqual(hashContact("0712345678", "s"), hashContact("0712345678", "t"));
  assert.equal(maskPhone("whatsapp:+254712345678"), "+2547••••678");
});

test("twilio: genuine signatures pass, tampered ones fail", () => {
  const url = "https://afya.example/api/whatsapp", token = "secret-token";
  const params = { From: "whatsapp:+254712345678", Body: "Hello", To: "whatsapp:+14155238886" };
  const data = Object.keys(params).sort().reduce((a, k) => a + k + (params as Record<string, string>)[k], url);
  const sig = createHmac("sha1", token).update(data).digest("base64");
  assert.equal(validTwilioSignature(url, params, sig, token), true);
  assert.equal(validTwilioSignature(url, { ...params, Body: "Hacked" }, sig, token), false);
  assert.equal(validTwilioSignature(url, params, sig, "wrong"), false);
  assert.equal(validTwilioSignature(url, params, "", token), false);
});

test("twiml escapes text safely", () => {
  assert.equal(twimlMessage("a < b & c"), '<?xml version="1.0" encoding="UTF-8"?><Response><Message>a &lt; b &amp; c</Message></Response>');
});

test("streaming: SSE chunks split anywhere still become clean text", async () => {
  const raw = 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n';
  const bytes = new TextEncoder().encode(raw);
  const body = new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } });
  let out = ""; const r = sseToText(body).getReader();
  for (;;) { const { done, value } = await r.read(); if (done) break; out += value; }
  assert.equal(out, "Hello");
});
