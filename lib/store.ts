import 'server-only';

import { BlobNotFoundError, del, get, head, list, put } from '@vercel/blob';

import type { Listing } from './types';

/**
 * Stockage du radar dans Vercel Blob (store privé).
 *   radar/runs/<date>/<source>-<runId>.json   un fichier par run Apify (jamais réécrit)
 *   radar/alerts/<clé>.json                   marqueur d'alerte déjà envoyée (anti-doublon)
 */

export interface StoredRun {
  runId: string;
  source: string;
  kind: 'fresh' | 'stale' | 'market';
  type: 'auto' | 'moto';
  fetchedAt: string;
  listings: Listing[];
  rejected: number;
}

const RUNS_PREFIX = 'radar/runs/';
const ALERTS_PREFIX = 'radar/alerts/';
const BATCHES_PREFIX = 'radar/batches/';
const CLAIMS_PREFIX = 'radar/claims/';

export const storeEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

async function readJson<T>(pathname: string): Promise<T | null> {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return (await new Response(result.stream).json()) as T;
}

async function exists(pathname: string) {
  try {
    await head(pathname);
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return false;
    throw error;
  }
}

async function writeJson(pathname: string, data: unknown, overwrite = false) {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    contentType: 'application/json',
  });
}

export async function saveRun(run: StoredRun) {
  const day = run.fetchedAt.slice(0, 10);
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, '_');
  await writeJson(`${RUNS_PREFIX}${day}/${safe(run.source)}-${safe(run.runId)}.json`, run, true);
}

async function listAll(prefix: string) {
  const blobs: { pathname: string; uploadedAt: Date; url: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

/** Runs des `days` derniers jours, du plus ancien au plus récent. */
export async function loadRuns(days: number): Promise<StoredRun[]> {
  const since = Date.now() - days * 86_400_000;
  const blobs = (await listAll(RUNS_PREFIX)).filter((b) => b.uploadedAt.getTime() >= since);
  blobs.sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
  const runs = await Promise.all(blobs.map((b) => readJson<StoredRun>(b.pathname).catch(() => null)));
  return runs.filter((r): r is StoredRun => r !== null);
}

/** Supprime les runs plus vieux que `days` jours. */
export async function pruneRuns(days: number) {
  const before = Date.now() - days * 86_400_000;
  const old = (await listAll(RUNS_PREFIX)).filter((b) => b.uploadedAt.getTime() < before);
  if (old.length) await del(old.map((b) => b.url));
  return old.length;
}

/** true si l'alerte a déjà été envoyée. */
export async function alertAlreadySent(key: string) {
  return exists(`${ALERTS_PREFIX}${key}.json`);
}

/** Lot de recherches du jour : liste ordonnée des sources à lancer, dans la limite de concurrence Apify. */
export async function saveBatch(batchId: string, keys: string[]) {
  await writeJson(`${BATCHES_PREFIX}${batchId}.json`, { batchId, keys, createdAt: new Date().toISOString() }, true);
}

export async function loadBatch(batchId: string) {
  return readJson<{ batchId: string; keys: string[] }>(`${BATCHES_PREFIX}${batchId}.json`);
}

const claimPath = (batchId: string, key: string) => `${CLAIMS_PREFIX}${batchId}/${key}.json`;

/**
 * Réserve une source d'un lot (verrou) : la création sans écrasement échoue si le fichier existe,
 * donc deux webhooks simultanés ne peuvent pas lancer la même recherche.
 * @returns true si la réservation est obtenue
 */
export async function claimSource(batchId: string, key: string) {
  try {
    await writeJson(claimPath(batchId, key), { claimedAt: new Date().toISOString() });
    return true;
  } catch (error) {
    if (await exists(claimPath(batchId, key))) return false;
    throw error;
  }
}

/** Libère une réservation (lancement refusé par Apify, à retenter plus tard). */
export async function releaseSource(batchId: string, key: string) {
  await del(claimPath(batchId, key)).catch(() => undefined);
}

export async function markAlertSent(key: string, data: unknown) {
  await writeJson(`${ALERTS_PREFIX}${key}.json`, { sentAt: new Date().toISOString(), ...(data as object) }, true);
}
