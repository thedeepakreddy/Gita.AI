import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getVerse } from '@/lib/verses/store';

export const runtime = 'nodejs';

/** Verses a reader has kept. Thin on purpose — an id and an optional note. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const rows = await prisma.bookmark.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  // Hydrate from the corpus so the list can show the verse, not just an id.
  const bookmarks = await Promise.all(
    rows.map(async (row) => {
      const verse = await getVerse(row.verseId);
      return {
        verseId: row.verseId,
        note: row.note,
        createdAt: row.createdAt,
        chapter: verse?.chapter ?? null,
        verse: verse?.verse ?? null,
        translations: verse?.translations ?? {},
      };
    })
  );

  return NextResponse.json({ bookmarks });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  let body: { verseId?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const verseId = String(body.verseId ?? '');
  if (!(await getVerse(verseId))) {
    return NextResponse.json({ error: 'unknown_verse' }, { status: 404 });
  }

  const note = body.note?.trim().slice(0, 2000) || null;
  await prisma.bookmark.upsert({
    where: { userId_verseId: { userId: session.user.id, verseId } },
    create: { userId: session.user.id, verseId, note },
    update: { note },
  });

  return NextResponse.json({ ok: true, verseId });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const verseId = new URL(request.url).searchParams.get('verseId') ?? '';
  await prisma.bookmark.deleteMany({ where: { userId: session.user.id, verseId } });
  return NextResponse.json({ ok: true });
}
