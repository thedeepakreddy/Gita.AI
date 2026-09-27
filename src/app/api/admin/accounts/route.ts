import { NextResponse } from 'next/server';

import { isAdminEmail, requireRole } from '@/lib/access/roles';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Who has signed up.
 *
 * Admin-only, and it stays that way: this is a list of real people's email
 * addresses. It exists because an operator has a legitimate need to know who
 * their users are — to appoint reviewers, to size the trial, to answer "how
 * many people are actually using this" — and because a temple taking custody
 * of an application should be able to see whose data it now holds.
 */
export async function GET() {
  const gate = await requireRole('admin');
  if ('response' in gate) return gate.response;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [users, total, recent, withKeys] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        trialMessagesUsed: true,
        _count: { select: { conversations: true, apiKeys: true } },
      },
      take: 500,
    }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { apiKeys: { some: {} } } }),
  ]);

  return NextResponse.json({
    summary: {
      total,
      joinedLast30Days: recent,
      withOwnKey: withKeys,
      /** Signed up but never started a conversation. */
      neverUsed: users.filter((u) => u._count.conversations === 0).length,
      listed: users.length,
    },
    accounts: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      // The effective role, not the stored column: an address in ADMIN_EMAILS
      // is an admin whatever the database says, and showing the column alone
      // would misreport who can actually reach this page.
      role: isAdminEmail(u.email) ? 'admin' : u.role,
      lockedByEnv: isAdminEmail(u.email),
      createdAt: u.createdAt,
      conversations: u._count.conversations,
      hasOwnKey: u._count.apiKeys > 0,
      trialMessagesUsed: u.trialMessagesUsed,
    })),
  });
}
