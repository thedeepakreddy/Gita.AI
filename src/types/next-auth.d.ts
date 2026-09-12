import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      /** Added in the session callback so route handlers can scope queries. */
      id: string;
      /**
       * A hint for rendering only. Authorisation is decided server-side in
       * src/lib/access/roles.ts — never trust this value for access.
       */
      role: 'user' | 'reviewer' | 'admin';
    } & DefaultSession['user'];
  }
}
