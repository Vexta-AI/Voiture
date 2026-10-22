import { NextResponse } from 'next/server';

import { secretMatches } from '@/lib/auth';
import { continueBatch, huntConfig, ingestRun, missingConfig } from '@/lib/hunt';
import { logIngest } from '@/lib/store';

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

  const params = new URL(request.url).searchParams;
  const source = params.get('source') ?? '';
  const batch = params.get('batch');
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

  let summary: Awaited<ReturnType<typeof ingestRun>> | { ok: false; error: string };
  try {
    summary = await ingestRun(runId, source);
  } catch (error) {
    console.error('[api/hunt/ingest]', error);
    summary = { ok: false, error: 'ingest_failed' };
  }
  // Le run est terminé (succès ou échec) : un créneau Apify se libère, on lance la recherche suivante du lot.
  const next = batch ? await continueBatch(batch).catch((error) => (console.error('[api/hunt/ingest] next', error), [])) : [];
  await logIngest({ runId, source, batch, summary, next }).catch((error) => console.error('[api/hunt/ingest] log', error));
  // 200 même pour un run en échec : rien à rejouer côté Apify, le résumé suffit au diagnostic.
  return NextResponse.json({ ...summary, next }, { status: summary.ok === false && summary.error === 'ingest_failed' ? 500 : 200 });
}
