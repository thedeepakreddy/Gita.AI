import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CHAT_WALLPAPERS } from '@/lib/ui/chatWallpapers';

export const runtime = 'nodejs';

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  // Scoped by userId as well as id, so a guessed conversation id from another
  // account returns 404 rather than someone else's conversation.
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  if (!conversation) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    id: conversation.id,
    title: conversation.title,
    locale: conversation.locale,
    provider: conversation.provider,
    wallpaperIndex: conversation.wallpaperIndex,
    messages: conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      citations: m.citations ? (JSON.parse(m.citations) as string[]) : [],
      createdAt: m.createdAt,
    })),
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const { count } = await prisma.conversation.deleteMany({
    where: { id: params.id, userId: session.user.id },
  });

  if (count === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  let body: { title?: string; wallpaperIndex?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const data: { title?: string; wallpaperIndex?: number } = {};
  if (body.title !== undefined) {
    const title = String(body.title).trim().slice(0, 120);
    if (!title) return NextResponse.json({ error: 'empty_title' }, { status: 400 });
    data.title = title;
  }
  if (body.wallpaperIndex !== undefined) {
    if (
      !Number.isInteger(body.wallpaperIndex) ||
      body.wallpaperIndex < 0 ||
      body.wallpaperIndex >= CHAT_WALLPAPERS.length
    ) {
      return NextResponse.json({ error: 'invalid_wallpaper' }, { status: 400 });
    }
    data.wallpaperIndex = body.wallpaperIndex;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'empty_update' }, { status: 400 });
  }

  const { count } = await prisma.conversation.updateMany({
    where: { id: params.id, userId: session.user.id },
    data,
  });

  if (count === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, ...data });
}
