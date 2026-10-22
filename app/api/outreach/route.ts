import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { buildOutreachPayload } from '@/backend/utils/outreach.js';
import { scoreListing } from '@/backend/utils/scoring.js';
import { validateListing } from '@/lib/validate';

export const runtime = 'nodejs';

const STRATEGIES = new Set(['auto', 'negotiation', 'mandate']);

/**
 * POST /api/outreach — message autonome pour une annonce PÉPITE (ou J+15 pour le mandat).
 *
 * Body : { listing, strategy?: 'auto'|'negotiation'|'mandate', dispatch?: boolean, signature?, company? }
 *        (l'annonce peut aussi être envoyée directement à la racine du body)
 *
 * L'annonce est toujours re-scorée côté serveur : une analyse fournie par le client est ignorée.
 *
 * Réponses :
 *   200 { ok: true, ... }                    payload prêt pour Make.com (voir README)
 *   200 { ok: false, error: 'not_eligible' } annonce valide mais pas éligible (filtrable dans Make sur "ok")
 *   400 / 422                                JSON ou annonce invalide
 *   401                                      dispatch demandé sans clé valide
 *
 * dispatch: true pousse le payload vers MAKE_WEBHOOK_URL (requiert OUTREACH_API_KEY + en-tête x-api-key).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error();
    body = raw;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = validateListing(body.listing ?? body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: 'invalid_listing', reason: parsed.error }, { status: 422 });

  const strategy = typeof body.strategy === 'string' && STRATEGIES.has(body.strategy) ? body.strategy : 'auto';
  const listing = parsed.listing;
  const payload = buildOutreachPayload(listing, scoreListing(listing), {
    strategy: strategy as 'auto' | 'negotiation' | 'mandate',
    signature: typeof body.signature === 'string' ? body.signature.slice(0, 200) : undefined,
    company: typeof body.company === 'string' ? body.company.slice(0, 120) : undefined,
  });

  if (!payload.ok || body.dispatch !== true) return NextResponse.json(payload);

  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized', reason: 'dispatch requiert OUTREACH_API_KEY et l’en-tête x-api-key.' }, { status: 401 });
  }
  return NextResponse.json({ ...payload, dispatch: await dispatchToMake(payload) });
}

function isAuthorized(request: Request) {
  const expected = process.env.OUTREACH_API_KEY;
  const provided = request.headers.get('x-api-key');
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function dispatchToMake(payload: unknown) {
  const url = process.env.MAKE_WEBHOOK_URL;
  if (!url) return { sent: false, error: 'MAKE_WEBHOOK_URL non configurée' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { sent: true, status: res.status } : { sent: false, status: res.status, error: 'Webhook Make en erreur' };
  } catch (error) {
    console.error('[api/outreach] dispatch', error);
    return { sent: false, error: 'Webhook Make injoignable' };
  }
}
