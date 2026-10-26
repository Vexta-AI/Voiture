import { NextResponse } from 'next/server';

import { createBuyerDeal } from '@/backend/utils/crm.js';
import { createDealOnce, crmEnabled, loadDeal, loadDeals } from '@/lib/crm-store';
import { dealFromListing } from '@/lib/crm-deals';
import { validateListing } from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const disabled = () => NextResponse.json({ ok: false, error: 'missing_config', missing: ['DATABASE_URL'] }, { status: 503 });

/** GET /api/crm — tous les deals (le calcul chaleur / prochaine action se fait côté client, moteur partagé). */
export async function GET() {
  if (!crmEnabled()) return disabled();
  return NextResponse.json({ ok: true, deals: await loadDeals() });
}

/**
 * POST /api/crm
 *   { kind: 'achat' | 'mandat', listing }      ajoute une annonce au pipeline (une annonce = un deal)
 *   { kind: 'revente', vehicleId, contact? }   ajoute un acheteur sur un véhicule en vente
 */
export async function POST(request: Request) {
  if (!crmEnabled()) return disabled();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 });
  }

  if (body.kind === 'revente') {
    const vehicle = typeof body.vehicleId === 'string' ? await loadDeal(body.vehicleId) : null;
    if (!vehicle || vehicle.kind === 'revente') return NextResponse.json({ ok: false, error: 'véhicule introuvable' }, { status: 404 });
    const contact = (body.contact && typeof body.contact === 'object' ? body.contact : {}) as Record<string, unknown>;
    const deal = createBuyerDeal({
      vehicleDeal: vehicle,
      contact: { name: typeof contact.name === 'string' ? contact.name.slice(0, 200) : undefined, phone: typeof contact.phone === 'string' ? contact.phone.slice(0, 50) : undefined },
    });
    await createDealOnce(deal);
    return NextResponse.json({ ok: true, created: true, deal }, { status: 201 });
  }

  if (body.kind !== 'achat' && body.kind !== 'mandat') return NextResponse.json({ ok: false, error: 'kind : achat, mandat ou revente' }, { status: 400 });
  const parsed = validateListing(body.listing);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 422 });
  const deal = dealFromListing(body.kind, parsed.listing, 'manuel');
  const created = await createDealOnce(deal);
  return NextResponse.json({ ok: true, created, deal: created ? deal : await loadDeal(deal.id) }, { status: created ? 201 : 200 });
}
