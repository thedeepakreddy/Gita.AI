import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/access/roles';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * The voice-guard log.
 *
 * Admin-only, because it contains what people asked. The point of keeping it
 * is to be able to answer, with evidence, the question a temple will
 * reasonably ask: "how often does your machine put words in Krishna's mouth?"
 */
export async function GET(request: Request) {
  const gate = await requireRole('admin');
  if ('response' in gate) return gate.response;

  const url = new URL(request.url);
  const take = Math.min(Math.max(Number(url.searchParams.get('take') ?? 50), 1), 200);

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [violations, total, last30, byPattern, assistantMessages] = await Promise.all([
    prisma.voiceViolation.findMany({ orderBy: { createdAt: 'desc' }, take }),
    prisma.voiceViolation.count(),
    prisma.voiceViolation.count({ where: { createdAt: { gte: since } } }),
    prisma.voiceViolation.groupBy({ by: ['pattern'], _count: { pattern: true } }),
    // The denominator. "4 violations" means nothing without "out of how many".
    prisma.message.count({ where: { role: 'assistant' } }),
  ]);

  const delivered = assistantMessages + total;

  return NextResponse.json({
    violations,
    summary: {
      total,
      last30Days: last30,
      repliesGenerated: delivered,
      /** Violations per 1,000 replies, the figure worth quoting. */
      ratePerThousand: delivered ? Number(((total / delivered) * 1000).toFixed(2)) : 0,
      byPattern: byPattern
        .map((p) => ({ pattern: p.pattern, count: p._count.pattern }))
        .sort((a, b) => b.count - a.count),
    },
  });
}
