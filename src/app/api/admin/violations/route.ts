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

  const [
    violations,
    total,
    last30,
    byPattern,
    assistantMessages,
    citations,
    citationTotal,
    citationLast30,
    citationAfterRetry,
  ] = await Promise.all([
    prisma.voiceViolation.findMany({ orderBy: { createdAt: 'desc' }, take }),
    prisma.voiceViolation.count(),
    prisma.voiceViolation.count({ where: { createdAt: { gte: since } } }),
    prisma.voiceViolation.groupBy({ by: ['pattern'], _count: { pattern: true } }),
    // The denominator. "4 violations" means nothing without "out of how many".
    prisma.message.count({ where: { role: 'assistant' } }),

    // The grounding guard's log, alongside the voice guard's. Both answer the
    // same shape of question and a temple will ask both.
    prisma.citationViolation.findMany({ orderBy: { createdAt: 'desc' }, take }),
    prisma.citationViolation.count(),
    prisma.citationViolation.count({ where: { createdAt: { gte: since } } }),
    prisma.citationViolation.count({ where: { afterRetry: true } }),
  ]);

  const delivered = assistantMessages + total + citationTotal;

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
    citations: citations.map((c) => ({
      ...c,
      cited: JSON.parse(c.cited) as string[],
      supplied: JSON.parse(c.supplied) as string[],
    })),
    citationSummary: {
      total: citationTotal,
      last30Days: citationLast30,
      /**
       * Failures that survived the correction attempt. A run of these means the
       * retry is not working, which is a different problem from an odd slip.
       */
      afterRetry: citationAfterRetry,
      ratePerThousand: delivered ? Number(((citationTotal / delivered) * 1000).toFixed(2)) : 0,
    },
  });
}
