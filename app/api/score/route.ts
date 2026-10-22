import { NextResponse } from 'next/server';

import { scoreListing } from '@/backend/utils/scoring.js';
import { validateListing } from '@/lib/validate';

/**
 * POST /api/score — score une annonce (ou un tableau d'annonces).
 * Point d'entrée pour un scraper / n8n / Zapier : le moteur reste la source de vérité.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > 200) {
    return NextResponse.json({ error: 'Envoyer entre 1 et 200 annonces' }, { status: 400 });
  }

  const results = [];
  for (const [index, item] of items.entries()) {
    const parsed = validateListing(item);
    if (!parsed.ok) return NextResponse.json({ error: `Annonce #${index} : ${parsed.error}` }, { status: 422 });
    results.push({ listing: parsed.listing, analysis: scoreListing(parsed.listing) });
  }

  return NextResponse.json(Array.isArray(body) ? { results } : results[0]);
}
