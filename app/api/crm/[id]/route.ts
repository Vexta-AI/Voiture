import { NextResponse } from 'next/server';

import { applyAction } from '@/backend/utils/crm.js';
import { crmEnabled, deleteDeal, loadDeal, saveDeal } from '@/lib/crm-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/crm/:id — une action sur le deal (message envoyé / reçu, étape, note, papiers, chiffres).
 * Un acheteur qui passe "vendu" fait passer son véhicule en "vendu" au même prix.
 */
export async function PATCH(request: Request, { params }: Params) {
  if (!crmEnabled()) return NextResponse.json({ ok: false, error: 'missing_config' }, { status: 503 });
  const { id } = await params;
  const deal = await loadDeal(id);
  if (!deal) return NextResponse.json({ ok: false, error: 'deal introuvable' }, { status: 404 });

  let action: Parameters<typeof applyAction>[1];
  try {
    action = (await request.json()) as Parameters<typeof applyAction>[1];
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 });
  }
  const result = applyAction(deal, action);
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  await saveDeal(result.deal);

  const updated = [result.deal];
  if (result.deal.kind === 'revente' && result.deal.stage === 'vendu' && deal.stage !== 'vendu' && result.deal.vehicleDealId) {
    const vehicle = await loadDeal(result.deal.vehicleDealId);
    if (vehicle && vehicle.stage !== 'vendu') {
      const amount = Number(action.type === 'stage' ? action.amount : 0) || result.deal.events.at(-1)?.amount || vehicle.numbers.listedPrice || undefined;
      const sold = applyAction(vehicle, { type: 'stage', stage: 'vendu', amount: amount ?? undefined });
      if (sold.ok) {
        await saveDeal(sold.deal);
        updated.push(sold.deal);
      }
    }
  }
  return NextResponse.json({ ok: true, deal: result.deal, updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!crmEnabled()) return NextResponse.json({ ok: false, error: 'missing_config' }, { status: 503 });
  const { id } = await params;
  await deleteDeal(id);
  return NextResponse.json({ ok: true });
}
