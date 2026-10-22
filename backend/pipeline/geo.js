/**
 * Géographie de la chasse : le scraper n'applique pas toujours la zone demandée, donc chaque
 * annonce est replacée avec ses coordonnées GPS.
 *   prioritaire : dans le rayon autour de la base (Nouvelle-Aquitaine)
 *   france      : ailleurs en France métropolitaine (rapatriement déduit de la marge)
 *   hors        : DOM-TOM / étranger -> écartée
 */

import { LOGISTICS } from '../config/rules.js';

const EARTH_RADIUS_KM = 6371;
const rad = (deg) => (deg * Math.PI) / 180;

/** Distance à vol d'oiseau (km) entre deux points GPS. */
export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function inMetropolitanFrance({ lat, lng }) {
  const b = LOGISTICS.metroBounds;
  return lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax;
}

/**
 * @param {{ lat?: number, lng?: number }} listing
 * @param {{ lat: number, lng: number, radiusKm: number }} area
 * @returns {{ zone: 'prioritaire'|'france'|'hors'|'inconnue', distanceKm: number|null }}
 */
export function locate(listing, area) {
  if (typeof listing.lat !== 'number' || typeof listing.lng !== 'number') return { zone: 'inconnue', distanceKm: null };
  const point = { lat: listing.lat, lng: listing.lng };
  const d = distanceKm(area, point);
  if (d <= area.radiusKm) return { zone: 'prioritaire', distanceKm: d };
  return { zone: inMetropolitanFrance(point) ? 'france' : 'hors', distanceKm: d };
}

/**
 * Garde les annonces de France métropolitaine (zone prioritaire d'abord), avec leur distance.
 * @param {{ national?: boolean }} [options] national=false : zone prioritaire uniquement
 */
export function filterArea(listings, area, options = {}) {
  const national = options.national ?? true;
  const kept = [];
  const stats = { prioritaire: 0, france: 0, hors: 0, noCoords: 0, departments: /** @type {Record<string, number>} */ ({}) };
  for (const l of listings) {
    const dep = l.zip ? String(l.zip).slice(0, 2) : '??';
    stats.departments[dep] = (stats.departments[dep] ?? 0) + 1;
    const { zone, distanceKm: d } = locate(l, area);
    if (zone === 'inconnue') stats.noCoords += 1;
    else stats[zone] += 1;
    if (zone === 'prioritaire' || (zone === 'france' && national)) kept.push({ ...l, zone, distanceKm: Math.round(/** @type {number} */ (d)) });
  }
  // Zone prioritaire en tête.
  kept.sort((a, b) => a.distanceKm - b.distanceKm);
  return { kept, stats };
}
