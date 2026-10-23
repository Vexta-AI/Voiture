import { NextResponse } from 'next/server';

import { cronAuthorized } from '@/lib/auth';
import { huntConfig, missingConfig, startHunt } from '@/lib/hunt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/hunt/extra — passages du midi et du soir (Vercel Cron, Authorization: Bearer CRON_SECRET).
 * Seulement les annonces fraîches : les recherches hebdomadaires et le résumé CRM restent sur le passage du matin.
 * Plan Hobby : chaque entrée de cron ne tourne qu'une fois par jour, d'où une entrée par créneau dans vercel.json.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const missing = missingConfig(huntConfig(), ['apify', 'ingest', 'url', 'store']);
  if (missing.length) return NextResponse.json({ ok: false, error: 'missing_config', missing }, { status: 503 });
  try {
    const result = await startHunt({ includeWeekly: false });
    const ok = result.started > 0;
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 502 });
  } catch (error) {
    console.error('[api/hunt/extra]', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'start_failed' }, { status: 500 });
  }
}
