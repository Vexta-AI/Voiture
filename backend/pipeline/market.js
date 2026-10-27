/**
 * COTE PAR COMPARABLES
 *
 * Aucune API publique de cote pro n'est disponible : la cote est la MÉDIANE des prix des annonces
 * comparables collectées (même type, même marque/modèle, année et kilométrage proches).
 * Règle d'or respectée : la moyenne du marché, jamais le prix le plus haut.
 *
 * Pas assez de comparables = pas de cote = pas de scoring (on n'invente jamais une marge).
 */

import { PRICE_SIGNALS } from '../config/rules.js';
import { adUrl } from '../utils/links.js';
import { trimOf } from '../utils/sellability.js';
import { compact, findPattern, normalize } from '../utils/text.js';
import { distanceKm } from './geo.js';

export const MARKET_RULES = {
  /** Comparables minimum pour publier une cote. */
  minComparables: 4,
  /** Fenêtres de recherche, de la plus stricte à la plus large. */
  windows: [
    { years: 1, mileageRatio: 0.35, mileageFloor: 20000, powerRate: 0.15, label: 'serré' },
    { years: 2, mileageRatio: 0.6, mileageFloor: 30000, powerRate: 0.25, label: 'élargi' },
  ],
  /** Au-delà de ce nombre de comparables, on retire 10 % en haut et en bas (annonces aberrantes). */
  trimFrom: 10,
  /** Arrondi de la cote. */
  step: 50,
  /** Prix < 50 % de la cote : annonce suspecte (épave, arnaque, erreur de cote) -> jamais d'alerte. */
  suspiciousRatio: 0.5,
  /** Revente chez toi : comparables autour de la base, 100 km puis 200 km. */
  localRadiiKm: [100, 200],
  /** Comparables locaux minimum (marché local plus étroit). */
  localMinComparables: 3,
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
  // Annonces stockées avant le nettoyage des modèles : "tiguanmodelall" == "tiguan".
  const model = compact(listing.model).replace(/modeles?all$|modelall$/, '');
  const titleModel = listing.type === 'moto' ? compact(listing.title ?? '').match(/mt\d{2}|z\d{3}|r1[02]\d0gs|cb\d{3}/)?.[0] : undefined;
  return `${listing.type}:${compact(listing.brand)}:${titleModel && !model.includes(titleModel) ? `${model}-${titleModel}` : model}:${variantOf(listing)}`;
}

const textOf = (l) => normalize([l.title, l.version, l.engine, l.gearbox, l.fuel].filter(Boolean).join(' '));

/** Carburant : attribut LeBonCoin, sinon déduit de la motorisation ("1.5 dCi" = diesel). null si inconnu. */
export function fuelOf(listing) {
  const f = normalize(listing.fuel ?? '');
  const t = `${f} ${textOf(listing)}`;
  if (/electrique|\bev\b|e-tech electrique|\bzoe\b|e-208|e-2008|tesla/.test(t)) return 'electrique';
  if (/hybride|e-tech|\bhev\b|phev|full hybrid|rechargeable/.test(t)) return 'hybride';
  if (/diesel|gazole|\bdci\b|\btdi\b|\bhdi\b|bluehdi|\bcrdi\b|\bcdi\b|multijet|\bjtd|\bd4d\b|\btdci\b|\bblue ?dci\b|\b\d{3}d\b/.test(t)) return 'diesel';
  if (/essence|\btce\b|\btsi\b|\btfsi\b|puretech|\bvti\b|\bthp\b|\bsce\b|\bmpi\b|ecoboost|\bvvt|\bgti\b|\bfsi\b/.test(t)) return 'essence';
  return null;
}

/** Boîte : 'auto' (EDC, DSG, BVA, EAT…) ou 'manuelle' ; null si inconnue. */
export function gearboxOf(listing) {
  const g = normalize(listing.gearbox ?? '');
  if (/auto|robot|sequentiel/.test(g)) return 'auto';
  if (/manuel/.test(g)) return 'manuelle';
  const t = textOf(listing);
  if (/\bedc\b|\bdsg\b|\bbva\b|\beat ?\d?\b|\bcvt\b|s.?tronic|\bdct\b|\bbvr\b|automatique|\b7g\b|\b9g\b|steptronic/.test(t)) return 'auto';
  if (/\bbvm\d?\b|manuelle/.test(t)) return 'manuelle';
  return null;
}

/** Puissance DIN (ch) : attribut, sinon lue dans la motorisation ("TCe 90", "120 ch"). null si inconnue. */
export function powerOf(listing) {
  if (Number(listing.powerDin) > 30) return Number(listing.powerDin);
  const t = textOf(listing);
  const ch = t.match(/\b(\d{2,3}) ?(ch|chevaux|hp|ps)\b/);
  if (ch) return Number(ch[1]);
  const code = t.match(/\b(?:tce|dci|blue ?dci|tsi|tdi|hdi|bluehdi|puretech|vti|thp|sce|tfsi|crdi|ecoboost|multijet|tdci|mpi|fsi|d4d|cdi)\s?(\d{2,3})\b/);
  return code && Number(code[1]) >= 50 ? Number(code[1]) : null;
}

/**
 * Fiabilité de la cote (0-100) : nombre de comparables, dispersion des prix (écart entre le quart bas
 * et le quart haut, rapporté à la médiane), critères de motorisation vérifiés, fenêtre serrée ou élargie.
 * Haute >= 70, moyenne >= 45, faible sinon (ou si les prix sont dispersés à plus de 35 %).
 * Une cote faible ne déclenche jamais d'alerte.
 */
export function marketConfidence({ comparables, low, high, price, verified, window }) {
  const spread = price > 0 ? (high - low) / price : 1;
  let score = comparables >= 10 ? 40 : comparables >= 6 ? 30 : comparables >= 4 ? 20 : 10;
  score += spread <= 0.12 ? 30 : spread <= 0.2 ? 20 : spread <= 0.3 ? 10 : 0;
  score += verified >= 3 ? 20 : verified === 2 ? 12 : verified === 1 ? 5 : 0;
  if (window === 'serré') score += 10;
  // Prix trop dispersés (écart quart bas / quart haut > 35 % de la médiane) : la médiane ne veut rien dire.
  const level = spread > 0.35 ? 'faible' : score >= 70 ? 'haute' : score >= 45 ? 'moyenne' : 'faible';
  return { score, level: /** @type {'haute'|'moyenne'|'faible'} */ (level), spreadPct: Math.round(spread * 100) };
}

/** Annonce d'un vendeur professionnel (source « LeBonCoin · Pro »). */
export const isProSeller = (listing) => /\bpro\b/i.test(String(listing.source ?? ''));

/** Annonce à écarter des comparables : accidentée, en panne, papiers douteux… (prix tiré vers le bas). */
export function isDamaged(listing) {
  // Annonce compacte du stock : l'état a été évalué sur l'annonce complète au moment du relevé.
  if (listing.damaged === true) return true;
  const t = normalize(`${listing.title ?? ''} ${listing.description ?? ''}`);
  return PRICE_SIGNALS.risks.some((r) => findPattern(t, r.pattern));
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
export function estimateMarketPrice(listing, pool, minComparables = MARKET_RULES.minComparables) {
  const key = modelKey(listing);
  const fuel = fuelOf(listing);
  const gearbox = gearboxOf(listing);
  const power = powerOf(listing);
  // Finition : une entrée de gamme ne se compare pas à une finition haute (elle se revend moins bien, L'argus).
  const trim = trimOf(listing)?.tier ?? null;
  const sameModel = pool.filter((p) => p.id !== listing.id && p.price > 0 && modelKey(p) === key);
  // État : les annonces accidentées / en panne tirent la médiane vers le bas, on les écarte.
  const healthy = sameModel.filter((p) => !isDamaged(p));
  const damagedExcluded = sameModel.length - healthy.length;

  for (const w of MARKET_RULES.windows) {
    const tolerance = Math.max(w.mileageFloor, listing.mileage * w.mileageRatio);
    let comps = healthy.filter((p) => {
      if (Math.abs(p.year - listing.year) > w.years) return false;
      if (listing.mileage && p.mileage && Math.abs(p.mileage - listing.mileage) > tolerance) return false;
      // Motorisation : même carburant, même boîte, puissance proche (quand l'info existe des deux côtés).
      const pf = fuelOf(p);
      if (fuel && pf && pf !== fuel) return false;
      const pg = gearboxOf(p);
      if (gearbox && pg && pg !== gearbox) return false;
      const pp = powerOf(p);
      if (power && pp && Math.abs(pp - power) > power * w.powerRate) return false;
      const pt = trim ? trimOf(p)?.tier : null;
      if (trim && pt && pt !== trim) return false;
      return true;
    });
    if (comps.length < minComparables) continue;
    // Revente en particulier : un pro vend plus cher (garantie incluse). La cote prend les particuliers seuls
    // quand ils suffisent (accord de l'utilisateur le 27/10/2026), sinon tout le monde, et le dit.
    const privateComps = comps.filter((p) => !isProSeller(p));
    const prosExcluded = comps.length - privateComps.length;
    const sellerCriterion =
      privateComps.length >= minComparables
        ? prosExcluded > 0
          ? [`particuliers seulement (${prosExcluded} pro(s) écarté(s))`]
          : []
        : prosExcluded > 0
          ? ['pros inclus (pas assez d’annonces de particuliers)']
          : [];
    if (privateComps.length >= minComparables) comps = privateComps;
    const criteria = [
      fuel ? `même carburant (${fuel})` : 'carburant non vérifié',
      gearbox ? `même boîte (${gearbox})` : 'boîte non vérifiée',
      power ? `puissance ±${Math.round(w.powerRate * 100)} % (${power} ch)` : 'puissance non vérifiée',
      trim ? `même niveau de finition (${trim === 'entree' ? 'entrée de gamme' : trim === 'milieu' ? 'intermédiaire' : 'haute'})` : 'finition non vérifiée',
      `année ±${w.years}`,
      listing.mileage ? `km ±${Math.round(tolerance / 1000)} 000` : 'km non vérifié',
      ...(damagedExcluded > 0 ? [`${damagedExcluded} annonce(s) accidentée(s) / en panne écartée(s)`] : []),
      ...sellerCriterion,
    ];

    let prices = comps.map((p) => p.price).sort((a, b) => a - b);
    if (prices.length >= MARKET_RULES.trimFrom) {
      const cut = Math.floor(prices.length * 0.1);
      prices = prices.slice(cut, prices.length - cut);
    }
    const round = (n) => Math.round(n / MARKET_RULES.step) * MARKET_RULES.step;
    // Délai de vente : depuis combien de jours les comparables sont en ligne (médiane).
    const now = Date.now();
    const days = comps
      .map((p) => Math.floor((now - new Date(p.publishedAt).getTime()) / 86_400_000))
      .filter((d) => Number.isFinite(d) && d >= 0)
      .sort((a, b) => a - b);
    const price = round(quantile(prices, 0.5));
    const low = round(quantile(prices, 0.25));
    const high = round(quantile(prices, 0.75));
    const verified = [fuel, gearbox, power].filter(Boolean).length;
    return {
      daysOnMarket: days.length ? Math.round(quantile(days, 0.5)) : null,
      price,
      comparables: comps.length,
      window: w.label,
      criteria,
      low,
      high,
      confidence: marketConfidence({ comparables: comps.length, low, high, price, verified, window: w.label }),
      // Les annonces réellement comparées, pour vérifier toi-même (12 max, du moins cher au plus cher).
      samples: [...comps]
        .sort((a, b) => a.price - b.price)
        .slice(0, 12)
        .map((p) => ({ id: p.id, title: p.title, price: p.price, year: p.year, mileage: p.mileage, location: p.location ?? null, url: adUrl(p) })),
    };
  }
  return null;
}

/**
 * Prix de revente CHEZ TOI : médiane des comparables à moins de 100 km de la base (200 km à défaut).
 * C'est le prix réaliste auquel tu revends dans ta zone, celui qui fait (ou pas) l'affaire.
 * @param {import('../utils/scoring.js').Listing} listing
 * @param {import('../utils/scoring.js').Listing[]} pool
 * @param {{ lat: number, lng: number }} base
 * @returns {null | { price: number, low: number, high: number, comparables: number, daysOnMarket: number|null, radiusKm: number }}
 */
export function estimateLocalPrice(listing, pool, base) {
  const located = pool.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  for (const radiusKm of MARKET_RULES.localRadiiKm) {
    const near = located.filter((p) => distanceKm(base, { lat: p.lat, lng: p.lng }) <= radiusKm);
    const market = estimateMarketPrice(listing, near, MARKET_RULES.localMinComparables);
    if (market) return { ...market, radiusKm };
  }
  return null;
}

/** Dédoublonne un stock d'annonces par id en gardant la version la plus récente du tableau. */
export function dedupeById(listings) {
  const map = new Map();
  for (const l of listings) {
    // Dernier relevé gagnant, mais on garde les photos d'un relevé précédent s'il en avait.
    const prev = map.get(l.id);
    map.set(l.id, !l.photos?.length && prev?.photos?.length ? { ...l, photos: prev.photos } : l);
  }
  return [...map.values()];
}
