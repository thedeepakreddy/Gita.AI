import type { Locale } from '@/i18n/locales';
import { localeMeta } from '@/i18n/locales';
import type { SearchHit } from '@/lib/retrieval/search';

/**
 * Prompt construction for Gita Counsel.
 *
 * THE CENTRAL CONSTRAINT — read before editing.
 *
 * This application explains Krishna's teaching in the third person. It must
 * never speak AS Krishna, or as God, in the first person. "Krishna's counsel
 * in Chapter 2 speaks to this" is right; "I tell you, Arjuna" is not, and
 * neither is a first-person paraphrase that merely drops the name.
 *
 * This is not a style preference. The application is intended for donation to
 * ISKCON Budapest, and a machine putting words in Krishna's mouth is a
 * theological problem, not a UX one. Treat the instruction below as a
 * requirement, and keep the post-check in `looksLikeDivineFirstPerson` in
 * place as a backstop for when a model ignores it.
 */

export type PromptInput = {
  question: string;
  hits: SearchHit[];
  locale: Locale;
  /** Prior turns, oldest first. */
  history?: { role: 'user' | 'assistant'; content: string }[];
};

const REFUSAL_LANGUAGE: Record<Locale, string> = {
  en: 'Answer in English.',
  hu: 'Answer in Hungarian (magyarul).',
  hi: 'Answer in Hindi (हिन्दी में).',
};

export function buildSystemPrompt(locale: Locale): string {
  const language = REFUSAL_LANGUAGE[locale] ?? REFUSAL_LANGUAGE.en;

  // Deliberately terse. This prompt is resent on every turn, so each line is
  // paid for repeatedly — it was ~640 tokens of explanatory prose and is now
  // roughly half that. What was cut is rationale, not rules: every constraint
  // that was here still is. Do not "tidy" the VOICE block; it is the one part
  // whose exact wording is load-bearing (see looksLikeDivineFirstPerson).
  return `You are a study companion for the Bhagavad Gita, for people whose decision has stopped moving — Arjuna's state in chapter 2.

VOICE — the most important rule.
Explain Krishna's teaching in the third person. Never write in Krishna's voice, never as God.
  Yes: "Krishna's counsel in 2.47 speaks to this — he separates the action from its fruit."
  No: "I tell you, Arjuna, act without attachment." No first-person divine speech, even without the name.
Quoting a translation inside quotation marks is fine — quoting is not speaking as its author.

NOT EVERY MESSAGE NEEDS A VERSE.
Verses are attached automatically to every message, greetings included — that is not a signal to use them.
Greetings, thanks and small talk get a short warm reply with no verse and no citation: greet them back, ask what is on their mind.
Reach for scripture only when they bring something to sit with.

GROUNDING — when you use scripture
Use only the verses supplied; never your own memory of the Gita.
Cite each as chapter.verse (e.g. 2.47).
If they do not fit, say so rather than forcing one. Never invent a number, or attribute a line to a verse that lacks it.

HOW YOU HELP — write like a counsellor sitting with them, not a search result.

Open with the actual thing they are carrying, in their specifics. Never open with generic sympathy ("that must be hard", "it can be tough when we feel…") — say back the real situation so they know they were heard.

When you use a verse, do three things in order:
  1. quote the line itself, in quotation marks;
  2. say what it means in plain language, as if to someone who has never read it;
  3. connect it to their situation concretely, using their own details.
A verse number plus a one-line paraphrase is not an explanation. Never restate the verse and stop.

Don't tell them what to decide. Krishna reframes how Arjuna sees the choice rather than making it for him; do the same. Close by opening something up — a question worth sitting with, not instructions.

If there is a practical emergency — money, rent, safety, health — say plainly that it needs practical action as well. Scripture speaks to how a person carries a burden; it does not pay rent, and pretending otherwise is not kindness.

Length: usually 150–250 words. Enough to actually explain something. One verse explored properly beats three mentioned in passing.

LIMITS
You are not a priest, guru, therapist, doctor or lawyer — say so when one is needed.
For self-harm, harm to others, abuse or crisis: say early and clearly that this needs a real person now (a local crisis line, a doctor, someone they trust). Scripture is not a substitute.
Translations here are public-domain placeholders pending review; say so if someone leans on exact wording.

${language} Keep citations numeric (2.47) whatever language you answer in.`;
}

/**
 * Renders retrieved verses into the prompt.
 *
 * Deliberately carries the reference and the translation and nothing else.
 * Previously this also sent the IAST transliteration, the translator name, the
 * placeholder status and the retrieval score on every verse — roughly half the
 * block, none of which the model uses to answer. Transliteration in particular
 * is display-only data for the /study page, and it tokenizes badly.
 *
 * Provenance has not been lost, only moved: the placeholder caveat is stated
 * once in the system prompt instead of five times here, and the score is
 * returned to the client in the API response for the "verses consulted" panel.
 */
export function buildVerseContext(hits: SearchHit[], locale: Locale): string {
  if (hits.length === 0) {
    return 'No verses were retrieved. Tell the person you have nothing in the available text that speaks to this, and do not answer from general knowledge.';
  }

  const blocks = hits.map((hit) => {
    const translation = hit.verse_data?.translations?.[locale] ?? hit.text;
    return `[${hit.chapter}.${hit.verse}] ${translation}`;
  });

  // Framed as "available if relevant" rather than "answer from these", because
  // retrieval runs on every message — including greetings. Saying "your only
  // source" unconditionally made the model answer "hi" with two verses about
  // the nature of the Self. Grounding is still absolute *when* scripture is
  // used; that rule lives in the system prompt.
  return `Verses retrieved automatically — may not be relevant. Use only if the message calls for scripture; if so, use nothing else:\n\n${blocks.join('\n')}`;
}

export function buildUserMessage(input: PromptInput): string {
  return `${buildVerseContext(input.hits, input.locale)}

---

The person asks:

${input.question.trim()}`;
}

/**
 * Backstop for the first-person constraint.
 *
 * Models drift, and a user can try to talk one into character ("reply as
 * Krishna"). This does not sanitise the text — rewriting a theological error
 * into something that merely looks correct is worse than catching it. It
 * flags the response so the route can decline to store or show it.
 *
 * Deliberately conservative: it looks for divine self-identification, not for
 * every stray "I", because the assistant legitimately says "I" about itself
 * ("I have three verses here").
 */
const DIVINE_FIRST_PERSON = [
  /\bI am (?:the )?(?:Krishna|Krsna|Kṛṣṇa|God|the Supreme|the Lord|the Self of all|Vasudeva|Vāsudeva)\b/i,
  /\bI,? (?:Krishna|Krsna|Kṛṣṇa)\b/i,
  /\b(?:I|my) (?:tell|say to|counsel|command|instruct) (?:you,? )?(?:Arjuna|Partha|Pārtha|O Arjuna)\b/i,
  /\bArjuna,? (?:I|my) (?:tell|say|counsel|command)\b/i,
  /\bcome (?:to|unto) me\b/i,
  /\bsurrender (?:to|unto) me\b/i,
  /\bworship me\b/i,
  /\btake refuge in me\b/i,
];

export type DivineFirstPersonHit = {
  /** Source of the regex that matched, so the audit log says which rule fired. */
  pattern: string;
  /** The exact span that tripped it, for reading the log at a glance. */
  matched: string;
};

/**
 * Returns the offending span, or null when the reply is clean.
 *
 * The chat route stores this on a VoiceViolation row. Knowing *which* rule
 * fired is what makes the log actionable: a run of hits on one pattern is
 * either a model genuinely drifting or a pattern that is too broad, and those
 * need opposite responses.
 */
export function findDivineFirstPerson(text: string): DivineFirstPersonHit | null {
  // Quoted scripture is legitimate — strip quoted spans before checking, so a
  // correctly-attributed quotation is not mistaken for the app's own voice.
  const unquoted = text
    .replace(/"[^"]*"/g, ' ')
    .replace(/“[^”]*”/g, ' ')
    .replace(/^>.*$/gm, ' ');

  for (const pattern of DIVINE_FIRST_PERSON) {
    const match = unquoted.match(pattern);
    if (match) return { pattern: pattern.source, matched: match[0] };
  }
  return null;
}

export function looksLikeDivineFirstPerson(text: string): boolean {
  return findDivineFirstPerson(text) !== null;
}

/** Verse references the model actually cited, e.g. ["2.47"]. */
export function extractCitations(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b(\d{1,2})\.(\d{1,3})\b/g)) {
    const chapter = Number(match[1]);
    const verse = Number(match[2]);
    if (chapter >= 1 && chapter <= 18 && verse >= 1 && verse <= 78) {
      found.add(`${chapter}.${verse}`);
    }
  }
  return [...found];
}

export function localeLabel(locale: Locale): string {
  return localeMeta[locale]?.label ?? locale;
}
