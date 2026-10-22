import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { generateMandateMessage, generateNegotiationMessage } from '@/backend/utils/messages.js';
import { scoreListing } from '@/backend/utils/scoring.js';
import { validateListing } from '@/lib/validate';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const SYSTEM_PROMPT = `Tu es un acheteur-revendeur automobile et moto professionnel basé à Bordeaux.
Tu réécris un message destiné à un particulier qui vend son véhicule sur une plateforme d'annonces.

Objectif : que le vendeur réponde. Le ton est humain, poli, concret et sûr de lui, jamais agressif ni condescendant.
- Conserve STRICTEMENT tous les montants, l'offre, les défauts cités et les engagements du brouillon. N'invente aucun fait sur le véhicule.
- Reste court : 120 à 180 mots, format message (pas d'objet, pas de markdown, puces "•" autorisées).
- Français naturel, vouvoiement.
Réponds uniquement avec le message final.`;

export function GET() {
  return NextResponse.json({ aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL });
}

/**
 * POST /api/messages
 * body: { listing, kind: 'negotiation' | 'mandate', tone?: 'courtois' | 'direct', refine?: boolean }
 * Génère le script via le moteur de templates, puis l'affine avec Claude si demandé et configuré.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const parsed = validateListing(body.listing);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const kind = body.kind === 'mandate' ? 'mandate' : 'negotiation';
  const tone = body.tone === 'direct' ? 'direct' : 'courtois';

  const listing = parsed.listing;
  const analysis = scoreListing(listing);
  if (kind === 'mandate' && !analysis.mandateEligible) {
    return NextResponse.json({ error: 'Annonce non éligible au mandat (moins de 15 jours en ligne ou blacklistée).' }, { status: 409 });
  }

  const draft = kind === 'mandate' ? generateMandateMessage(listing, analysis) : generateNegotiationMessage(listing, analysis, { tone });

  if (!body.refine || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ text: draft.text, source: 'template', draft });
  }

  try {
    const text = await refineWithClaude(draft.text, kind);
    return NextResponse.json({ text: text ?? draft.text, source: text ? 'claude' : 'template', draft });
  } catch (error) {
    // Le template reste toujours disponible : l'IA est un bonus, jamais un point de blocage.
    const reason =
      error instanceof Anthropic.RateLimitError
        ? 'Limite de requêtes IA atteinte, réessayez dans un instant.'
        : error instanceof Anthropic.AuthenticationError
          ? 'Clé ANTHROPIC_API_KEY invalide.'
          : error instanceof Anthropic.APIError
            ? `Erreur API IA (${error.status ?? 'réseau'}).`
            : 'Erreur IA inattendue.';
    console.error('[api/messages]', error);
    return NextResponse.json({ text: draft.text, source: 'template', draft, warning: reason });
  }
}

async function refineWithClaude(draft: string, kind: 'negotiation' | 'mandate') {
  const client = new Anthropic();
  const goal =
    kind === 'mandate'
      ? "Proposition de dépôt-vente / mandat à un vendeur dont l'annonce stagne."
      : 'Message de négociation de prix argumenté par les défauts relevés.';

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: `Type : ${goal}\n\nBrouillon à réécrire :\n${draft}` }],
  });

  if (response.stop_reason === 'refusal') return null;
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  return text || null;
}
