import { NextResponse } from 'next/server';

import { cronAuthorized } from '@/lib/auth';
import { sendPendingVerifyAlerts } from '@/lib/hunt';
import { storeEnabled } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/hunt/verify (Authorization: Bearer CRON_SECRET) — envoie les alertes « à vérifier » des annonces
 * déjà relevées, sans lancer de recherche Apify (aucun coût). Les alertes déjà envoyées ne repartent pas.
 */
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!storeEnabled()) return NextResponse.json({ ok: false, error: 'missing_config', missing: ['BLOB_READ_WRITE_TOKEN'] }, { status: 503 });
  return NextResponse.json({ ok: true, ...(await sendPendingVerifyAlerts()) });
}
