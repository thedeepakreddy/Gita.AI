import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

import { prisma } from '@/lib/db';

/**
 * Authentication — identity, and the anchor for the trial allowance.
 *
 * Signing in establishes who someone is, so their settings, saved provider key
 * and conversation history follow them between devices.
 *
 * It ALSO meters the operator-funded trial: a signed-in account gets
 * TRIAL_MESSAGE_LIMIT messages on the application's own key before it must
 * supply its own. That connection between identity and quota is intentional —
 * a trial has to be counted against something, and the account is the only
 * durable handle we have.
 *
 * The quota logic lives in src/lib/chat/keyResolution.ts, deliberately apart
 * from this file: authentication should not grow billing rules, and the trial
 * should remain removable by switching one env var off. Nothing here reads or
 * enforces quota.
 *
 * Consequence worth knowing: anyone with a Google account can open a new one,
 * so the per-account limit alone does not bound spend. The global daily cap in
 * keyResolution.ts is what actually protects the budget.
 */

const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  // Only register the provider when credentials exist, so the app still boots
  // (study pages, verse browsing) before Google OAuth has been set up.
  providers: googleConfigured
    ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          // Minimum needed to identify a person. No Drive, no Gmail, no
          // long-lived offline access — nothing that isn't sign-in.
          authorization: {
            params: { scope: 'openid email profile', prompt: 'select_account' },
          },
        }),
      ]
    : [],

  session: { strategy: 'database' },

  pages: {
    signIn: '/signin',
  },

  callbacks: {
    async session({ session, user }) {
      // Expose the user id so route handlers can scope queries without a
      // second lookup. Nothing sensitive is added to the session.
      if (session.user) {
        session.user.id = user.id;
        // Role rides along so the header can decide whether to show the admin
        // link. It is a HINT, not a permission: every admin route re-checks
        // with getViewer(), because a session value is client-visible and a
        // stale one must never grant anything.
        const role = (user as { role?: string }).role;
        session.user.role = role === 'admin' || role === 'reviewer' ? role : 'user';
      }
      return session;
    },
  },
};

export const isGoogleConfigured = googleConfigured;
