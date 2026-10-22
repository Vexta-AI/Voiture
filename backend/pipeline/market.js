/**
 * COTE PAR COMPARABLES
 *
 * Aucune API publique de cote pro n'est disponible : la cote est la MÉDIANE des prix des annonces
 * comparables collectées (même type, même marque/modèle, année et kilométrage proches).
 * Règle d'or respectée : la moyenne du marché, jamais le prix le plus haut.
 *
 * Pas assez de comparables = pas de cote = pas de scoring (on n'invente jamais une marge).
 */

import { compact } from '../utils/text.js';

export const MARKET_RULES = {
  /** Comparables minimum pour publier une cote. */
  minComparables: 4,
  /** Fenêtres de recherche, de la plus stricte à la plus large. */
  windows: [
    { years: 1, mileageRatio: 0.35, mileageFloor: 20000, label: 'serré' },
    { years: 2, mileageRatio: 0.6, mileageFloor: 30000, label: 'élargi' },
  ],
  /** Au-delà de ce nombre de comparables, on retire 10 % en haut et en bas (annonces aberrantes). */
  trimFrom: 10,
  /** Arrondi de la cote. */
  step: 50,
};

/** Clé de regroupement : type + marque + modèle ("auto:renault:clio5"). */
export function modelKey(listing) {
  return `${listing.type}:${compact(listing.brand)}:${compact(listing.model)}`;
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * @param {import('../utils/scoring.js').Listing} listing
 * @param {import('../utils/scoring.js').Listing[]} pool annonces collectées (toutes sources)
 * @returns {null | { price: number, comparables: number, window: string, low: number, high: number }}
 */
export function estimateMarketPrice(listing, pool) {
  const key = modelKey(listing);
  const sameModel = pool.filter((p) => p.id !== listing.id && p.price > 0 && modelKey(p) === key);

  for (const w of MARKET_RULES.windows) {
    const tolerance = Math.max(w.mileageFloor, listing.mileage * w.mileageRatio);
    const comps = sameModel.filter(
      (p) => Math.abs(p.year - listing.year) <= w.years && (!listing.mileage || !p.mileage || Math.abs(p.mileage - listing.mileage) <= tolerance),
    );
    if (comps.length < MARKET_RULES.minComparables) continue;

    let prices = comps.map((p) => p.price).sort((a, b) => a - b);
    if (prices.length >= MARKET_RULES.trimFrom) {
      const cut = Math.floor(prices.length * 0.1);
      prices = prices.slice(cut, prices.length - cut);
    }
    const round = (n) => Math.round(n / MARKET_RULES.step) * MARKET_RULES.step;
    return {
      price: round(quantile(prices, 0.5)),
      comparables: comps.length,
      window: w.label,
      low: round(quantile(prices, 0.25)),
      high: round(quantile(prices, 0.75)),
    };
  }
  return null;
}

/** Dédoublonne un stock d'annonces par id en gardant la version la plus récente du tableau. */
export function dedupeById(listings) {
  const map = new Map();
  for (const l of listings) map.set(l.id, l);
  return [...map.values()];
}
