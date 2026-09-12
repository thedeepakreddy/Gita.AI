import { NextResponse } from 'next/server';

import { locales } from '@/i18n/locales';
import { requireRole } from '@/lib/access/roles';
import { TRIAL_MESSAGE_LIMIT, trialConfigured } from '@/lib/chat/keyResolution';
import { prisma } from '@/lib/db';
import { embedderInfo } from '@/lib/retrieval/embedder';
import { reviewProgress } from '@/lib/verses/revisions';
import { getChaptersRaw } from '@/lib/verses/store';

export const runtime = 'nodejs';

/** Everything the operator needs on one screen. */
export async function GET() {
  const gate = await requireRole('admin');
  if ('response' in gate) return gate.response;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const chapters = await getChaptersRaw();
  const totalVerses = chapters.reduce((n, c) => n + c.verses.length, 0);

  const [users, conversations, messages, trialToday, trialAllTime, violations, reviewers] =
    await Promise.all([
      prisma.user.count(),
      prisma.conversation.count(),
      prisma.message.count({ where: { role: 'assistant' } }),
      prisma.message.count({
        where: { usedTrialKey: true, createdAt: { gte: startOfToday } },
      }),
      prisma.message.count({ where: { usedTrialKey: true } }),
      prisma.voiceViolation.count(),
      prisma.user.findMany({
        where: { role: { in: ['reviewer', 'admin'] } },
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);

  const translation = await Promise.all(
    locales.map((l) => reviewProgress(l, totalVerses))
  );

  return NextResponse.json({
    corpus: { chapters: chapters.length, verses: totalVerses },
    usage: { users, conversations, repliesGenerated: messages },
    trial: {
      configured: trialConfigured,
      perAccountLimit: TRIAL_MESSAGE_LIMIT,
      spentToday: trialToday,
      spentAllTime: trialAllTime,
      dailyCap: Number(process.env.TRIAL_DAILY_CAP ?? 200),
    },
    voiceGuard: { violations },
    translation,
    retrieval: embedderInfo(),
    reviewers,
  });
}
