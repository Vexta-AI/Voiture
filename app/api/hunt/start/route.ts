import { NextResponse } from 'next/server';

import { cronAuthorized } from '@/lib/auth';
import { huntConfig, missingConfig, startHunt } from '@/lib/hunt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/hunt/start — appelé par Vercel Cron (Authorization: Bearer CRON_SECRET).
 * Lance les recherches Apify ; chaque run rappelle /api/hunt/ingest à la fin.
 * Déclenchement manuel : même en-tête, ?market=1 pour forcer le rafraîchissement des comparables.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const missing = missingConfig(huntConfig(), ['apify', 'ingest', 'url', 'store']);
  if (missing.length) return NextResponse.json({ ok: false, error: 'missing_config', missing }, { status: 503 });

  const market = new URL(request.url).searchParams.get('market');
  try {
    const result = await startHunt({ includeMarket: market === '1' ? true : undefined });
    const failed = result.runs.filter((r) => 'error' in r).length;
    return NextResponse.json({ ok: failed === 0, ...result }, { status: failed === result.runs.length ? 502 : 200 });
  } catch (error) {
    console.error('[api/hunt/start]', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'start_failed' }, { status: 500 });
  }
}
