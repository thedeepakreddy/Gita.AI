import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Who may review translations, and who may read the voice-guard log.
 *
 * Three roles, deliberately few:
 *   user      — the default. Own conversations, own key, own bookmarks.
 *   reviewer  — may edit and approve verse translations.
 *   admin     — the above, plus the voice-guard log, trial spend, and the
 *               ability to promote reviewers.
 *
 * ADMIN_EMAILS is an override, not the storage. An address listed there is an
 * admin whatever the database says, which means a fresh deployment always has
 * a way in and an administrator cannot demote themselves out of the only
 * account that could fix it. Everything else lives in User.role so the temple
 * can appoint reviewers without a redeploy.
 */

export type Role = 'user' | 'reviewer' | 'admin';

const RANK: Record<Role, number> = { user: 0, reviewer: 1, admin: 2 };

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

export function normaliseRole(value: string | null | undefined): Role {
  return value === 'admin' || value === 'reviewer' ? value : 'user';
}

export type Viewer = {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
};

/** The signed-in user with their effective role, or null. */
export async function getViewer(): Promise<Viewer | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const record = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!record) return null;

  return {
    id: record.id,
    email: record.email,
    name: record.name,
    role: isAdminEmail(record.email) ? 'admin' : normaliseRole(record.role),
  };
}

export function hasAtLeast(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}

/**
 * Guard for route handlers. Returns the viewer, or a Response to return as-is.
 *
 * 404 rather than 403 for an authenticated non-reviewer: the existence of an
 * admin surface is not something a signed-in stranger needs confirmed.
 */
export async function requireRole(
  required: Role
): Promise<{ viewer: Viewer } | { response: Response }> {
  const viewer = await getViewer();
  if (!viewer) {
    return {
      response: Response.json({ error: 'not_authenticated' }, { status: 401 }),
    };
  }
  if (!hasAtLeast(viewer.role, required)) {
    return { response: Response.json({ error: 'not_found' }, { status: 404 }) };
  }
  return { viewer };
}
