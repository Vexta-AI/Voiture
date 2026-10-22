import { NextResponse } from 'next/server';

import { HUNT_LIMITS } from '@/backend/config/sources.js';
import { cronAuthorized } from '@/lib/auth';
import { batchProgress, recentIngestLogs, runsSummary, storeEnabled } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/hunt/status[?batch=<id>] — diagnostic de la chasse (Authorization: Bearer CRON_SECRET) :
 * derniers retours Apify, runs stockés par source, avancement d'un lot.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!storeEnabled()) return NextResponse.json({ ok: false, error: 'missing_config', missing: ['BLOB_READ_WRITE_TOKEN'] }, { status: 503 });

  const batch = new URL(request.url).searchParams.get('batch');
  const [logs, runs, progress] = await Promise.all([
    recentIngestLogs(30),
    runsSummary(HUNT_LIMITS.retentionDays),
    batch && /^[A-Za-z0-9-]{1,64}$/.test(batch) ? batchProgress(batch) : Promise.resolve(null),
  ]);
  return NextResponse.json({ ok: true, batch: progress, runs, logs });
}
