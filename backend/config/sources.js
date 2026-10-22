/**
 * SOURCES DE LA CHASSE AUTOMATIQUE (Apify -> LeBonCoin)
 *
 * Trois familles de recherches :
 *   - fresh  : dernières annonces de la zone (alerte PÉPITE au plus tôt)
 *   - stale  : annonces les plus anciennes de la zone (cible Mandat J+15)
 *   - market : recherches larges par modèle, sans alerte, pour calculer la cote (médiane des comparables)
 *
 * Les recherches fresh/stale passent par une URL LeBonCoin (le scraper l'accepte telle quelle).
 * Pour cibler précisément ta zone : fais la recherche sur leboncoin.fr, copie l'URL, et colle-la
 * dans la variable HUNT_SOURCES (JSON, voir README). Rien à recoder.
 */

import { AUTO_TARGETS, BUDGETS, MOTO_TARGETS } from './rules.js';

export const APIFY_ACTOR_ID = 'bovi~leboncoin-listings';

/** Catégories LeBonCoin : 2 = voitures, 3 = motos. */
export const LBC_CATEGORY = { auto: '2', moto: '3' };

/** Zone par défaut (format "Ville_CodePostal" de LeBonCoin). */
export const DEFAULT_LOCATION = 'Bordeaux_33000';

/** Garde-fous de coût, réglables par variables d'environnement. */
export const HUNT_LIMITS = {
  /** Annonces max par recherche fresh/stale. */
  maxItems: 100,
  /** Annonces max par recherche de comparables. */
  marketMaxItems: 60,
  /** Plafond de dépense Apify par run (USD), transmis à Apify. */
  maxChargeUsd: 1,
  /** Jour de la semaine (0 = dimanche) où les comparables sont rafraîchis. */
  marketWeekday: 1,
  /** Durée de conservation des runs en stock (jours). */
  retentionDays: 90,
};

/** Mots-clés des recherches de comparables, un par modèle ciblé. */
const MARKET_QUERIES = {
  auto: {
    clio: ['clio 4', 'clio 5'],
    polo: ['polo'],
    golf: ['golf 7', 'golf 8'],
    208: ['peugeot 208'],
    tesla: ['tesla model 3', 'tesla model y'],
    twingo: ['twingo 3'],
    classea: ['mercedes classe a'],
    a3: ['audi a3'],
  },
  moto: {
    mt07: ['mt-07'],
    z650: ['z650'],
    z800: ['z800'],
    z900: ['z900'],
    gs: ['r 1250 gs', 'r 1200 gs'],
  },
};

function lbcSearchUrl({ type, location, order }) {
  const { min, max } = BUDGETS[type];
  const params = new URLSearchParams({
    category: LBC_CATEGORY[type],
    locations: location,
    price: `${min}-${max}`,
    sort: 'time',
    order,
  });
  return `https://www.leboncoin.fr/recherche?${params.toString()}`;
}

/**
 * @typedef {Object} HuntSource
 * @property {string} key       identifiant stable (transmis dans le webhook)
 * @property {'fresh'|'stale'|'market'} kind
 * @property {'auto'|'moto'} type
 * @property {Record<string, unknown>} input  input du scraper (hors proxy)
 */

/**
 * @param {{ location?: string, maxItems?: number, marketMaxItems?: number, includeMarket?: boolean }} [options]
 * @returns {HuntSource[]}
 */
export function defaultSources(options = {}) {
  const location = options.location ?? DEFAULT_LOCATION;
  const maxItems = options.maxItems ?? HUNT_LIMITS.maxItems;
  const marketMaxItems = options.marketMaxItems ?? HUNT_LIMITS.marketMaxItems;

  /** @type {HuntSource[]} */
  const sources = [];
  for (const type of /** @type {const} */ (['auto', 'moto'])) {
    sources.push({ key: `fresh-${type}`, kind: 'fresh', type, input: { searchUrl: lbcSearchUrl({ type, location, order: 'desc' }), maxItems } });
    sources.push({ key: `stale-${type}`, kind: 'stale', type, input: { searchUrl: lbcSearchUrl({ type, location, order: 'asc' }), maxItems } });
  }
  if (options.includeMarket) {
    for (const type of /** @type {const} */ (['auto', 'moto'])) {
      const targets = type === 'auto' ? AUTO_TARGETS : MOTO_TARGETS;
      const { min, max } = BUDGETS[type];
      for (const target of targets) {
        for (const searchText of MARKET_QUERIES[type][target.id] ?? []) {
          sources.push({
            key: `market-${type}-${searchText.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
            kind: 'market',
            type,
            input: { searchText, category: LBC_CATEGORY[type], priceMin: Math.round(min * 0.6), priceMax: Math.round(max * 1.3), maxItems: marketMaxItems },
          });
        }
      }
    }
  }
  return sources;
}

/** Input complet envoyé au scraper (proxy résidentiel FR obligatoire pour LeBonCoin). */
export function actorInput(source) {
  return {
    ownerType: 'all',
    ...source.input,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'FR' },
  };
}
