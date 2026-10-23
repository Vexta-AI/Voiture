/**
 * Historique des prix d'une annonce : le radar repasse chaque jour sur LeBonCoin et garde chaque
 * relevé. Une annonce dont le prix a baissé signale un vendeur qui veut vendre : c'est le moment d'appeler.
 */

/** Écart minimal pour parler de baisse (évite les arrondis de vendeur). */
export const MIN_DROP = 100;

/**
 * Prix déjà relevés par annonce (runs plus anciens que celui en cours).
 * @param {{ runId?: string, fetchedAt: string, listings: { id: string, price: number }[] }[]} runs
 * @param {{ excludeRunId?: string }} [options]
 * @returns {Map<string, { firstSeenAt: string, firstPrice: number, maxPrice: number }>}
 */
export function priceHistory(runs, options = {}) {
  const map = new Map();
  const sorted = [...runs].filter((r) => r.runId !== options.excludeRunId).sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
  for (const run of sorted) {
    for (const l of run.listings) {
      if (!(l.price > 0)) continue;
      const h = map.get(l.id);
      if (!h) map.set(l.id, { firstSeenAt: run.fetchedAt, firstPrice: l.price, maxPrice: l.price });
      else h.maxPrice = Math.max(h.maxPrice, l.price);
    }
  }
  return map;
}

/**
 * Ajoute la baisse de prix à l'annonce si son prix actuel est sous le plus haut prix déjà vu.
 * @template {{ id: string, price: number }} T
 * @param {T} listing
 * @param {ReturnType<typeof priceHistory>} history
 * @returns {T & { priceDrop?: { from: number, to: number, amount: number, since: string } }}
 */
export function withPriceDrop(listing, history) {
  const h = history.get(listing.id);
  if (!h || h.maxPrice - listing.price < MIN_DROP) return listing;
  return { ...listing, priceDrop: { from: h.maxPrice, to: listing.price, amount: h.maxPrice - listing.price, since: h.firstSeenAt } };
}
