import 'server-only';

import { vehicleFingerprint } from '@/backend/pipeline/history.js';
import { modelKey } from '@/backend/pipeline/market.js';
import { historyFromPool, mergePoolEntry, repostIndexFromPool, type PoolEntry } from '@/backend/pipeline/pool.js';

import { dbEnabled, q } from './db';
import type { Listing } from './types';

/**
 * Stockage du radar dans Neon Postgres. Pensé pour l'offre gratuite : chaque passage ne lit que
 * les annonces utiles (même modèle, même véhicule), jamais tout le stock.
 *
 *   runs       runs Apify complets (annonces avec description), gardés 4 jours (alertes, dashboard)
 *   run_meta   résumé de chaque run sur 90 jours (diagnostic)
 *   pool       une entrée compacte par annonce vue (comparables + historique de prix), 90 jours
 *   alerts     alertes déjà envoyées (anti-doublon) ; batches / claims : lots du jour et sources lancées
 *   logs       derniers retours Apify ; ondemand : recherches de comparables à la demande
 *   inspections / spend : inspection IA par annonce et dépense du mois
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

/** Durée de vie des runs complets : le dashboard et les alertes ne regardent que les 3 derniers jours. */
const FULL_RUN_DAYS = 4;
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export const storeEnabled = () => dbEnabled();

/** Enregistre un run : complet pour 4 jours, et chaque annonce fusionnée dans le stock compact. */
export async function saveRun(run: StoredRun) {
  await q(`INSERT INTO runs (run_id, fetched_at, kind, run) VALUES ($1, $2, $3, $4) ON CONFLICT (run_id) DO UPDATE SET run = excluded.run`, [
    run.runId,
    run.fetchedAt,
    run.kind,
    JSON.stringify(run),
  ]);
  await q(
    `INSERT INTO run_meta (run_id, fetched_at, source, kind, listings, with_photos) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (run_id) DO NOTHING`,
    [run.runId, run.fetchedAt, run.source, run.kind, run.listings.length, run.listings.filter((l) => l.photos?.length).length],
  );
  const ids = [...new Set(run.listings.map((l) => l.id))];
  if (!ids.length) return;
  const previous = new Map(
    (await q<{ id: string; entry: PoolEntry }>(`SELECT id, entry FROM pool WHERE id = ANY($1)`, [ids])).map((r) => [r.id, r.entry]),
  );
  const merged = new Map<string, PoolEntry>();
  for (const l of run.listings) merged.set(l.id, mergePoolEntry(merged.get(l.id) ?? previous.get(l.id) ?? null, l, run.fetchedAt));
  const rows = [...merged.values()].map((entry) => ({
    id: entry.listing.id,
    modelKey: modelKey(entry.listing),
    fp: vehicleFingerprint(entry.listing),
    lastSeen: entry.lastSeenAt,
    entry,
  }));
  await q(
    `INSERT INTO pool (id, model_key, fingerprint, last_seen, entry)
     SELECT e->>'id', e->>'modelKey', e->>'fp', (e->>'lastSeen')::timestamptz, e->'entry' FROM jsonb_array_elements($1::jsonb) e
     ON CONFLICT (id) DO UPDATE SET model_key = excluded.model_key, fingerprint = excluded.fingerprint, last_seen = excluded.last_seen, entry = excluded.entry`,
    [JSON.stringify(rows)],
  );
}

/** Runs complets des `days` derniers jours (4 au plus), du plus ancien au plus récent. */
export async function loadRecentRuns(days: number): Promise<StoredRun[]> {
  const rows = await q<{ run: StoredRun }>(`SELECT run FROM runs WHERE fetched_at >= $1 ORDER BY fetched_at`, [daysAgo(Math.min(days, FULL_RUN_DAYS))]);
  return rows.map((r) => r.run);
}

/**
 * Stock utile à ces annonces : mêmes modèles (comparables, concurrence, revente locale), mêmes annonces
 * (historique de prix) et mêmes véhicules (annonces republiées). Jamais tout le stock.
 */
export async function loadPoolFor(listings: Listing[]) {
  const keys = [...new Set(listings.map((l) => modelKey(l)))];
  const ids = [...new Set(listings.map((l) => l.id))];
  const fps = [...new Set(listings.map((l) => vehicleFingerprint(l)).filter((x): x is string => Boolean(x)))];
  const entries = keys.length
    ? (await q<{ entry: PoolEntry }>(`SELECT entry FROM pool WHERE model_key = ANY($1) OR id = ANY($2) OR fingerprint = ANY($3)`, [keys, ids, fps])).map((r) => r.entry)
    : [];
  return {
    listings: entries.map((e) => e.listing as unknown as Listing),
    history: historyFromPool(entries),
    reposts: repostIndexFromPool(entries, vehicleFingerprint),
  };
}

export async function poolSize() {
  return Number((await q<{ n: string }>(`SELECT count(*) AS n FROM pool`))[0]?.n ?? 0);
}

/** Purge : stock et résumés au-delà de `days` jours, runs complets au-delà de 4 jours, journaux et lots anciens. */
export async function pruneRuns(days: number) {
  const removed = await q(`DELETE FROM pool WHERE last_seen < $1 RETURNING id`, [daysAgo(days)]);
  await q(`DELETE FROM runs WHERE fetched_at < $1`, [daysAgo(FULL_RUN_DAYS)]);
  await q(`DELETE FROM run_meta WHERE fetched_at < $1`, [daysAgo(days)]);
  await q(`DELETE FROM batches WHERE created_at < $1`, [daysAgo(3)]);
  await q(`DELETE FROM claims WHERE batch_id NOT IN (SELECT id FROM batches)`);
  await q(`DELETE FROM alerts WHERE sent_at < $1`, [daysAgo(180)]);
  await q(`DELETE FROM ondemand WHERE launched_at < $1`, [daysAgo(60)]);
  await q(`DELETE FROM logs WHERE id < (SELECT coalesce(max(id), 0) - 300 FROM logs)`);
  return removed.length;
}

/** true si l'alerte a déjà été envoyée. */
export async function alertAlreadySent(key: string) {
  return (await q(`SELECT 1 FROM alerts WHERE key = $1`, [key])).length > 0;
}

export async function markAlertSent(key: string, data: unknown) {
  await q(`INSERT INTO alerts (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET sent_at = now(), data = excluded.data`, [key, JSON.stringify(data ?? {})]);
}

/** Lot de recherches du jour : liste ordonnée des sources à lancer, dans la limite de concurrence Apify. */
export async function saveBatch(batchId: string, keys: string[]) {
  await q(`INSERT INTO batches (id, keys) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET keys = excluded.keys`, [batchId, JSON.stringify(keys)]);
}

export async function loadBatch(batchId: string) {
  const row = (await q<{ keys: string[] }>(`SELECT keys FROM batches WHERE id = $1`, [batchId]))[0];
  return row ? { batchId, keys: row.keys } : null;
}

/**
 * Réserve une source d'un lot (verrou atomique par clé primaire) : deux webhooks simultanés ne lancent
 * jamais la même recherche.
 * @returns true si la réservation est obtenue
 */
export async function claimSource(batchId: string, key: string) {
  return (await q(`INSERT INTO claims (batch_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING key`, [batchId, key])).length === 1;
}

/** Libère une réservation (lancement refusé par Apify, à retenter plus tard). */
export async function releaseSource(batchId: string, key: string) {
  await q(`DELETE FROM claims WHERE batch_id = $1 AND key = $2`, [batchId, key]);
}

/** Journal d'un retour Apify. */
export async function logIngest(entry: Record<string, unknown>) {
  await q(`INSERT INTO logs (entry) VALUES ($1)`, [JSON.stringify(entry)]);
}

/** Derniers retours Apify journalisés, du plus récent au plus ancien. */
export async function recentIngestLogs(limit = 50) {
  const rows = await q<{ at: string; entry: Record<string, unknown> }>(`SELECT at, entry FROM logs ORDER BY id DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({ at: new Date(r.at).toISOString(), ...r.entry }));
}

/** Avancement d'un lot : sources lancées (réservées) sur le total. */
export async function batchProgress(batchId: string) {
  const batch = await loadBatch(batchId);
  if (!batch) return null;
  const launched = Number((await q<{ n: string }>(`SELECT count(*) AS n FROM claims WHERE batch_id = $1`, [batchId]))[0]?.n ?? 0);
  return { batchId, total: batch.keys.length, launched };
}

/** Nombre de runs et d'annonces par source sur `days` jours. */
export async function runsSummary(days: number) {
  const rows = await q<{ source: string; runs: string; listings: string; with_photos: string; last: string }>(
    `SELECT source, count(*) AS runs, sum(listings) AS listings, sum(with_photos) AS with_photos, max(fetched_at) AS last
     FROM run_meta WHERE fetched_at >= $1 GROUP BY source`,
    [daysAgo(days)],
  );
  const bySource: Record<string, { runs: number; listings: number; withPhotos: number; last: string }> = {};
  for (const r of rows) bySource[r.source] = { runs: Number(r.runs), listings: Number(r.listings), withPhotos: Number(r.with_photos), last: new Date(r.last).toISOString() };
  return bySource;
}

/** Recherche de comparables lancée à la demande : gardée pour l'ingestion et le délai de relance. */
export async function markOndemand(source: { key: string }) {
  await q(`INSERT INTO ondemand (key, launched_at, source) VALUES ($1, now(), $2) ON CONFLICT (key) DO UPDATE SET launched_at = now(), source = excluded.source`, [
    source.key,
    JSON.stringify(source),
  ]);
}

export async function loadOndemand<T>(key: string) {
  return (await q<{ source: T }>(`SELECT source FROM ondemand WHERE key = $1`, [key]))[0]?.source ?? null;
}

/** Clés des recherches à la demande lancées depuis moins de `days` jours. */
export async function recentOndemandKeys(days: number) {
  return new Set((await q<{ key: string }>(`SELECT key FROM ondemand WHERE launched_at >= $1`, [daysAgo(days)])).map((r) => r.key));
}

/** Inspection IA des photos d'une annonce (une par annonce, refaite seulement à la demande). */
export async function saveInspection(listingId: string, inspection: unknown) {
  await q(`INSERT INTO inspections (listing_id, data) VALUES ($1, $2) ON CONFLICT (listing_id) DO UPDATE SET data = excluded.data`, [listingId, JSON.stringify(inspection)]);
}

export async function loadInspection<T>(listingId: string) {
  return (await q<{ data: T }>(`SELECT data FROM inspections WHERE listing_id = $1`, [listingId]))[0]?.data ?? null;
}

/** Inspections des annonces demandées (celles qui existent). */
export async function loadInspections<T>(listingIds: string[]) {
  const out = new Map<string, T>();
  if (!listingIds.length) return out;
  for (const r of await q<{ listing_id: string; data: T }>(`SELECT listing_id, data FROM inspections WHERE listing_id = ANY($1)`, [listingIds])) out.set(r.listing_id, r.data);
  return out;
}

const month = () => new Date().toISOString().slice(0, 7);

/** Dépense IA du mois (dollars facturés par Anthropic, estimés depuis les tokens). */
export async function inspectSpend(m = month()) {
  const row = (await q<{ usd: number; count: number }>(`SELECT usd, count FROM spend WHERE month = $1`, [m]))[0];
  return { usd: Number(row?.usd ?? 0), count: Number(row?.count ?? 0) };
}

/** Ajoute une dépense au compteur du mois (incrément atomique : deux inspections simultanées ne s'écrasent pas). */
export async function addInspectSpend(usd: number, m = month()) {
  await q(`INSERT INTO spend (month, usd, count) VALUES ($1, $2, 1) ON CONFLICT (month) DO UPDATE SET usd = spend.usd + excluded.usd, count = spend.count + 1`, [m, usd]);
}

/**
 * Annonces complètes (description comprise) des runs encore gardés (4 jours), la plus récente par annonce.
 * Recherche par identifiant ou par texte (titre, description), insensible à la casse.
 */
export async function findListings(filter: { id?: string; text?: string }, limit = 10): Promise<(Listing & { fetchedAt: string; source: string })[]> {
  const text = filter.text ? `%${filter.text.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const rows = await q<{ l: Listing; fetched_at: string; source: string }>(
    `SELECT DISTINCT ON (l->>'id') l, r.fetched_at, r.run->>'source' AS source
     FROM runs r, jsonb_array_elements(r.run->'listings') l
     WHERE ($1::text IS NULL OR l->>'id' = $1) AND ($2::text IS NULL OR (l->>'title') ILIKE $2 OR (l->>'description') ILIKE $2)
     ORDER BY l->>'id', r.fetched_at DESC
     LIMIT $3`,
    [filter.id ?? null, text, limit],
  );
  return withDetails(rows.map((r) => ({ ...r.l, fetchedAt: new Date(r.fetched_at).toISOString(), source: r.l.source ?? r.source })));
}

/** Descriptions complètes lues sur la page de l'annonce (scraper de détails). */
export async function saveDetails(rows: { id: string; description: string }[]) {
  if (!rows.length) return;
  await q(
    `INSERT INTO details (listing_id, fetched_at, data)
     SELECT e->>'id', now(), e FROM jsonb_array_elements($1::jsonb) e
     ON CONFLICT (listing_id) DO UPDATE SET fetched_at = now(), data = excluded.data`,
    [JSON.stringify(rows)],
  );
}

export async function loadDetails(ids: string[]) {
  const map = new Map<string, { description: string }>();
  if (!ids.length) return map;
  const rows = await q<{ listing_id: string; data: { description: string } }>(`SELECT listing_id, data FROM details WHERE listing_id = ANY($1)`, [ids]);
  for (const r of rows) map.set(r.listing_id, r.data);
  return map;
}

/** Complète la description des annonces qui en ont une sur leur page (sans écraser celle déjà présente). */
export async function withDetails<T extends { id: string; description?: string }>(listings: T[]): Promise<T[]> {
  const ids = listings.filter((l) => !l.description).map((l) => l.id);
  const details = await loadDetails(ids).catch(() => new Map<string, { description: string }>());
  return listings.map((l) => (!l.description && details.has(l.id) ? { ...l, description: details.get(l.id)!.description } : l));
}
