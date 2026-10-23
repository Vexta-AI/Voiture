import { NextResponse } from 'next/server';

import { parseBuyerInput } from '@/backend/utils/matching.js';
import { deleteBuyer, loadBuyer, saveBuyer } from '@/lib/buyers-store';
import { crmEnabled } from '@/lib/crm-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/buyers/:id — { active } pour mettre en pause / réactiver, ou la fiche complète pour la modifier. */
export async function PATCH(request: Request, { params }: Params) {
  if (!crmEnabled()) return NextResponse.json({ ok: false, error: 'missing_config' }, { status: 503 });
  const { id } = await params;
  const buyer = await loadBuyer(id);
  if (!buyer) return NextResponse.json({ ok: false, error: 'acheteur introuvable' }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 });
  if (typeof body.active === 'boolean' && Object.keys(body).length === 1) {
    buyer.active = body.active;
  } else {
    const parsed = parseBuyerInput({ ...buyer, ...body });
    if (!parsed.ok) return NextResponse.json(parsed, { status: 422 });
    Object.assign(buyer, { name: parsed.name, phone: parsed.phone, notes: parsed.notes, criteria: parsed.criteria });
    if (typeof body.active === 'boolean') buyer.active = body.active;
  }
  await saveBuyer(buyer);
  return NextResponse.json({ ok: true, buyer });
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!crmEnabled()) return NextResponse.json({ ok: false, error: 'missing_config' }, { status: 503 });
  const { id } = await params;
  await deleteBuyer(id);
  return NextResponse.json({ ok: true });
}
