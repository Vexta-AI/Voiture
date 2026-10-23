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
const LOG_PREFIX = 'radar/log/';
const ONDEMAND_PREFIX = 'radar/ondemand/';

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

/** Journal d'un retour Apify (un fichier par webhook, jamais réécrit). */
export async function logIngest(entry: Record<string, unknown>) {
  const at = new Date().toISOString();
  const safe = String(entry.source ?? 'unknown').replace(/[^a-zA-Z0-9-]/g, '_');
  await writeJson(`${LOG_PREFIX}${at.slice(0, 10)}/${at.replace(/[:.]/g, '-')}-${safe}.json`, { at, ...entry }, true);
}

/** Derniers retours Apify journalisés, du plus récent au plus ancien. */
export async function recentIngestLogs(limit = 50) {
  const blobs = (await listAll(LOG_PREFIX)).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()).slice(0, limit);
  const logs = await Promise.all(blobs.map((b) => readJson<Record<string, unknown>>(b.pathname).catch(() => null)));
  return logs.filter((l): l is Record<string, unknown> => l !== null);
}

/** Avancement d'un lot : sources lancées (réservées) sur le total. */
export async function batchProgress(batchId: string) {
  const batch = await loadBatch(batchId);
  if (!batch) return null;
  const claimed = (await listAll(`${CLAIMS_PREFIX}${batchId}/`)).length;
  return { batchId, total: batch.keys.length, launched: claimed };
}

/** Nombre de runs stockés et d'annonces, par source. */
export async function runsSummary(days: number) {
  const runs = await loadRuns(days);
  const bySource: Record<string, { runs: number; listings: number; last: string }> = {};
  for (const r of runs) {
    const s = (bySource[r.source] ??= { runs: 0, listings: 0, last: r.fetchedAt });
    s.runs += 1;
    s.listings += r.listings.length;
    if (r.fetchedAt > s.last) s.last = r.fetchedAt;
  }
  return bySource;
}

/** Recherche de comparables lancée à la demande : gardée pour l'ingestion et le délai de relance. */
export async function markOndemand(source: { key: string }) {
  await writeJson(`${ONDEMAND_PREFIX}${source.key}.json`, { launchedAt: new Date().toISOString(), source }, true);
}

export async function loadOndemand<T>(key: string) {
  return (await readJson<{ source: T }>(`${ONDEMAND_PREFIX}${key}.json`))?.source ?? null;
}

/** Clés des recherches à la demande lancées depuis moins de `days` jours. */
export async function recentOndemandKeys(days: number) {
  const since = Date.now() - days * 86_400_000;
  return new Set(
    (await listAll(ONDEMAND_PREFIX)).filter((b) => b.uploadedAt.getTime() >= since).map((b) => b.pathname.slice(ONDEMAND_PREFIX.length).replace(/\.json$/, '')),
  );
}

const INSPECTIONS_PREFIX = 'radar/inspections/';
const INSPECT_SPEND_PREFIX = 'radar/inspect-spend/';
const safeKey = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, '_');

/** Inspection IA des photos d'une annonce (une par annonce, refaite seulement à la demande). */
export async function saveInspection(listingId: string, inspection: unknown) {
  await writeJson(`${INSPECTIONS_PREFIX}${safeKey(listingId)}.json`, inspection, true);
}

export async function loadInspection<T>(listingId: string) {
  return readJson<T>(`${INSPECTIONS_PREFIX}${safeKey(listingId)}.json`);
}

/** Inspections des annonces demandées (celles qui existent). */
export async function loadInspections<T>(listingIds: string[]) {
  const wanted = new Map(listingIds.map((id) => [`${INSPECTIONS_PREFIX}${safeKey(id)}.json`, id]));
  const blobs = (await listAll(INSPECTIONS_PREFIX)).filter((b) => wanted.has(b.pathname));
  const out = new Map<string, T>();
  await Promise.all(
    blobs.map(async (b) => {
      const value = await readJson<T>(b.pathname).catch(() => null);
      if (value) out.set(wanted.get(b.pathname) as string, value);
    }),
  );
  return out;
}

/** Dépense IA du mois (dollars facturés par Anthropic, estimés depuis les tokens). */
export async function inspectSpend(month = new Date().toISOString().slice(0, 7)) {
  return (await readJson<{ usd: number; count: number }>(`${INSPECT_SPEND_PREFIX}${month}.json`)) ?? { usd: 0, count: 0 };
}

export async function addInspectSpend(usd: number, month = new Date().toISOString().slice(0, 7)) {
  const current = await inspectSpend(month);
  await writeJson(`${INSPECT_SPEND_PREFIX}${month}.json`, { usd: Math.round((current.usd + usd) * 10_000) / 10_000, count: current.count + 1 }, true);
}
