/**
 * Cœur du pipeline de chasse (pur, sans réseau) :
 *   annonces normalisées -> cote par comparables -> scoring -> outreach -> alertes à envoyer.
 */

import { BUDGETS } from '../config/rules.js';
import { ondemandSource } from '../config/sources.js';
import { cleanModel } from './normalize.js';
import { buildOutreachPayload } from '../utils/outreach.js';
import { scoreListing } from '../utils/scoring.js';
import { MARKET_RULES, estimateLocalPrice, estimateMarketPrice } from './market.js';

/** Alertes max par run : au-delà, c'est que la cote est faussée, pas que le marché déborde de pépites. */
export const MAX_ALERTS_PER_RUN = 10;

/**
 * Fixe la cote de chaque annonce à partir du stock de comparables.
 * @param {import('../utils/scoring.js').Listing[]} listings
 * @param {import('../utils/scoring.js').Listing[]} pool
 */
export function priceListings(listings, pool, options = {}) {
  const priced = [];
  const missing = [];
  for (const listing of listings) {
    const market = estimateMarketPrice(listing, pool);
    if (!market) {
      missing.push(listing);
      continue;
    }
    const local = options.base ? estimateLocalPrice(listing, pool, options.base) : null;
    priced.push({
      listing: {
        ...listing,
        marketPrice: market.price,
        marketStats: {
          low: market.low,
          high: market.high,
          comparables: market.comparables,
          daysOnMarket: market.daysOnMarket,
          criteria: market.criteria,
          confidence: market.confidence,
          samples: market.samples,
        },
        ...(local ? { localMarket: { price: local.price, low: local.low, high: local.high, comparables: local.comparables, daysOnMarket: local.daysOnMarket, radiusKm: local.radiusKm, criteria: local.criteria } } : {}),
      },
      market,
    });
  }
  return { priced, unpriced: missing.length, missing };
}

/**
 * Modèles à faire coter en priorité parmi les annonces sans cote : dans le budget, zone prioritaire
 * et plus proches d'abord, une recherche par modèle, les modèles déjà recherchés récemment exclus.
 * @param {import('../utils/scoring.js').Listing[]} missing
 * @param {{ max: number, skip?: Set<string> }} options skip : clés de sources déjà lancées
 */
export function ondemandCandidates(missing, { max, skip = new Set() }) {
  const inBudget = (l) => l.price >= BUDGETS[l.type].min && l.price <= BUDGETS[l.type].max;
  // Modèle "Autres" (non listé par LeBonCoin) : aucune recherche de comparables possible.
  const known = (l) => cleanModel(l.model, l.brand) !== null;
  const sorted = missing.filter((l) => inBudget(l) && known(l)).sort((a, b) => (a.zone === 'france' ? 1 : 0) - (b.zone === 'france' ? 1 : 0) || (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  const picked = new Map();
  for (const listing of sorted) {
    const source = ondemandSource(listing);
    if (picked.size >= max) break;
    if (skip.has(source.key) || picked.has(source.key)) continue;
    picked.set(source.key, source);
  }
  return [...picked.values()];
}

/** Clé anti-doublon : une nouvelle alerte part si la stratégie ou le prix change (baisse de prix). */
export function alertKey(listingId, strategy, price) {
  return `${listingId}-${strategy}-${price}`.replace(/[^a-zA-Z0-9-]/g, '_');
}

/**
 * Sélectionne les alertes à envoyer pour un run.
 * @param {ReturnType<typeof priceListings>['priced']} priced
 * @param {{ now?: Date, maxAlerts?: number }} [options]
 */
export function selectAlerts(priced, options = {}) {
  const now = options.now ?? new Date();
  return priced
    .map(({ listing, market }) => {
      const analysis = scoreListing(listing, { now });
      const payload = buildOutreachPayload(listing, analysis, { now });
      return { listing, market, analysis, payload };
    })
    // Un prix sous 50 % de la cote est un signal d'arnaque ou de cote faussée, pas une pépite.
    // Cote peu fiable (peu de comparables, prix très dispersés) : jamais d'alerte.
    .filter((c) => c.payload.ok && c.listing.price >= c.listing.marketPrice * MARKET_RULES.suspiciousRatio && c.market.confidence?.level !== 'faible')
    // Zone prioritaire d'abord, puis le meilleur score.
    .sort((a, b) => (a.analysis.zone === 'france' ? 1 : 0) - (b.analysis.zone === 'france' ? 1 : 0) || b.analysis.score - a.analysis.score)
    .slice(0, options.maxAlerts ?? MAX_ALERTS_PER_RUN)
    .map((c) => ({ ...c, key: alertKey(c.listing.id, c.payload.ok ? c.payload.strategy : 'none', c.listing.price) }));
}
