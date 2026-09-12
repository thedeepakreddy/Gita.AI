import { NextResponse } from 'next/server';

import { isLocale, locales, type Locale } from '@/i18n/locales';
import { requireRole } from '@/lib/access/roles';
import { prisma } from '@/lib/db';
import { invalidateRevisions, reviewProgress } from '@/lib/verses/revisions';
import { getChapter, getChaptersRaw, getVerseRaw } from '@/lib/verses/store';

export const runtime = 'nodejs';

/**
 * The translation review surface.
 *
 * A reviewer sees the text as shipped and the current revision side by side,
 * and replaces one with the other. The shipped text is never overwritten —
 * see src/lib/verses/revisions.ts for why.
 */

const STATUSES = new Set(['in-review', 'reviewed']);

/** GET /api/admin/review?locale=hu&chapter=2 — one chapter's review state. */
export async function GET(request: Request) {
  const gate = await requireRole('reviewer');
  if ('response' in gate) return gate.response;

  const url = new URL(request.url);
  const localeParam = url.searchParams.get('locale') ?? 'en';
  const locale: Locale = isLocale(localeParam) ? localeParam : 'en';
  const scripture = url.searchParams.get('scripture') ?? 'bhagavad-gita';
  const chapterParam = url.searchParams.get('chapter');

  const rawChapters = await getChaptersRaw();
  const totalVerses = rawChapters.reduce((n, c) => n + c.verses.length, 0);

  // No chapter asked for: return the overview every language needs.
  if (!chapterParam) {
    const progress = await Promise.all(
      locales.map((l) => reviewProgress(l, totalVerses))
    );
    return NextResponse.json({
      locales: progress,
      chapters: rawChapters.map((c) => ({
        scripture: c.scripture,
        chapter: c.chapter,
        title: c.title,
        verses: c.verses.length,
      })),
    });
  }

  const chapterNumber = Number(chapterParam);
  if (!Number.isInteger(chapterNumber)) {
    return NextResponse.json({ error: 'bad_chapter' }, { status: 400 });
  }

  const chapter = await getChapter(scripture, chapterNumber);
  if (!chapter) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const revisions = await prisma.translationRevision.findMany({
    where: { locale, verseId: { in: chapter.verses.map((v) => v.id) } },
    include: { reviewedBy: { select: { name: true, email: true } } },
  });
  const byVerse = new Map(revisions.map((r) => [r.verseId, r]));

  const verses = await Promise.all(
    chapter.verses.map(async (verse) => {
      const raw = await getVerseRaw(verse.id);
      const revision = byVerse.get(verse.id);
      return {
        id: verse.id,
        chapter: verse.chapter,
        verse: verse.verse,
        sanskrit: verse.sanskrit,
        transliteration: verse.transliteration,
        /** What ships in the JSON — the thing being replaced. */
        shipped: raw?.translations?.[locale] ?? null,
        shippedMeta: raw?.translation_meta?.[locale] ?? null,
        /** The English reference, so a translator into hu/hi has something to work from. */
        english: raw?.translations?.en ?? null,
        revision: revision
          ? {
              text: revision.text,
              status: revision.status,
              translator: revision.translator,
              source: revision.source,
              license: revision.license,
              note: revision.note,
              reviewedBy: revision.reviewedBy?.name ?? revision.reviewedBy?.email ?? null,
              reviewedAt: revision.reviewedAt,
              updatedAt: revision.updatedAt,
            }
          : null,
      };
    })
  );

  return NextResponse.json({
    locale,
    scripture,
    chapter: chapterNumber,
    title: chapter.title,
    verses,
  });
}

/** PUT /api/admin/review — save or approve one verse's translation. */
export async function PUT(request: Request) {
  const gate = await requireRole('reviewer');
  if ('response' in gate) return gate.response;
  const { viewer } = gate;

  let body: {
    verseId?: string;
    locale?: string;
    text?: string;
    status?: string;
    translator?: string;
    source?: string;
    license?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const verseId = String(body.verseId ?? '');
  const localeParam = String(body.locale ?? '');
  const text = String(body.text ?? '').trim();
  const status = String(body.status ?? 'in-review');

  if (!isLocale(localeParam)) {
    return NextResponse.json({ error: 'unknown_locale' }, { status: 400 });
  }
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: 'unknown_status' }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: 'empty_text' }, { status: 400 });

  // The verse must exist in the corpus. A revision for a verse that isn't
  // there would be invisible forever and quietly wrong.
  const verse = await getVerseRaw(verseId);
  if (!verse) return NextResponse.json({ error: 'unknown_verse' }, { status: 404 });

  const approved = status === 'reviewed';
  const data = {
    text,
    status,
    translator: body.translator?.trim() || null,
    source: body.source?.trim() || null,
    license: body.license?.trim() || null,
    note: body.note?.trim() || null,
    // Attribution is recorded only on approval: "reviewed by" has to mean
    // someone stood behind the text, not that someone typed in the box.
    reviewedById: approved ? viewer.id : null,
    reviewedAt: approved ? new Date() : null,
  };

  await prisma.translationRevision.upsert({
    where: { verseId_locale: { verseId, locale: localeParam } },
    create: { verseId, locale: localeParam, ...data },
    update: data,
  });
  invalidateRevisions();

  return NextResponse.json({ ok: true, verseId, locale: localeParam, status });
}

/** DELETE /api/admin/review?verseId=…&locale=… — revert to the shipped text. */
export async function DELETE(request: Request) {
  const gate = await requireRole('reviewer');
  if ('response' in gate) return gate.response;

  const url = new URL(request.url);
  const verseId = url.searchParams.get('verseId') ?? '';
  const locale = url.searchParams.get('locale') ?? '';
  if (!isLocale(locale)) {
    return NextResponse.json({ error: 'unknown_locale' }, { status: 400 });
  }

  const { count } = await prisma.translationRevision.deleteMany({
    where: { verseId, locale },
  });
  invalidateRevisions();

  return NextResponse.json({ ok: true, reverted: count > 0 });
}
