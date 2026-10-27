/**
 * Client Apify minimal (API REST v2).
 * Le webhook de fin de run ne transporte que l'id du run : les données sont toujours
 * relues chez Apify avec notre token, donc un webhook forgé ne peut pas injecter d'annonces.
 */

import { APIFY_ACTOR_ID, actorInput } from '../config/sources.js';

const API = 'https://api.apify.com/v2';

async function apify(path, { token, method = 'GET', body, fetchImpl = fetch }) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    // status : distingue les refus de capacité (402/429) des vraies erreurs
    throw Object.assign(new Error(`Apify ${method} ${path.split('?')[0]} -> ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status });
  }
  return res.json();
}

/** Refus temporaire de capacité (limite de runs simultanés, quota) : la recherche sera retentée. */
export function isCapacityError(error) {
  return error instanceof Error && 'status' in error && (error.status === 402 || error.status === 429);
}

/**
 * Lance un run asynchrone avec webhook de retour (succès ou échec).
 * bypassSecret : jeton "Protection Bypass for Automation" de Vercel, pour traverser la
 * protection du déploiement (le dashboard reste privé, seul le webhook passe).
 * batchId : lot de recherches auquel appartient le run (le webhook lance la suivante du lot).
 * @param {{ token: string, source: import('../config/sources.js').HuntSource, webhookUrl: string, webhookSecret: string, maxChargeUsd: number, bypassSecret?: string, batchId?: string, fetchImpl?: typeof fetch }} params
 */
export async function startRun({ token, source, webhookUrl, webhookSecret, maxChargeUsd, bypassSecret, batchId, fetchImpl }) {
  const callback = new URLSearchParams({ source: source.key, ...(batchId ? { batch: batchId } : {}) });
  const webhooks = [
    {
      eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'],
      requestUrl: `${webhookUrl}?${callback}`,
      headersTemplate: JSON.stringify({
        'x-ingest-secret': webhookSecret,
        ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
      }),
    },
  ];
  const query = new URLSearchParams({
    webhooks: Buffer.from(JSON.stringify(webhooks)).toString('base64'),
    maxTotalChargeUsd: String(maxChargeUsd),
  });
  const { data } = await apify(`/acts/${source.actorId ?? APIFY_ACTOR_ID}/runs?${query}`, { token, method: 'POST', body: actorInput(source), fetchImpl });
  return { runId: data.id, status: data.status };
}

/** @param {{ token: string, runId: string, fetchImpl?: typeof fetch }} params */
export async function getRun({ token, runId, fetchImpl }) {
  const { data } = await apify(`/actor-runs/${encodeURIComponent(runId)}`, { token, fetchImpl });
  return { id: data.id, status: data.status, datasetId: data.defaultDatasetId, actId: data.actId };
}

/** @param {{ token: string, datasetId: string, limit?: number, fetchImpl?: typeof fetch }} params */
export async function getDatasetItems({ token, datasetId, limit = 1000, fetchImpl }) {
  return apify(`/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json&limit=${limit}`, { token, fetchImpl });
}
