import { NextResponse } from 'next/server';

import { cronAuthorized } from '@/lib/auth';
import { huntConfig, missingConfig, sendCrmDigest, startHunt } from '@/lib/hunt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/hunt/start — appelé par Vercel Cron (Authorization: Bearer CRON_SECRET).
 * Lance les recherches Apify ; chaque run rappelle /api/hunt/ingest à la fin.
 * Déclenchement manuel : même en-tête, ?weekly=1 pour forcer aussi les recherches hebdomadaires
 * (annonces anciennes + comparables), indispensable au tout premier lancement.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const missing = missingConfig(huntConfig(), ['apify', 'ingest', 'url', 'store']);
  if (missing.length) return NextResponse.json({ ok: false, error: 'missing_config', missing }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const weekly = params.get('weekly') === '1' || params.get('market') === '1';
  try {
    const result = await startHunt({ includeWeekly: weekly ? true : undefined });
    const digest = await sendCrmDigest().catch((error: unknown) => {
      console.error('[api/hunt/start] digest', error);
      return { sent: false };
    });
    // Les sources non lancées restent en file : chaque run terminé lance la suivante (limite de concurrence Apify).
    const ok = result.started > 0;
    return NextResponse.json({ ok, ...result, digest }, { status: ok ? 200 : 502 });
  } catch (error) {
    console.error('[api/hunt/start]', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'start_failed' }, { status: 500 });
  }
}
