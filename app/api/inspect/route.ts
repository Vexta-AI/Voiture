import { NextResponse } from 'next/server';

import { loadLiveRadar } from '@/lib/hunt';
import { inspectListing, inspectionEnabled } from '@/lib/inspect';
import { inspectSpend } from '@/lib/store';
import { INSPECTION } from '@/backend/utils/inspection.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/** GET /api/inspect : IA activée ? dépense du mois. */
export async function GET() {
  const spend = inspectionEnabled() ? await inspectSpend().catch(() => null) : null;
  return NextResponse.json({ enabled: inspectionEnabled(), budgetUsd: Number(process.env.INSPECT_BUDGET_USD) || INSPECTION.monthlyBudgetUsd, spend });
}

/**
 * POST /api/inspect  body: { listingId, force? }
 * Inspection IA des photos d'une annonce du radar. Seules les annonces déjà relevées par le radar
 * sont inspectables (jamais une URL arbitraire).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 });
  }
  const listingId = typeof body.listingId === 'string' ? body.listingId : '';
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId requis' }, { status: 400 });
  const live = await loadLiveRadar();
  const listing = live && [...live.listings, ...live.pending].find((l) => l.id === listingId);
  if (!listing) return NextResponse.json({ ok: false, error: 'Annonce introuvable dans le radar (3 derniers jours)' }, { status: 404 });
  const result = await inspectListing(listing, { force: body.force === true });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
