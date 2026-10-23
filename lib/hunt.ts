import 'server-only';

import { randomUUID } from 'node:crypto';

import { getDatasetItems, getRun, isCapacityError, startRun } from '@/backend/pipeline/apify.js';
import { priceHistory, repostIndex, withPriceDrop, withRepost } from '@/backend/pipeline/history.js';
import { ondemandCandidates, priceListings, selectAlerts } from '@/backend/pipeline/hunt.js';
import { filterArea } from '@/backend/pipeline/geo.js';
import { dedupeById } from '@/backend/pipeline/market.js';
import { normalizeApifyItem } from '@/backend/pipeline/normalize.js';
import { formatTelegramAlert, sendTelegram } from '@/backend/pipeline/telegram.js';
import { INSPECTION } from '@/backend/utils/inspection.js';
import { dailyDigest } from '@/backend/utils/crm.js';
import { matchBuyers } from '@/backend/utils/matching.js';
import { DEFAULT_AREA, HUNT_LIMITS, ONDEMAND_PREFIX, defaultSources, parseArea, parseTypes, type HuntSource } from '@/backend/config/sources.js';
import { modelKey } from '@/backend/pipeline/market.js';

import { loadBuyers } from './buyers-store';
import { inspectListing, inspectionEnabled } from './inspect';
import { dealFromListing } from './crm-deals';
import { createDealOnce, loadDeals } from './crm-store';
import {
  alertAlreadySent,
  claimSource,
  loadBatch,
  loadInspections,
  loadOndemand,
  loadRuns,
  markAlertSent,
  markOndemand,
  pruneRuns,
  recentOndemandKeys,
  releaseSource,
  saveBatch,
  saveRun,
  storeEnabled,
} from './store';
import type { Inspection, Listing } from './types';

/** Configuration lue dans les variables d'environnement Vercel. */
export function huntConfig() {
  const env = process.env;
  const host = env.APP_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return {
    apifyToken: env.APIFY_TOKEN ?? '',
    ingestSecret: env.INGEST_SECRET ?? '',
    telegramToken: env.TELEGRAM_BOT_TOKEN ?? '',
    telegramChatId: env.TELEGRAM_CHAT_ID ?? '',
    appUrl: host.replace(/\/$/, ''),
    /** "lat,lng,rayonKm" — défaut : 200 km autour de la Gironde. */
    area: parseArea(env.HUNT_AREA) ?? undefined,
    /** "auto" pour ne chasser que les voitures (ex. en hiver), défaut : auto + moto. */
    types: parseTypes(env.HUNT_TYPES) ?? undefined,
    maxItems: Number(env.HUNT_MAX_ITEMS) || HUNT_LIMITS.maxItems,
    marketMaxItems: Number(env.HUNT_MARKET_MAX_ITEMS) || HUNT_LIMITS.marketMaxItems,
    maxChargeUsd: Number(env.APIFY_MAX_CHARGE_USD) || HUNT_LIMITS.maxChargeUsd,
    /** Runs Apify simultanés (plan gratuit : 5 max, on garde une marge). */
    maxConcurrent: Number(env.APIFY_MAX_CONCURRENT) || HUNT_LIMITS.maxConcurrent,
    customSources: env.HUNT_SOURCES,
    /** Fourni par Vercel quand "Protection Bypass for Automation" est activé sur le projet. */
    bypassSecret: env.VERCEL_AUTOMATION_BYPASS_SECRET || undefined,
  };
}

type Config = ReturnType<typeof huntConfig>;

/** Sources actives : HUNT_SOURCES (JSON) remplace les recherches fresh/stale par défaut. */
export function resolveSources(config: Config, includeWeekly: boolean): HuntSource[] {
  const defaults = defaultSources({ area: config.area, maxItems: config.maxItems, marketMaxItems: config.marketMaxItems, includeWeekly, types: config.types });
  if (!config.customSources) return defaults;
  let custom: unknown;
  try {
    custom = JSON.parse(config.customSources);
  } catch {
    throw new Error('HUNT_SOURCES n’est pas un JSON valide');
  }
  if (!Array.isArray(custom)) throw new Error('HUNT_SOURCES doit être un tableau');
  const parsed = custom.map((s, i): HuntSource => {
    if (!s || typeof s !== 'object') throw new Error(`HUNT_SOURCES[${i}] invalide`);
    const { key, kind, type, input } = s as Record<string, unknown>;
    if (typeof key !== 'string' || !['fresh', 'stale'].includes(String(kind)) || !['auto', 'moto'].includes(String(type)) || !input || typeof input !== 'object') {
      throw new Error(`HUNT_SOURCES[${i}] : key, kind (fresh|stale), type (auto|moto) et input sont requis`);
    }
    return { key, kind: kind as 'fresh' | 'stale', type: type as 'auto' | 'moto', input: { maxItems: config.maxItems, ...(input as object) } };
  });
  return [...parsed, ...defaults.filter((d) => d.kind === 'market')];
}

export function missingConfig(config: Config, needs: ('apify' | 'store' | 'ingest' | 'url')[]) {
  const missing: string[] = [];
  if (needs.includes('apify') && !config.apifyToken) missing.push('APIFY_TOKEN');
  if (needs.includes('ingest') && !config.ingestSecret) missing.push('INGEST_SECRET');
  if (needs.includes('url') && !config.appUrl) missing.push('APP_URL');
  if (needs.includes('store') && !storeEnabled()) missing.push('BLOB_READ_WRITE_TOKEN');
  return missing;
}

/** Lance une source d'un lot ; null si Apify refuse faute de capacité (la source reste à lancer). */
async function launchSource(config: Config, source: HuntSource, batchId: string) {
  if (!(await claimSource(batchId, source.key))) return { source: source.key, skipped: 'already_claimed' as const };
  try {
    const run = await startRun({
      token: config.apifyToken,
      source,
      webhookUrl: `${config.appUrl}/api/hunt/ingest`,
      webhookSecret: config.ingestSecret,
      maxChargeUsd: config.maxChargeUsd,
      bypassSecret: config.bypassSecret,
      batchId,
    });
    return { source: source.key, ...run };
  } catch (error) {
    if (isCapacityError(error)) {
      await releaseSource(batchId, source.key);
      return null;
    }
    // Erreur définitive (input refusé…) : la réservation est gardée pour ne pas la retenter en boucle.
    return { source: source.key, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Lance les sources d'un lot dans l'ordre jusqu'à `slots` lancements réussis.
 * S'arrête au premier refus de capacité : les runs en cours relanceront la suite en se terminant.
 */
async function launchFromBatch(config: Config, batchId: string, keys: string[], slots: number) {
  const byKey = new Map(resolveSources(config, true).map((s) => [s.key, s]));
  const launched: NonNullable<Awaited<ReturnType<typeof launchSource>>>[] = [];
  let started = 0;
  for (const key of keys) {
    if (started >= slots) break;
    const source = byKey.get(key);
    if (!source) continue;
    const result = await launchSource(config, source, batchId);
    if (result === null) break;
    if ('skipped' in result) continue;
    launched.push(result);
    if ('runId' in result) started += 1;
  }
  return launched;
}

/** Lance la chasse du jour : un lot ordonné (fresh, puis stale et comparables le jour hebdo), dans la limite de concurrence. */
export async function startHunt(options: { now?: Date; includeWeekly?: boolean } = {}) {
  const config = huntConfig();
  const now = options.now ?? new Date();
  const includeWeekly = options.includeWeekly ?? now.getUTCDay() === HUNT_LIMITS.marketWeekday;
  const sources = resolveSources(config, includeWeekly);
  const batchId = `${now.toISOString().slice(0, 10)}-${includeWeekly ? 'w' : 'd'}-${randomUUID().slice(0, 8)}`;
  const keys = sources.map((s) => s.key);

  await saveBatch(batchId, keys);
  const runs = await launchFromBatch(config, batchId, keys, config.maxConcurrent);
  const pruned = await pruneRuns(HUNT_LIMITS.retentionDays).catch(() => 0);
  const startedCount = runs.filter((r) => 'runId' in r).length;
  return { batchId, includeWeekly, total: keys.length, started: startedCount, queued: keys.length - runs.length, pruned, runs };
}

/** Appelé à la fin de chaque run : libère un créneau, donc lance la recherche suivante du lot. */
export async function continueBatch(batchId: string) {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(batchId)) return [];
  const batch = await loadBatch(batchId);
  if (!batch) return [];
  return launchFromBatch(huntConfig(), batchId, batch.keys, 1);
}

/** Envoie les alertes (Telegram) et crée les deals CRM d'annonces cotées. */
async function alertOn(config: Config, priced: ReturnType<typeof priceListings>['priced'], summary: { alerts: number; skippedDuplicates: number; alertErrors: number; crmCreated: number; inspected?: number }) {
  // Réseau d'acheteurs : chaque alerte dit qui attend déjà cette voiture.
  const buyers = await loadBuyers().catch(() => []);
  const alerts = selectAlerts(priced);
  // Inspection IA des photos : pépites achat-revente seulement, quelques-unes par run, en parallèle.
  const inspections = new Map<string, Inspection>();
  if (inspectionEnabled()) {
    const max = Number(process.env.INSPECT_PER_RUN ?? INSPECTION.maxPerRun);
    const targets = alerts.filter((a) => a.payload.ok && a.payload.strategy === 'negotiation' && a.listing.photos?.length).slice(0, Math.max(0, max));
    const results = await Promise.all(targets.map((a) => inspectListing(a.listing as Listing).catch(() => null)));
    results.forEach((r, i) => {
      if (r?.ok) inspections.set(targets[i].listing.id, r.inspection);
      else if (r) console.warn('[hunt] inspection', targets[i].listing.id, r.error);
    });
    Object.assign(summary, { inspected: inspections.size });
  }
  for (const alert of alerts) {
    if (!alert.payload.ok) continue;
    const inspection = inspections.get(alert.listing.id);
    if (inspection) Object.assign(alert.listing, { inspection });
    // CRM : chaque pépite / cible mandat entre dans le pipeline avec son premier message prêt.
    try {
      const kind = alert.payload.strategy === 'mandate' ? 'mandat' : 'achat';
      if (await createDealOnce(dealFromListing(kind, alert.listing as Listing, 'radar'))) summary.crmCreated += 1;
    } catch (error) {
      console.error('[hunt] crm', error);
    }
    if (!config.telegramToken || !config.telegramChatId) continue;
    if (await alertAlreadySent(alert.key)) {
      summary.skippedDuplicates += 1;
      continue;
    }
    try {
      await sendTelegram({
        token: config.telegramToken,
        chatId: config.telegramChatId,
        text: formatTelegramAlert(alert.payload, {
          comparables: alert.market.comparables,
          buyers: matchBuyers(alert.listing, buyers).map((m) => ({ name: m.buyer.name, budgetMax: m.buyer.criteria.budgetMax })),
          inspection,
        }),
      });
      await markAlertSent(alert.key, { listingId: alert.listing.id, strategy: alert.payload.strategy, score: alert.analysis.score });
      summary.alerts += 1;
    } catch (error) {
      console.error('[hunt] telegram', error);
      summary.alertErrors += 1;
    }
  }
}

/**
 * Annonces sans cote : lance une recherche de comparables pour leur modèle (France entière),
 * hors webhook de lot. Plafonnée par run et relancée au plus tous les 14 jours par modèle.
 */
async function launchOndemand(config: Config, missing: Listing[]) {
  const max = Number(process.env.HUNT_ONDEMAND_PER_RUN ?? HUNT_LIMITS.ondemandPerRun);
  if (!(max > 0) || missing.length === 0) return [];
  const sources = ondemandCandidates(missing, { max, skip: await recentOndemandKeys(HUNT_LIMITS.ondemandCooldownDays) });
  const launched: string[] = [];
  for (const source of sources) {
    try {
      await startRun({
        token: config.apifyToken,
        source,
        webhookUrl: `${config.appUrl}/api/hunt/ingest`,
        webhookSecret: config.ingestSecret,
        maxChargeUsd: config.maxChargeUsd,
        bypassSecret: config.bypassSecret,
      });
      await markOndemand(source);
      launched.push(source.key);
    } catch (error) {
      // Plus de créneau Apify : les modèles restants seront recherchés au prochain run.
      if (isCapacityError(error)) break;
      console.error('[hunt] ondemand', source.key, error);
    }
  }
  return launched;
}

/** Source d'un run : lot du jour, ou recherche de comparables à la demande. */
async function sourceByKey(config: Config, key: string): Promise<HuntSource | undefined> {
  if (key.startsWith(ONDEMAND_PREFIX)) return (await loadOndemand<HuntSource>(key)) ?? undefined;
  return resolveSources(config, true).find((s) => s.key === key);
}

/** Traite un run Apify terminé : stockage, cote, scoring, alertes Telegram, comparables manquants. */
export async function ingestRun(runId: string, sourceKey: string) {
  const config = huntConfig();
  const source = await sourceByKey(config, sourceKey);
  if (!source) return { ok: false as const, error: 'unknown_source' };

  const run = await getRun({ token: config.apifyToken, runId });
  if (run.status !== 'SUCCEEDED') return { ok: false as const, error: 'run_not_succeeded', status: run.status };

  const items: Record<string, unknown>[] = await getDatasetItems({ token: config.apifyToken, datasetId: run.datasetId });
  const listings: Listing[] = [];
  let rejected = 0;
  for (const item of items) {
    const result = normalizeApifyItem(item, { type: source.type, source: source.key });
    if (result.ok) listings.push(result.listing as Listing);
    else rejected += 1;
  }

  const fetchedAt = new Date().toISOString();
  await saveRun({ runId, source: source.key, kind: source.kind, type: source.type, fetchedAt, listings, rejected });

  const summary = {
    ok: true as const,
    source: source.key,
    kind: source.kind,
    items: items.length,
    listings: listings.length,
    rejected,
    priced: 0,
    unpriced: 0,
    alerts: 0,
    skippedDuplicates: 0,
    alertErrors: 0,
    crmCreated: 0,
    ondemand: [] as string[],
  };
  const area = config.area ?? DEFAULT_AREA;
  const pool = () => loadRuns(HUNT_LIMITS.retentionDays).then((runs) => ({ runs, pool: dedupeById(runs.flatMap((r) => r.listings)) }));

  if (source.kind === 'market') {
    if (!source.key.startsWith(ONDEMAND_PREFIX) || listings.length === 0) return summary;
    // Comparables arrivés : on recote les annonces fraîches de ces modèles restées sans cote, et on alerte.
    const keys = new Set(listings.map((l) => modelKey(l)));
    const { runs, pool: stock } = await pool();
    const since = Date.now() - 3 * 86_400_000;
    const waiting = dedupeById(runs.filter((r) => r.kind === 'fresh' && new Date(r.fetchedAt).getTime() >= since).flatMap((r) => r.listings)).filter((l) => keys.has(modelKey(l)));
    const { priced, unpriced } = priceListings(filterArea(waiting, area, { national: true }).kept, stock, { base: area });
    summary.priced = priced.length;
    summary.unpriced = unpriced;
    await alertOn(config, priced, summary);
    return summary;
  }

  // Le scraper n'applique pas toujours le rayon : seules les annonces vérifiées dans la zone sont chassées
  // (toutes restent dans le stock de comparables).
  // Mandat (stale) : zone prioritaire uniquement ; achat-revente : France entière, zone prioritaire d'abord.
  const { kept, stats } = filterArea(listings, area, { national: source.kind !== 'stale' });
  Object.assign(summary, { area: stats });
  const { runs: stored, pool: stock } = await pool();
  // Baisse de prix depuis un relevé précédent : vendeur motivé, nouvelle alerte (la clé d'alerte inclut le prix).
  const history = priceHistory(stored, { excludeRunId: runId });
  // Annonce supprimée puis republiée : le vrai temps en ligne part de la première annonce.
  const reposts = repostIndex(stored, { excludeRunId: runId });
  const tracked = kept.map((l) => withRepost(withPriceDrop(l, history), reposts));
  Object.assign(summary, { priceDrops: tracked.filter((l) => 'priceDrop' in l).length, reposts: tracked.filter((l) => 'repost' in l).length });
  const { priced, unpriced, missing } = priceListings(tracked, stock, { base: area });
  summary.priced = priced.length;
  summary.unpriced = unpriced;
  await alertOn(config, priced, summary);
  summary.ondemand = await launchOndemand(config, missing as Listing[]).catch((error) => {
    console.error('[hunt] ondemand', error);
    return [];
  });
  return summary;
}

let liveCache: { at: number; value: Awaited<ReturnType<typeof computeLive>> } | null = null;

async function computeLive() {
  const runs = await loadRuns(HUNT_LIMITS.retentionDays);
  const pool = dedupeById(runs.flatMap((r) => r.listings));
  const recentSince = Date.now() - 3 * 86_400_000;
  const recentAll = dedupeById(runs.filter((r) => r.kind !== 'market' && new Date(r.fetchedAt).getTime() >= recentSince).flatMap((r) => r.listings));
  // Prix actuel = dernier relevé ; baisse = écart avec le plus haut prix déjà vu.
  const history = priceHistory(runs);
  const reposts = repostIndex(runs);
  const recent = filterArea(recentAll, huntConfig().area ?? DEFAULT_AREA).kept.map((l) => withRepost(withPriceDrop(l, history), reposts));
  const { priced, unpriced, missing } = priceListings(recent, pool, { base: huntConfig().area ?? DEFAULT_AREA });
  const lastRun = runs.filter((r) => r.kind !== 'market').at(-1)?.fetchedAt ?? null;
  // Annonces réelles encore sans cote : affichées à part (cote à saisir), zone prioritaire d'abord.
  const pending = (missing as Listing[])
    .sort((a, b) => (a.zone === 'france' ? 1 : 0) - (b.zone === 'france' ? 1 : 0) || (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, 120);
  // Inspections IA déjà faites : affichées sur les cartes.
  const listingsOut = priced.map((p) => p.listing as Listing);
  const inspections = await loadInspections<Inspection>(listingsOut.map((l) => l.id)).catch(() => new Map<string, Inspection>());
  const withInspection = listingsOut.map((l) => (inspections.has(l.id) ? { ...l, inspection: inspections.get(l.id) } : l));
  return { listings: withInspection, pending, unpriced, poolSize: pool.length, lastRun };
}

/** Annonces réelles pour le dashboard (cache 5 min par instance). */
export async function loadLiveRadar() {
  if (!storeEnabled()) return null;
  if (liveCache && Date.now() - liveCache.at < 5 * 60_000) return liveCache.value;
  try {
    const value = await computeLive();
    liveCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.error('[hunt] live radar', error);
    return null;
  }
}

/** Résumé CRM du matin sur Telegram (leads chauds, réponses, relances, visites) ; rien si rien à faire. */
export async function sendCrmDigest() {
  const config = huntConfig();
  if (!config.telegramToken || !config.telegramChatId || !storeEnabled()) return { sent: false };
  const text = dailyDigest(await loadDeals(), { appUrl: config.appUrl || undefined });
  if (!text) return { sent: false };
  await sendTelegram({ token: config.telegramToken, chatId: config.telegramChatId, text });
  return { sent: true };
}
