import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

const SCRIPTURE = 'bhagavad-gita';

/** Where the reader last was, so /study can offer to continue. */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    // Not an error: a signed-out reader simply has no progress.
    return NextResponse.json({ progress: null });
  }

  const scripture = new URL(request.url).searchParams.get('scripture') ?? SCRIPTURE;
  const progress = await prisma.readingProgress.findUnique({
    where: { userId_scripture: { userId: session.user.id, scripture } },
    select: { scripture: true, chapter: true, verse: true, updatedAt: true },
  });

  return NextResponse.json({ progress });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  let body: { scripture?: string; chapter?: number; verse?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const scripture = String(body.scripture ?? SCRIPTURE);
  const chapter = Number(body.chapter);
  const verse = Number(body.verse ?? 1);
  if (!Number.isInteger(chapter) || chapter < 1) {
    return NextResponse.json({ error: 'bad_chapter' }, { status: 400 });
  }

  const data = {
    chapter,
    verse: Number.isInteger(verse) && verse > 0 ? verse : 1,
  };

  await prisma.readingProgress.upsert({
    where: { userId_scripture: { userId: session.user.id, scripture } },
    create: { userId: session.user.id, scripture, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true, ...data });
}
