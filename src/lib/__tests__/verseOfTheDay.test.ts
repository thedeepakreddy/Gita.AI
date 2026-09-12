import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The daily verse must be stable within a day and different between days.
 *
 * Both halves matter. If it changes on reload, two people cannot talk about
 * "today's verse"; if consecutive days land on neighbouring verses, the feature
 * reads as "chapter 1, slowly" rather than as the whole book.
 *
 * The selection maths is re-stated here rather than imported, because
 * verseOfTheDay.ts reaches the filesystem through the corpus store and this
 * suite is a pure unit test. Keep the two in step — see getVerseOfTheDay.
 */

function dayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000
  );
}

function scramble(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return Math.abs(x);
}

const CORPUS = 701;
const pick = (d: Date) => scramble(dayNumber(d)) % CORPUS;

test('verse of the day: the same date always gives the same verse', () => {
  const morning = new Date('2026-09-12T06:00:00Z');
  const evening = new Date('2026-09-12T23:59:00Z');
  assert.equal(pick(morning), pick(evening));
});

test('verse of the day: consecutive days are not consecutive verses', () => {
  // A weak hash would walk the corpus in order. Over a fortnight, no two
  // adjacent days should differ by only one verse.
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 14; i++) {
    const a = pick(new Date(start + i * 86_400_000));
    const b = pick(new Date(start + (i + 1) * 86_400_000));
    assert.notEqual(Math.abs(a - b), 1, `day ${i} and ${i + 1} are adjacent verses`);
  }
});

test('verse of the day: a year of dates covers a wide span of the corpus', () => {
  const seen = new Set<number>();
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 365; i++) seen.add(pick(new Date(start + i * 86_400_000)));

  // Collisions are expected from a hash over 365 draws; a badly-behaved one
  // would cluster hard. Anything above half the draws being distinct is fine.
  assert.ok(seen.size > 180, `only ${seen.size} distinct verses in a year`);
});

test('verse of the day: every pick is inside the corpus', () => {
  const start = Date.UTC(2020, 0, 1);
  for (let i = 0; i < 2000; i++) {
    const index = pick(new Date(start + i * 86_400_000));
    assert.ok(index >= 0 && index < CORPUS, `index ${index} out of range`);
  }
});
