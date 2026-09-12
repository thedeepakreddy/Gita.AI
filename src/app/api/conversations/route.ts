import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

/** The user's conversation list, newest first — powers the chat sidebar. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, locale: true, updatedAt: true },
    take: 200,
  });

  return NextResponse.json({ conversations });
}
