import { notFound } from 'next/navigation';

import { AccountsClient } from '@/components/admin/AccountsClient';
import { getViewer, hasAtLeast } from '@/lib/access/roles';

/** Admin-only inside the reviewer-gated area: this page lists real addresses. */
export default async function AdminAccountsPage() {
  const viewer = await getViewer();
  if (!viewer || !hasAtLeast(viewer.role, 'admin')) notFound();
  return <AccountsClient />;
}
