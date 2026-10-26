/**
 * STOCK D'ANNONCES COMPACT (comparables + historique), une entrée par annonce.
 *
 * Avant : chaque run était relu en entier à chaque passage (des centaines d'opérations de stockage).
 * Maintenant : chaque annonce vue est fusionnée dans une entrée compacte qui garde ce dont le radar
 * a besoin : de quoi servir de comparable, le premier prix vu, le plus haut prix vu, les dates.
 */

import { isDamaged } from './market.js';

/**
 * Annonce réduite aux champs utiles aux comparables (cote, finition, concurrence, revente locale).
 * @param {import('../utils/scoring.js').Listing} l
 */
export function compactListing(l) {
  return {
    id: l.id,
    type: l.type,
    title: String(l.title ?? '').slice(0, 140),
    brand: l.brand,
    model: l.model,
    year: l.year,
    mileage: l.mileage,
    price: l.price,
    marketPrice: 0,
    fuel: l.fuel,
    gearbox: l.gearbox,
    powerDin: l.powerDin,
    publishedAt: l.publishedAt,
    location: l.location,
    zip: l.zip,
    lat: l.lat,
    lng: l.lng,
    url: l.url,
    // L'annonce complète (description) n'est pas gardée : l'état « accidentée / en panne » est figé ici.
    damaged: isDamaged(l),
  };
}

/**
 * @typedef {{ listing: ReturnType<typeof compactListing>, firstSeenAt: string, firstPrice: number, maxPrice: number, lastSeenAt: string }} PoolEntry
 */

/**
 * Fusionne un nouveau relevé dans l'entrée existante (ou la crée).
 * @param {PoolEntry | null | undefined} prev
 * @param {import('../utils/scoring.js').Listing} listing
 * @param {string} seenAt ISO du relevé
 * @returns {PoolEntry}
 */
export function mergePoolEntry(prev, listing, seenAt) {
  const compact = compactListing(listing);
  if (!prev) return { listing: compact, firstSeenAt: seenAt, firstPrice: listing.price, maxPrice: listing.price, lastSeenAt: seenAt };
  const newer = seenAt >= prev.lastSeenAt;
  return {
    listing: newer ? compact : prev.listing,
    firstSeenAt: seenAt < prev.firstSeenAt ? seenAt : prev.firstSeenAt,
    firstPrice: seenAt < prev.firstSeenAt ? listing.price : prev.firstPrice,
    maxPrice: Math.max(prev.maxPrice, listing.price > 0 ? listing.price : 0),
    lastSeenAt: newer ? seenAt : prev.lastSeenAt,
  };
}

/**
 * Historique des prix (même forme que priceHistory dans history.js).
 * @param {PoolEntry[]} entries
 */
export function historyFromPool(entries) {
  /** @type {Map<string, { firstSeenAt: string, firstPrice: number, maxPrice: number }>} */
  const map = new Map();
  for (const e of entries) if (e.maxPrice > 0) map.set(e.listing.id, { firstSeenAt: e.firstSeenAt, firstPrice: e.firstPrice, maxPrice: e.maxPrice });
  return map;
}

/**
 * Première apparition de chaque véhicule (même forme que repostIndex dans history.js).
 * @param {PoolEntry[]} entries
 * @param {(l: any) => string | null} fingerprint
 */
export function repostIndexFromPool(entries, fingerprint) {
  /** @type {Map<string, { id: string, firstSeenAt: string, price: number }>} */
  const map = new Map();
  for (const e of entries) {
    const fp = fingerprint(e.listing);
    if (!fp) continue;
    const first = e.listing.publishedAt && e.listing.publishedAt < e.firstSeenAt ? e.listing.publishedAt : e.firstSeenAt;
    const known = map.get(fp);
    if (!known || first < known.firstSeenAt) map.set(fp, { id: e.listing.id, firstSeenAt: first, price: e.firstPrice });
  }
  return map;
}
