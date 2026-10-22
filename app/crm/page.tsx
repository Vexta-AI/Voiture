import type { Metadata } from 'next';

import { CrmBoard } from '@/components/crm/CrmBoard';
import { crmEnabled, loadDeals } from '@/lib/crm-store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'CRM · Pépite Radar' };

export default async function CrmPage() {
  const enabled = crmEnabled();
  const deals = enabled ? await loadDeals().catch(() => []) : [];
  return <CrmBoard initialDeals={deals} enabled={enabled} />;
}
