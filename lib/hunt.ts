import 'server-only';

import { getDatasetItems, getRun, startRun } from '@/backend/pipeline/apify.js';
import { priceListings, selectAlerts } from '@/backend/pipeline/hunt.js';
import { dedupeById } from '@/backend/pipeline/market.js';
import { normalizeApifyItem } from '@/backend/pipeline/normalize.js';
import { formatTelegramAlert, sendTelegram } from '@/backend/pipeline/telegram.js';
import { HUNT_LIMITS, defaultSources, type HuntSource } from '@/backend/config/sources.js';

import { alertAlreadySent, loadRuns, markAlertSent, pruneRuns, saveRun, storeEnabled } from './store';
import type { Listing } from './types';

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
    location: env.HUNT_LOCATION || undefined,
    maxItems: Number(env.HUNT_MAX_ITEMS) || HUNT_LIMITS.maxItems,
    maxChargeUsd: Number(env.APIFY_MAX_CHARGE_USD) || HUNT_LIMITS.maxChargeUsd,
    customSources: env.HUNT_SOURCES,
  };
}

type Config = ReturnType<typeof huntConfig>;

/** Sources actives : HUNT_SOURCES (JSON) remplace les recherches fresh/stale par défaut. */
export function resolveSources(config: Config, includeMarket: boolean): HuntSource[] {
  const defaults = defaultSources({ location: config.location, maxItems: config.maxItems, includeMarket });
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

/** Lance les runs Apify du jour (comparables inclus le jour configuré). */
export async function startHunt(options: { now?: Date; includeMarket?: boolean } = {}) {
  const config = huntConfig();
  const now = options.now ?? new Date();
  const includeMarket = options.includeMarket ?? now.getUTCDay() === HUNT_LIMITS.marketWeekday;
  const sources = resolveSources(config, includeMarket);

  const results = await Promise.allSettled(
    sources.map((source) =>
      startRun({
        token: config.apifyToken,
        source,
        webhookUrl: `${config.appUrl}/api/hunt/ingest`,
        webhookSecret: config.ingestSecret,
        maxChargeUsd: config.maxChargeUsd,
      }),
    ),
  );
  const pruned = await pruneRuns(HUNT_LIMITS.retentionDays).catch(() => 0);

  return {
    includeMarket,
    pruned,
    runs: results.map((r, i) =>
      r.status === 'fulfilled' ? { source: sources[i].key, ...r.value } : { source: sources[i].key, error: String(r.reason?.message ?? r.reason) },
    ),
  };
}

/** Traite un run Apify terminé : stockage, cote, scoring, alertes Telegram. */
export async function ingestRun(runId: string, sourceKey: string) {
  const config = huntConfig();
  const source = resolveSources(config, true).find((s) => s.key === sourceKey);
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

  const summary = { ok: true as const, source: source.key, kind: source.kind, items: items.length, listings: listings.length, rejected, priced: 0, unpriced: 0, alerts: 0, skippedDuplicates: 0, alertErrors: 0 };
  if (source.kind === 'market') return summary;

  const pool = dedupeById((await loadRuns(HUNT_LIMITS.retentionDays)).flatMap((r) => r.listings));
  const { priced, unpriced } = priceListings(listings, pool);
  summary.priced = priced.length;
  summary.unpriced = unpriced;

  if (!config.telegramToken || !config.telegramChatId) return summary;

  for (const alert of selectAlerts(priced)) {
    if (!alert.payload.ok) continue;
    if (await alertAlreadySent(alert.key)) {
      summary.skippedDuplicates += 1;
      continue;
    }
    try {
      await sendTelegram({
        token: config.telegramToken,
        chatId: config.telegramChatId,
        text: formatTelegramAlert(alert.payload, { comparables: alert.market.comparables }),
      });
      await markAlertSent(alert.key, { listingId: alert.listing.id, strategy: alert.payload.strategy, score: alert.analysis.score });
      summary.alerts += 1;
    } catch (error) {
      console.error('[hunt] telegram', error);
      summary.alertErrors += 1;
    }
  }
  return summary;
}

let liveCache: { at: number; value: Awaited<ReturnType<typeof computeLive>> } | null = null;

async function computeLive() {
  const runs = await loadRuns(HUNT_LIMITS.retentionDays);
  const pool = dedupeById(runs.flatMap((r) => r.listings));
  const recentSince = Date.now() - 3 * 86_400_000;
  const recent = dedupeById(runs.filter((r) => r.kind !== 'market' && new Date(r.fetchedAt).getTime() >= recentSince).flatMap((r) => r.listings));
  const { priced, unpriced } = priceListings(recent, pool);
  const lastRun = runs.filter((r) => r.kind !== 'market').at(-1)?.fetchedAt ?? null;
  return { listings: priced.map((p) => p.listing as Listing), unpriced, poolSize: pool.length, lastRun };
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
