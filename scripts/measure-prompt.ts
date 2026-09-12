/**
 * Measures what a single chat turn actually sends to the provider.
 *
 *   npx tsx scripts/measure-prompt.ts "I cannot decide whether to leave my job"
 *
 * Token counts are estimated at ~4 chars/token (English prose). That is close
 * enough to size a budget; it is not exact, and differs per provider's
 * tokenizer — Devanagari and IAST diacritics tokenize far worse than plain
 * ASCII, which is exactly why they are worth checking here.
 *
 * Requires the embedding service to be running (npm run embed:serve).
 */

import { buildSystemPrompt, buildVerseContext } from '../src/lib/chat/prompt';
import { searchVerses } from '../src/lib/retrieval/search';

const estimate = (s: string) => Math.round(s.length / 4);

function row(label: string, text: string, note = '') {
  console.log(
    `  ${label.padEnd(26)} ${String(text.length).padStart(7)} chars  ~${String(
      estimate(text)
    ).padStart(5)} tok  ${note}`
  );
}

async function main() {
  const question = process.argv[2] ?? 'I cannot decide whether to leave my job';

  const hits = await searchVerses(question, { topK: 5, locale: 'en', includeVerseData: true });

  const system = buildSystemPrompt('en');
  const verses = buildVerseContext(hits, 'en');

  console.log('\nPER-REQUEST BREAKDOWN (first turn, no history)\n');
  row('system prompt', system);
  row('verse context (5)', verses);
  row('user question', question);

  const firstTurn = system.length + verses.length + question.length;
  console.log(`\n  ${'FIRST TURN TOTAL'.padEnd(26)} ${String(firstTurn).padStart(7)} chars  ~${estimate(
    String().padEnd(firstTurn)
  )} tok`);

  // What the verse block is made of, and what is deliberately excluded.
  console.log('\nVERSE BLOCK COMPOSITION\n');
  let translit = 0;
  let translation = 0;
  for (const h of hits) {
    translit += (h.verse_data?.transliteration ?? '').length;
    translation += (h.verse_data?.translations?.en ?? h.text).length;
  }
  const scaffolding = verses.length - translation;
  console.log(`  translations               ${String(translation).padStart(7)} chars  ~${String(Math.round(translation / 4)).padStart(5)} tok`);
  console.log(`  refs + header              ${String(scaffolding).padStart(7)} chars  ~${String(Math.round(scaffolding / 4)).padStart(5)} tok`);
  console.log(
    `  NOT sent: IAST             ${String(translit).padStart(7)} chars  ~${String(
      Math.round(translit / 4)
    ).padStart(5)} tok  (display-only; excluded on purpose)`
  );

  // History is the term that grows without bound. Assistant replies are
  // replayed truncated to HISTORY_ASSISTANT_CHARS (500), so each exchange
  // costs the user's own message plus that cap rather than a full reply.
  console.log('\nHISTORY COST (assistant replies truncated to 500 chars on replay)\n');
  for (const turns of [1, 2, 3]) {
    const historyChars = turns * (question.length + 500);
    const total = firstTurn + historyChars;
    console.log(
      `  ${String(turns).padStart(2)} exchanges kept   history ~${String(
        Math.round(historyChars / 4)
      ).padStart(4)} tok   TURN TOTAL ~${String(Math.round(total / 4)).padStart(4)} tok`
    );
  }
  console.log('\n  (3 is the configured maximum — see HISTORY_TURNS in the chat route)\n');
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
