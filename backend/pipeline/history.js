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

/**
 * Empreinte d'un véhicule, indépendante de l'annonce : même modèle, même année, même kilométrage
 * (à 2 000 km près), même code postal. Une nouvelle annonce avec la même empreinte qu'une ancienne
 * = annonce supprimée puis republiée pour paraître récente.
 * @param {{ type?: string, brand?: string, model?: string, year?: number, mileage?: number, zip?: string, location?: string }} l
 */
export function vehicleFingerprint(l) {
  if (!l.mileage || !l.year || !(l.zip || l.location)) return null;
  const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return [l.type, norm(l.brand), norm(l.model), l.year, Math.round(l.mileage / 2000), norm(l.zip ?? l.location)].join('|');
}

/**
 * Première apparition de chaque empreinte (annonce d'origine).
 * @param {{ runId?: string, fetchedAt: string, listings: any[] }[]} runs
 * @param {{ excludeRunId?: string }} [options]
 * @returns {Map<string, { id: string, firstSeenAt: string, price: number }>}
 */
export function repostIndex(runs, options = {}) {
  const map = new Map();
  const sorted = [...runs].filter((r) => r.runId !== options.excludeRunId).sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
  for (const run of sorted) {
    for (const l of run.listings) {
      const fp = vehicleFingerprint(l);
      if (fp && !map.has(fp)) map.set(fp, { id: l.id, firstSeenAt: l.publishedAt && l.publishedAt < run.fetchedAt ? l.publishedAt : run.fetchedAt, price: l.price });
    }
  }
  return map;
}

/**
 * Marque une annonce republiée : même véhicule déjà vu sous un autre identifiant, plus tôt.
 * @template {{ id: string, publishedAt: string }} T
 * @param {T} listing
 * @param {ReturnType<typeof repostIndex>} index
 * @returns {T & { repost?: { previousId: string, firstSeenAt: string, previousPrice: number } }}
 */
export function withRepost(listing, index) {
  const fp = vehicleFingerprint(listing);
  const first = fp ? index.get(fp) : undefined;
  if (!first || first.id === listing.id || first.firstSeenAt >= listing.publishedAt) return listing;
  return { ...listing, repost: { previousId: first.id, firstSeenAt: first.firstSeenAt, previousPrice: first.price } };
}
