import { NextResponse } from 'next/server';

import { secretMatches } from '@/lib/auth';
import { huntConfig, ingestRun, missingConfig } from '@/lib/hunt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/hunt/ingest?source=<clé> — webhook Apify de fin de run (en-tête x-ingest-secret).
 * Seul l'id du run est lu dans le webhook : run et annonces sont relus chez Apify avec notre token.
 */
export async function POST(request: Request) {
  const config = huntConfig();
  if (!secretMatches(request.headers.get('x-ingest-secret'), config.ingestSecret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const missing = missingConfig(config, ['apify', 'store']);
  if (missing.length) return NextResponse.json({ ok: false, error: 'missing_config', missing }, { status: 503 });

  const source = new URL(request.url).searchParams.get('source') ?? '';
  let runId: unknown;
  try {
    const body = await request.json();
    runId = body?.resource?.id ?? body?.eventData?.actorRunId;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  if (typeof runId !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(runId)) {
    return NextResponse.json({ ok: false, error: 'missing_run_id' }, { status: 400 });
  }

  try {
    const summary = await ingestRun(runId, source);
    // 200 même pour un run en échec : rien à rejouer côté Apify, le résumé suffit au diagnostic.
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[api/hunt/ingest]', error);
    return NextResponse.json({ ok: false, error: 'ingest_failed' }, { status: 500 });
  }
}
