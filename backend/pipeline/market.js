/**
 * COTE PAR COMPARABLES
 *
 * Aucune API publique de cote pro n'est disponible : la cote est la MÉDIANE des prix des annonces
 * comparables collectées (même type, même marque/modèle, année et kilométrage proches).
 * Règle d'or respectée : la moyenne du marché, jamais le prix le plus haut.
 *
 * Pas assez de comparables = pas de cote = pas de scoring (on n'invente jamais une marge).
 */

import { compact, normalize } from '../utils/text.js';

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
  /** Prix < 50 % de la cote : annonce suspecte (épave, arnaque, erreur de cote) -> jamais d'alerte. */
  suspiciousRatio: 0.5,
};

/**
 * Variantes qui changent fortement le prix d'un même modèle : une Golf GTI ne se compare pas
 * à une Golf, une Clio E-Tech hybride pas à une Clio essence, une MT-10 pas à une MT-07.
 */
const VARIANTS = [
  { id: 'sport', pattern: /\b(gti|gtd|gte|rs|cupra|amg|alpine a110|type r|st line x)\b|golf r\b|\bs3\b|\brs3\b|\bm135|\bm140/ },
  { id: 'elec', pattern: /\b(electrique|electric|ev|e-tech electrique|zoe|e-208|e-2008|e-c4|id\.3)\b/ },
  { id: 'hybrid', pattern: /\b(hybride?|e-tech|full hybrid|hev|phev|rechargeable)\b/ },
];

/** Variante d'une annonce lue dans son titre ("std" par défaut). */
export function variantOf(listing) {
  const text = normalize(`${listing.title ?? ''} ${listing.version ?? ''}`);
  return VARIANTS.find((v) => v.pattern.test(text))?.id ?? 'std';
}

/**
 * Clé de regroupement : type + marque + modèle + variante ("auto:volkswagen:golf7:sport").
 * Le modèle est complété par le motif de cible reconnu dans le titre (ex. "mt10" ≠ "mt07").
 */
export function modelKey(listing) {
  const model = compact(listing.model);
  const titleModel = listing.type === 'moto' ? compact(listing.title ?? '').match(/mt\d{2}|z\d{3}|r1[02]\d0gs|cb\d{3}/)?.[0] : undefined;
  return `${listing.type}:${compact(listing.brand)}:${titleModel && !model.includes(titleModel) ? `${model}-${titleModel}` : model}:${variantOf(listing)}`;
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
