import { NextResponse } from 'next/server';

import { parseBuyerInput } from '@/backend/utils/matching.js';
import { loadBuyers, saveBuyer } from '@/lib/buyers-store';
import type { WaitingBuyer } from '@/lib/crm';
import { crmEnabled } from '@/lib/crm-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const disabled = () => NextResponse.json({ ok: false, error: 'missing_config', missing: ['BLOB_READ_WRITE_TOKEN'] }, { status: 503 });

/** GET /api/buyers — réseau d'acheteurs en attente. */
export async function GET() {
  if (!crmEnabled()) return disabled();
  return NextResponse.json({ ok: true, buyers: await loadBuyers() });
}

/** POST /api/buyers — { name, phone?, notes?, criteria: { models, budgetMax, yearMin?, mileageMax?, fuel?, gearbox? } } */
export async function POST(request: Request) {
  if (!crmEnabled()) return disabled();
  const parsed = parseBuyerInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json(parsed, { status: 422 });
  const now = new Date();
  const buyer: WaitingBuyer = {
    id: `b-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: parsed.name,
    phone: parsed.phone,
    notes: parsed.notes,
    active: true,
    createdAt: now.toISOString(),
    criteria: parsed.criteria,
  };
  await saveBuyer(buyer);
  return NextResponse.json({ ok: true, buyer }, { status: 201 });
}
