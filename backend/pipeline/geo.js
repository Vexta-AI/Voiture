/**
 * Filtre géographique : le scraper n'applique pas toujours le rayon demandé,
 * donc chaque annonce est revérifiée avec ses coordonnées GPS.
 */

const EARTH_RADIUS_KM = 6371;
const rad = (deg) => (deg * Math.PI) / 180;

/** Distance à vol d'oiseau (km) entre deux points GPS. */
export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * @param {{ lat?: number, lng?: number }} listing
 * @param {{ lat: number, lng: number, radiusKm: number }} area
 * @returns {'in'|'out'|'unknown'} unknown = pas de coordonnées
 */
export function areaStatus(listing, area) {
  if (typeof listing.lat !== 'number' || typeof listing.lng !== 'number') return 'unknown';
  return distanceKm(area, { lat: listing.lat, lng: listing.lng }) <= area.radiusKm ? 'in' : 'out';
}

/** Ne garde que les annonces dans la zone ; compte les rejets pour le diagnostic. */
export function filterArea(listings, area) {
  const kept = [];
  const stats = { inArea: 0, outOfArea: 0, noCoords: 0, departments: /** @type {Record<string, number>} */ ({}) };
  for (const l of listings) {
    const dep = l.zip ? String(l.zip).slice(0, 2) : '??';
    stats.departments[dep] = (stats.departments[dep] ?? 0) + 1;
    const status = areaStatus(l, area);
    if (status === 'in') {
      stats.inArea += 1;
      kept.push(l);
    } else if (status === 'out') stats.outOfArea += 1;
    else stats.noCoords += 1;
  }
  return { kept, stats };
}
