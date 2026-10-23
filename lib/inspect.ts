import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

import { INSPECTION, INSPECTION_SCHEMA, INSPECTION_SYSTEM, inspectionCostUsd, inspectionPrompt, parseInspection } from '@/backend/utils/inspection.js';

import { addInspectSpend, inspectSpend, loadInspection, saveInspection } from './store';
import type { Inspection, Listing } from './types';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
/** Limite de taille d'une image par l'API : https://platform.claude.com/docs/en/build-with-claude/vision */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const inspectionEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const monthlyBudget = () => Number(process.env.INSPECT_BUDGET_USD) || INSPECTION.monthlyBudgetUsd;

/** Télécharge une photo de l'annonce ; null si elle n'est pas lisible (lien mort, format, taille). */
async function fetchPhoto(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim() as ImageType;
    if (!IMAGE_TYPES.includes(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
    return { type, data: bytes.toString('base64') };
  } catch {
    return null;
  }
}

export type InspectResult = { ok: true; inspection: Inspection; cached: boolean } | { ok: false; error: string };

/**
 * Inspecte les photos d'une annonce avec Claude (vision).
 * Gardée une fois faite : seule une demande explicite (`force`) la refait. Plafonnée par un budget mensuel.
 */
export async function inspectListing(listing: Listing, options: { force?: boolean } = {}): Promise<InspectResult> {
  if (!inspectionEnabled()) return { ok: false, error: 'ANTHROPIC_API_KEY manquante dans Vercel' };
  if (!options.force) {
    const existing = await loadInspection<Inspection>(listing.id).catch(() => null);
    if (existing) return { ok: true, inspection: existing, cached: true };
  }
  const spend = await inspectSpend();
  if (spend.usd >= monthlyBudget()) return { ok: false, error: `Budget IA du mois atteint (${spend.usd.toFixed(2)} $ / ${monthlyBudget()} $)` };

  const photos = (await Promise.all((listing.photos ?? []).slice(0, INSPECTION.maxPhotos).map(fetchPhoto))).filter((p) => p !== null);
  if (photos.length === 0) return { ok: false, error: 'Aucune photo lisible sur cette annonce' };

  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...photos.map((p): Anthropic.Beta.BetaImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: p.type, data: p.data } })),
    { type: 'text', text: inspectionPrompt(listing, photos.length) },
  ];

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create(
      {
        model: MODEL,
        max_tokens: 8000,
        system: INSPECTION_SYSTEM,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: INSPECTION_SCHEMA } },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: [{ role: 'user', content }],
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    console.error('[inspect]', listing.id, error);
    const reason =
      error instanceof Anthropic.RateLimitError
        ? 'Limite de requêtes IA atteinte, réessaie dans un instant'
        : error instanceof Anthropic.AuthenticationError
          ? 'Clé ANTHROPIC_API_KEY invalide'
          : error instanceof Anthropic.APIError
            ? `Erreur API IA (${error.status ?? 'réseau'})`
            : 'Erreur IA inattendue';
    return { ok: false, error: reason };
  }

  const costUsd = inspectionCostUsd(response.usage);
  await addInspectSpend(costUsd).catch((error) => console.error('[inspect] spend', error));
  if (response.stop_reason === 'refusal') return { ok: false, error: 'L’IA a refusé d’analyser ces photos' };
  if (response.stop_reason === 'max_tokens') return { ok: false, error: 'Réponse IA incomplète' };

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Réponse IA illisible' };
  }
  const parsed = parseInspection(raw, photos.length);
  if (!parsed) return { ok: false, error: 'Réponse IA invalide' };

  const inspection: Inspection = {
    ...parsed,
    listingId: listing.id,
    price: listing.price,
    photosAnalysed: photos.length,
    photosTotal: listing.photos?.length ?? 0,
    model: response.model,
    costUsd,
    at: new Date().toISOString(),
  };
  await saveInspection(listing.id, inspection);
  return { ok: true, inspection, cached: false };
}
