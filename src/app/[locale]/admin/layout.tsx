import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { AdminNav } from '@/components/admin/AdminNav';
import { getViewer, hasAtLeast } from '@/lib/access/roles';
import { isLocale } from '@/i18n/locales';

/**
 * Everything under /admin is gated here, on the server, before any child
 * renders. A client-side check would ship the surface to everyone and hope.
 *
 * A signed-in non-reviewer gets 404 rather than 403: whether this application
 * has an administration area is not something a stranger needs confirmed.
 *
 * The administration UI is in English only. Translating it would mean shipping
 * machine-written Hungarian to the people who would notice, and a reviewer's
 * tool is the last place to guess at wording — see README, "Known gaps".
 */
export default async function AdminLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const viewer = await getViewer();
  if (!viewer || !hasAtLeast(viewer.role, 'reviewer')) notFound();

  return (
    <main className="flex-1 w-full overflow-y-auto px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <AdminNav role={viewer.role} name={viewer.name ?? viewer.email ?? 'you'} />
        {children}
      </div>
    </main>
  );
}
