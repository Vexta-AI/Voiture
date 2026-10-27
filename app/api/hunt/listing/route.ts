import { NextResponse } from 'next/server';

import { cronAuthorized } from '@/lib/auth';
import { findListings, storeEnabled } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/hunt/listing?id=<id> ou ?q=<texte> — annonces complètes (description, options, photos)
 * des 4 derniers jours, pour les lire hors du dashboard (Authorization: Bearer CRON_SECRET).
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!storeEnabled()) return NextResponse.json({ ok: false, error: 'missing_config', missing: ['DATABASE_URL'] }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const id = params.get('id')?.trim() || undefined;
  const text = params.get('q')?.trim().slice(0, 80) || undefined;
  if (!id && !text) return NextResponse.json({ ok: false, error: 'id ou q requis' }, { status: 400 });
  const limit = Math.min(Math.max(Number(params.get('limit')) || 10, 1), 50);

  const listings = await findListings({ id, text }, limit);
  return NextResponse.json({ ok: true, count: listings.length, listings });
}
