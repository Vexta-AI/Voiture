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
  if (!res.ok) throw new Error(`Apify ${method} ${path.split('?')[0]} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/**
 * Lance un run asynchrone avec webhook de retour (succès ou échec).
 * bypassSecret : jeton "Protection Bypass for Automation" de Vercel, pour traverser la
 * protection du déploiement (le dashboard reste privé, seul le webhook passe).
 * @param {{ token: string, source: import('../config/sources.js').HuntSource, webhookUrl: string, webhookSecret: string, maxChargeUsd: number, bypassSecret?: string, fetchImpl?: typeof fetch }} params
 */
export async function startRun({ token, source, webhookUrl, webhookSecret, maxChargeUsd, bypassSecret, fetchImpl }) {
  const webhooks = [
    {
      eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'],
      requestUrl: `${webhookUrl}?source=${encodeURIComponent(source.key)}`,
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
  const { data } = await apify(`/acts/${APIFY_ACTOR_ID}/runs?${query}`, { token, method: 'POST', body: actorInput(source), fetchImpl });
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
