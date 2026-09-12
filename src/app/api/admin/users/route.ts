import { NextResponse } from 'next/server';

import { isAdminEmail, requireRole } from '@/lib/access/roles';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

const ASSIGNABLE = new Set(['user', 'reviewer', 'admin']);

/** GET /api/admin/users?q=… — find an account to appoint as reviewer. */
export async function GET(request: Request) {
  const gate = await requireRole('admin');
  if ('response' in gate) return gate.response;

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();

  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] }
      : { role: { in: ['reviewer', 'admin'] } },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      // Surfaced so the UI can explain why a role dropdown has no effect.
      lockedByEnv: isAdminEmail(u.email),
    })),
  });
}

/** PATCH /api/admin/users — appoint or stand down a reviewer. */
export async function PATCH(request: Request) {
  const gate = await requireRole('admin');
  if ('response' in gate) return gate.response;
  const { viewer } = gate;

  let body: { userId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const userId = String(body.userId ?? '');
  const role = String(body.role ?? '');
  if (!ASSIGNABLE.has(role)) {
    return NextResponse.json({ error: 'unknown_role' }, { status: 400 });
  }

  // Demoting yourself out of the last admin account would leave the review
  // queue unreachable, so it is refused. ADMIN_EMAILS is the intended way to
  // hold a permanent key to the building.
  if (userId === viewer.id && role !== 'admin' && !isAdminEmail(viewer.email)) {
    const admins = await prisma.user.count({ where: { role: 'admin' } });
    if (admins <= 1) {
      return NextResponse.json({ error: 'last_admin' }, { status: 409 });
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  return NextResponse.json({ ok: true, userId, role });
}
