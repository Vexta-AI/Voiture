import { NextResponse } from 'next/server';

import { estimateMarketPrice } from '@/backend/pipeline/market.js';
import { saleFile } from '@/backend/utils/sale.js';
import { loadPoolFor, storeEnabled } from '@/lib/store';
import type { Listing } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/sale — dossier de vente d'une voiture (la tienne ou ton stock) : prix d'affichage et plancher
 * (cote = médiane des annonces comparables du radar), annonce, réponses types, check-list des papiers.
 * Derrière le mot de passe du dashboard (middleware).
 */
export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 });
  }
  const year = Number(input.year);
  const mileage = Number(input.mileage);
  if (!input.brand || !input.model || !(year > 1980) || !(mileage >= 0)) {
    return NextResponse.json({ ok: false, error: 'Marque, modèle, année et kilométrage sont requis.' }, { status: 422 });
  }
  const probe = {
    id: 'vente-probe',
    type: 'auto',
    title: [input.brand, input.model, input.version].filter(Boolean).join(' '),
    brand: String(input.brand),
    model: String(input.model),
    year,
    mileage,
    price: 1,
    marketPrice: 0,
    fuel: input.fuel,
    gearbox: input.gearbox,
    publishedAt: new Date().toISOString(),
  } as unknown as Listing;
  let market: (ReturnType<typeof estimateMarketPrice> & { criteria?: string[]; samples?: unknown[] }) | null = null;
  if (storeEnabled()) {
    const pool = await loadPoolFor([probe]).catch(() => null);
    market = pool ? estimateMarketPrice(probe, pool.listings) : null;
  }
  const file = saleFile({ ...input, year, mileage } as Parameters<typeof saleFile>[0], { market });
  return NextResponse.json({ ok: true, ...file, marketCriteria: market?.criteria ?? null, samples: market?.samples ?? [] });
}
