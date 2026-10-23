/**
 * SOURCES DE LA CHASSE AUTOMATIQUE (Apify -> LeBonCoin)
 *
 * Trois familles de recherches :
 *   - fresh  : dernières annonces, chaque jour : zone prioritaire puis France entière (alerte PÉPITE)
 *   - stale  : annonces les plus anciennes de la zone, chaque semaine (cible Mandat J+15)
 *   - market : recherches larges par modèle, chaque semaine, sans alerte, pour la cote (médiane des comparables)
 *
 * Les recherches fresh/stale passent par une URL LeBonCoin (le scraper l'accepte telle quelle).
 * La zone prioritaire passe par le paramètre "locations" (centre GPS + rayon) : voir lbcLocation.
 */

import { cleanModel } from '../pipeline/normalize.js';
import { AUTO_TARGETS, BUDGETS, MOTO_TARGETS } from './rules.js';

export const APIFY_ACTOR_ID = 'bovi~leboncoin-listings';

/** Catégories LeBonCoin : 2 = voitures, 3 = motos. */
export const LBC_CATEGORY = { auto: '2', moto: '3' };

/** Zone par défaut : 200 km autour du point fourni (Gironde), comme l'URL LeBonCoin lat/lng/radius. */
/** Libellé de ville exigé par le format de zone LeBonCoin (la recherche se fait sur les coordonnées). */
const LBC_AREA_LABEL = 'Bordeaux_33000';

export const DEFAULT_AREA = { lat: 44.90100112020876, lng: -0.7400689834642227, radiusKm: 200 };

/** Garde-fous de coût, réglables par variables d'environnement. */
export const HUNT_LIMITS = {
  /** Annonces max par recherche fresh/stale. */
  maxItems: 50,
  /** Annonces max par recherche de comparables. */
  marketMaxItems: 30,
  /** Plafond de dépense Apify par run (USD), transmis à Apify. */
  maxChargeUsd: 1,
  /** Runs Apify simultanés : le plan gratuit en autorise 5, on en garde 1 de marge. */
  maxConcurrent: 4,
  /** Jour de la semaine (0 = dimanche) des recherches hebdomadaires (stale + comparables). */
  marketWeekday: 1,
  /** Durée de conservation des runs en stock (jours). */
  retentionDays: 90,
  /** Recherches de comparables à la demande par run frais (plan gratuit : rester sobre). */
  ondemandPerRun: 2,
  /** Un modèle déjà recherché à la demande n'est pas relancé avant ce délai. */
  ondemandCooldownDays: 14,
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
    c3: ['citroen c3'],
    sandero: ['dacia sandero'],
    2008: ['peugeot 2008'],
    captur: ['renault captur'],
    yaris: ['toyota yaris'],
    308: ['peugeot 308'],
    3008: ['peugeot 3008'],
    megane: ['renault megane'],
    duster: ['dacia duster'],
    corsa: ['opel corsa'],
  },
  moto: {
    mt07: ['mt-07'],
    z650: ['z650'],
    z800: ['z800'],
    z900: ['z900'],
    gs: ['r 1250 gs', 'r 1200 gs'],
    mt09: ['mt-09'],
    tenere: ['tenere 700'],
    tmax: ['tmax'],
    xadv: ['x-adv'],
    cb650: ['cb650r'],
    africatwin: ['africa twin'],
    triumph: ['triumph trident', 'street triple'],
    sv650: ['sv650'],
  },
};

/**
 * Zone au format de l'URL LeBonCoin : "<Ville>_<CP>__<lat>_<lng>_<rayon ville m>_<rayon m>".
 * Seul format respecté par le scraper (test du 22/10 : lat/lng/radius ou un nom de ville seul
 * sont ignorés ou ne renvoient rien ; celui-ci renvoie 100 % d'annonces dans la zone).
 */
function lbcLocation(area) {
  return `${LBC_AREA_LABEL}__${area.lat}_${area.lng}_9256_${Math.round(area.radiusKm * 1000)}`;
}

function lbcSearchUrl({ type, area, order }) {
  const { min, max } = BUDGETS[type];
  const params = new URLSearchParams({
    category: LBC_CATEGORY[type],
    ...(area ? { locations: lbcLocation(area) } : {}),
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

/** "auto" / "auto,moto" -> types chassés ; null si vide ou invalide. */
export function parseTypes(value) {
  const types = String(value ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t === 'auto' || t === 'moto');
  return types.length ? /** @type {('auto'|'moto')[]} */ ([...new Set(types)]) : null;
}

/** "44.90,-0.74,200" -> { lat, lng, radiusKm } ; null si invalide. */
export function parseArea(value) {
  const parts = String(value ?? '').split(',').map((p) => Number(p.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lng, radiusKm] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || radiusKm <= 0 || radiusKm > 1000) return null;
  return { lat, lng, radiusKm };
}

/**
 * @param {{ area?: { lat: number, lng: number, radiusKm: number }, maxItems?: number, marketMaxItems?: number, includeWeekly?: boolean, types?: ('auto'|'moto')[] }} [options]
 * @returns {HuntSource[]}
 */
export function defaultSources(options = {}) {
  const area = options.area ?? DEFAULT_AREA;
  const maxItems = options.maxItems ?? HUNT_LIMITS.maxItems;
  const marketMaxItems = options.marketMaxItems ?? HUNT_LIMITS.marketMaxItems;

  /** @type {HuntSource[]} */
  const sources = [];
  const types = options.types?.length ? options.types : /** @type {('auto'|'moto')[]} */ (['auto', 'moto']);
  for (const type of types) {
    // Zone prioritaire d'abord, puis toute la France (le rapatriement est déduit de la marge).
    sources.push({ key: `fresh-${type}`, kind: 'fresh', type, input: { searchUrl: lbcSearchUrl({ type, area, order: 'desc' }), maxItems } });
    sources.push({ key: `fresh-${type}-fr`, kind: 'fresh', type, input: { searchUrl: lbcSearchUrl({ type, area: null, order: 'desc' }), maxItems } });
    if (options.includeWeekly) {
      sources.push({ key: `stale-${type}`, kind: 'stale', type, input: { searchUrl: lbcSearchUrl({ type, area, order: 'asc' }), maxItems } });
    }
  }
  if (options.includeWeekly) {
    for (const type of types) {
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

/** Préfixe des recherches de comparables lancées à la demande (modèle vu sans cote). */
export const ONDEMAND_PREFIX = 'ondemand-';

/**
 * Recherche de comparables pour un modèle précis, France entière, ciblée sur l'âge et le kilométrage
 * de l'annonce (années ±2, kilométrage proche) : les 10 résultats du plan gratuit deviennent tous
 * des comparables utilisables. Lancée quand une annonce fraîche n'a pas de cote.
 * @param {{ type: 'auto'|'moto', brand: string, model: string, year: number, mileage?: number }} listing
 * @param {{ maxItems?: number }} [options]
 * @returns {HuntSource}
 */
export function ondemandSource(listing, options = {}) {
  const searchText = `${listing.brand} ${cleanModel(listing.model, listing.brand) ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const { min, max } = BUDGETS[listing.type];
  const params = new URLSearchParams({
    category: LBC_CATEGORY[listing.type],
    text: searchText,
    price: `${Math.round(min * 0.6)}-${Math.round(max * 1.3)}`,
    regdate: `${listing.year - 2}-${listing.year + 2}`,
  });
  if (listing.mileage) {
    const spread = Math.max(30000, listing.mileage * 0.6);
    params.set('mileage', `${Math.max(0, Math.round((listing.mileage - spread) / 1000) * 1000)}-${Math.round((listing.mileage + spread) / 1000) * 1000}`);
  }
  // Une recherche par modèle et par génération (tranche de 4 ans) : délai de relance commun.
  const slug = searchText.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return {
    key: `${ONDEMAND_PREFIX}${listing.type}-${slug}`.slice(0, 58) + `-${Math.floor(listing.year / 4) * 4}`,
    kind: 'market',
    type: listing.type,
    input: { searchUrl: `https://www.leboncoin.fr/recherche?${params.toString()}`, maxItems: options.maxItems ?? HUNT_LIMITS.marketMaxItems },
  };
}

/** Input complet envoyé au scraper (proxy résidentiel FR obligatoire pour LeBonCoin). */
export function actorInput(source) {
  return {
    ownerType: 'all',
    ...source.input,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'FR' },
  };
}
