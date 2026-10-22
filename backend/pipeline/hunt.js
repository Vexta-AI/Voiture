/**
 * Cœur du pipeline de chasse (pur, sans réseau) :
 *   annonces normalisées -> cote par comparables -> scoring -> outreach -> alertes à envoyer.
 */

import { buildOutreachPayload } from '../utils/outreach.js';
import { scoreListing } from '../utils/scoring.js';
import { MARKET_RULES, estimateMarketPrice } from './market.js';

/** Alertes max par run : au-delà, c'est que la cote est faussée, pas que le marché déborde de pépites. */
export const MAX_ALERTS_PER_RUN = 10;

/**
 * Fixe la cote de chaque annonce à partir du stock de comparables.
 * @param {import('../utils/scoring.js').Listing[]} listings
 * @param {import('../utils/scoring.js').Listing[]} pool
 */
export function priceListings(listings, pool) {
  const priced = [];
  let unpriced = 0;
  for (const listing of listings) {
    const market = estimateMarketPrice(listing, pool);
    if (!market) {
      unpriced += 1;
      continue;
    }
    priced.push({ listing: { ...listing, marketPrice: market.price }, market });
  }
  return { priced, unpriced };
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
    .filter((c) => c.payload.ok && c.listing.price >= c.listing.marketPrice * MARKET_RULES.suspiciousRatio)
    .sort((a, b) => b.analysis.score - a.analysis.score)
    .slice(0, options.maxAlerts ?? MAX_ALERTS_PER_RUN)
    .map((c) => ({ ...c, key: alertKey(c.listing.id, c.payload.ok ? c.payload.strategy : 'none', c.listing.price) }));
}
