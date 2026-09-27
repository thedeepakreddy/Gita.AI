/**
 * The single answer to "what can this person do".
 *
 * IN ITS OWN FILE ON PURPOSE. This has no imports, so both the NextAuth config
 * and the server-side viewer lookup can use it — `roles.ts` imports
 * `authOptions` from `auth.ts`, so putting these there and importing back would
 * be a cycle.
 *
 * It exists because the rule was written twice and the copies disagreed.
 * `getViewer()` applied the ADMIN_EMAILS override; the session callback read
 * only the database column. An operator listed in ADMIN_EMAILS whose column
 * still said "user" could open /admin by typing the URL, but the link to it was
 * never rendered — the page let them in and the navigation pretended it did not
 * exist. One rule, one implementation.
 */

export type Role = 'user' | 'reviewer' | 'admin';

const RANK: Record<Role, number> = { user: 0, reviewer: 1, admin: 2 };

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * ADMIN_EMAILS is an override, not storage. An address listed there is an admin
 * whatever the database says, so a fresh deployment always has a way in and an
 * administrator cannot demote themselves out of the only account that could
 * fix it.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

export function normaliseRole(value: string | null | undefined): Role {
  return value === 'admin' || value === 'reviewer' ? value : 'user';
}

/** What the person may actually do: the column, with the env override applied. */
export function effectiveRole(
  email: string | null | undefined,
  storedRole: string | null | undefined
): Role {
  return isAdminEmail(email) ? 'admin' : normaliseRole(storedRole);
}

export function hasAtLeast(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}
