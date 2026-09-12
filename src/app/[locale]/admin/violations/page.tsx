import { notFound } from 'next/navigation';

import { ViolationsClient } from '@/components/admin/ViolationsClient';
import { getViewer, hasAtLeast } from '@/lib/access/roles';

/** Admin-only inside the reviewer-gated area: the log contains what people asked. */
export default async function AdminViolationsPage() {
  const viewer = await getViewer();
  if (!viewer || !hasAtLeast(viewer.role, 'admin')) notFound();
  return <ViolationsClient />;
}
