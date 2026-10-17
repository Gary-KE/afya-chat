/**
 * Safety layer that runs BEFORE the AI model.
 * Some symptoms need a human now, not a chatbot. We check every incoming message
 * for red-flag phrases (English and Kiswahili) and, if one matches, answer with
 * emergency guidance straight away instead of waiting for the model.
 */

export type Lang = "en" | "sw";

type RedFlag = { id: string; en: string; patterns: RegExp[] };

const RED_FLAGS: RedFlag[] = [
  { id: "breathing", en: "difficulty breathing",
    patterns: [/can'?t breathe|cannot breathe|difficulty breathing|short(ness)? of breath|struggling to breathe/i, /kushindwa kupumua|hawezi kupumua|siwezi kupumua|kupumua kwa shida/i] },
  { id: "chest", en: "chest pain",
    patterns: [/chest pain|pain in (my|the) chest|crushing chest|tight chest/i, /maumivu ya kifua|kifua kinauma/i] },
  { id: "bleeding", en: "heavy bleeding",
    patterns: [/(heavy|severe|won'?t stop|nonstop) bleeding|bleeding (a lot|heavily)|vomiting blood|coughing (up )?blood/i, /kutoka damu nyingi|damu nyingi|kutapika damu/i] },
  { id: "unconscious", en: "unconscious or fitting",
    patterns: [/unconscious|passed out|not waking|unresponsive|seizure|convulsion|fitting/i, /amezimia|kuzimia|degedege|hajitambui/i] },
  { id: "stroke", en: "signs of a stroke",
    patterns: [/face (is )?drooping|slurred speech|one side (of (the|my) body )?(is )?weak|sudden numbness/i, /uso umepinda|kiharusi/i] },
  { id: "pregnancy", en: "danger signs in pregnancy",
    patterns: [/pregnan\w*.{0,40}(bleeding|severe pain|no movement|swelling|fits)/i, /mjamzito.{0,40}(damu|maumivu makali)/i] },
  { id: "child", en: "a very sick child",
    patterns: [/(baby|child|infant|newborn).{0,40}(not (feeding|breastfeeding|drinking)|very hot|lethargic|floppy|blue lips|fits)/i, /mtoto.{0,40}(hanyonyi|homa kali|degedege)/i] },
  { id: "self-harm", en: "thoughts of self-harm",
    patterns: [/kill myself|end my life|suicid|want to die|hurt myself/i, /kujiua|kujidhuru|nataka kufa/i] },
  { id: "poison", en: "poisoning or overdose",
    patterns: [/poison(ed|ing)?|overdose|swallowed (chemicals?|pills|bleach|paraffin)/i, /sumu|kumeza dawa nyingi/i] }
];

export function findRedFlags(text: string): string[] {
  const t = (text || "").slice(0, 2000);
  return RED_FLAGS.filter(f => f.patterns.some(p => p.test(t))).map(f => f.id);
}

/** Rough language guess, good enough to pick the reply language for a chat. */
const SW_WORDS = /\b(habari|nina|naumwa|mtoto|homa|maumivu|tumbo|kichwa|daktari|dawa|asante|tafadhali|sijui|nini|leo|jana|kikohozi|kuhara|mimi|yangu|wangu|sana|kwa|na|ya)\b/gi;
export function guessLang(text: string): Lang {
  const words = (text || "").toLowerCase().split(/\s+/).filter(Boolean).length || 1;
  const sw = ((text || "").match(SW_WORDS) || []).length;
  return sw / words >= 0.25 ? "sw" : "en";
}

export function emergencyReply(flags: string[], lang: Lang): string {
  const selfHarm = flags.includes("self-harm");
  if (lang === "sw") {
    return [
      "⚠️ Hii inaweza kuwa dharura.",
      selfHarm ? "Hauko peke yako. Tafadhali ongea na mtu sasa: piga Kenya Red Cross 1199 (bila malipo) au Befrienders Kenya +254 722 178 177." : "Tafadhali nenda hospitali iliyo karibu SASA au piga 999 / 112. Kenya Red Cross: 1199.",
      "Usisubiri jibu la mtandaoni. Ukishapata msaada, niko hapa kukusaidia zaidi."
    ].join("\n");
  }
  return [
    "⚠️ This could be an emergency.",
    selfHarm ? "You're not alone. Please talk to someone now: call Kenya Red Cross on 1199 (free) or Befrienders Kenya on +254 722 178 177." : "Please go to the nearest hospital NOW or call 999 / 112. Kenya Red Cross: 1199.",
    "Don't wait for an online answer. Once you're safe, I'm here to help with anything else."
  ].join("\n");
}

/** Instructions given to the model on every request. */
export function systemPrompt(lang: Lang, channel: "web" | "whatsapp"): string {
  return [
    "You are Afya, a friendly health guidance assistant for people in Kenya.",
    "You help people understand symptoms, decide how urgently to seek care, and look after themselves at home when that is safe.",
    "Rules:",
    "- You are not a doctor. Never give a diagnosis as fact; say what it could be and what would rule things in or out.",
    "- Ask one or two short follow-up questions when you need them (age, how long, fever, pregnancy, medicines taken).",
    "- Always end with a clear next step: self-care at home, see a clinic within 24-48 hours, or go to hospital now.",
    "- Never recommend prescription-only medicines or doses. Common over-the-counter advice must include 'follow the pack instructions'.",
    "- If anything sounds like an emergency, tell them to go to hospital now or call 999 / 112.",
    `- Reply in ${lang === "sw" ? "Kiswahili" : "English"}, in plain words.`,
    channel === "whatsapp" ? "- This is WhatsApp: keep replies under 120 words, no markdown headings, short lines." : "- Keep replies under 180 words. Use short paragraphs or simple bullet points."
  ].join("\n");
}

export const DISCLAIMER = "Afya gives general health information, not a diagnosis. In an emergency call 999 or 112.";
