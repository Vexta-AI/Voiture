/**
 * RÉSEAU D'ACHETEURS : les gens qui t'ont dit ce qu'ils cherchent.
 *
 * Chaque acheteur en attente a ses critères (modèle, budget, année, km, carburant, boîte).
 * Quand le radar trouve une voiture qui leur correspond, il te le dit AVANT que tu l'achètes :
 * tu achètes une voiture déjà vendue ou presque, et elle tourne en quelques jours.
 */

import { fuelOf, gearboxOf } from '../pipeline/market.js';
import { normalize } from './text.js';

/**
 * @typedef {Object} WaitingBuyer
 * @property {string} id
 * @property {string} name
 * @property {string} [phone]
 * @property {string} [channel]
 * @property {boolean} active
 * @property {string} createdAt
 * @property {string} [notes]
 * @property {{ type?: 'auto'|'moto', models?: string[], budgetMax: number, budgetMin?: number, yearMin?: number, mileageMax?: number, fuel?: string, gearbox?: 'auto'|'manuelle' }} criteria
 */

/**
 * Prix auquel tu revendras cette voiture : revente chez toi si connue, sinon prix marché.
 * @param {{ price: number, marketPrice?: number, localMarket?: { price: number } }} listing
 */
export function expectedResalePrice(listing) {
  return listing.localMarket?.price ?? (listing.marketPrice || listing.price);
}

/**
 * Une voiture correspond-elle à un acheteur ? Renvoie null si un critère bloque, sinon les raisons.
 * @param {import('./scoring.js').Listing} listing
 * @param {WaitingBuyer} buyer
 * @returns {null | { resalePrice: number, reasons: string[] }}
 */
export function matchBuyer(listing, buyer) {
  if (!buyer.active) return null;
  const c = buyer.criteria;
  const text = normalize(`${listing.brand} ${listing.model} ${listing.title}`);
  const reasons = [];
  if (c.type && c.type !== listing.type) return null;
  if (c.models?.length) {
    const hit = c.models.find((m) => normalize(m).split(/\s+/).every((word) => text.includes(word)));
    if (!hit) return null;
    reasons.push(`cherche : ${hit}`);
  }
  const resalePrice = expectedResalePrice(listing);
  if (resalePrice > c.budgetMax) return null;
  if (c.budgetMin && resalePrice < c.budgetMin) return null;
  reasons.push(`budget ${c.budgetMax.toLocaleString('fr-FR')} €`);
  if (c.yearMin) {
    if (listing.year < c.yearMin) return null;
    reasons.push(`${c.yearMin} ou plus`);
  }
  if (c.mileageMax) {
    if (listing.mileage > c.mileageMax) return null;
    reasons.push(`moins de ${c.mileageMax.toLocaleString('fr-FR')} km`);
  }
  if (c.fuel) {
    const f = fuelOf(listing);
    if (f && f !== normalize(c.fuel)) return null;
    reasons.push(f ? c.fuel : `${c.fuel} (à vérifier)`);
  }
  if (c.gearbox) {
    const g = gearboxOf(listing);
    if (g && g !== c.gearbox) return null;
    reasons.push(g ? `boîte ${c.gearbox}` : `boîte ${c.gearbox} (à vérifier)`);
  }
  return { resalePrice, reasons };
}

/**
 * Acheteurs intéressés par une voiture, du budget le plus serré au plus large (le plus probable d'abord).
 * @param {import('./scoring.js').Listing} listing
 * @param {WaitingBuyer[]} buyers
 */
export function matchBuyers(listing, buyers) {
  return buyers
    .map((buyer) => ({ buyer, match: matchBuyer(listing, buyer) }))
    .filter((x) => x.match !== null)
    .sort((a, b) => a.buyer.criteria.budgetMax - b.buyer.criteria.budgetMax)
    .map(({ buyer, match }) => ({ buyer, resalePrice: /** @type {NonNullable<typeof match>} */ (match).resalePrice, reasons: /** @type {NonNullable<typeof match>} */ (match).reasons }));
}

/** Message à envoyer à l'acheteur quand une voiture correspond (avant même de l'acheter). */
export function buyerPitch(listing, buyer) {
  const price = Math.floor(expectedResalePrice(listing) / 100) * 100 - 10;
  return [
    `Bonjour ${buyer.name},`,
    '',
    `J'ai peut-être votre voiture : ${listing.title}, ${listing.year}, ${Number(listing.mileage).toLocaleString('fr-FR')} km.`,
    `Elle serait préparée et vérifiée (contrôle technique de moins de 6 mois, carte grise, non-gage, entretien), autour de ${price.toLocaleString('fr-FR')} €.`,
    '',
    'Ça vous intéresse ? Je peux vous envoyer les photos et vous la réserver.',
  ].join('\n');
}

/**
 * Valide et normalise un acheteur saisi dans le CRM.
 * @param {unknown} input
 * @returns {{ ok: true, criteria: WaitingBuyer['criteria'], name: string, phone?: string, notes?: string } | { ok: false, error: string }}
 */
export function parseBuyerInput(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'objet attendu' };
  const o = /** @type {Record<string, any>} */ (input);
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 100) : '';
  if (!name) return { ok: false, error: 'nom requis' };
  const c = o.criteria && typeof o.criteria === 'object' ? o.criteria : {};
  const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : undefined);
  const budgetMax = num(c.budgetMax);
  if (!budgetMax) return { ok: false, error: 'budget maximum requis' };
  const models = (Array.isArray(c.models) ? c.models : String(c.models ?? '').split(','))
    .map((m) => String(m).trim())
    .filter(Boolean)
    .slice(0, 10);
  const fuel = ['essence', 'diesel', 'hybride', 'electrique'].includes(normalize(c.fuel ?? '')) ? normalize(c.fuel) : undefined;
  const gearbox = c.gearbox === 'auto' || c.gearbox === 'manuelle' ? c.gearbox : undefined;
  return {
    ok: true,
    name,
    phone: typeof o.phone === 'string' ? o.phone.trim().slice(0, 40) || undefined : undefined,
    notes: typeof o.notes === 'string' ? o.notes.trim().slice(0, 500) || undefined : undefined,
    criteria: {
      type: c.type === 'moto' ? 'moto' : 'auto',
      models,
      budgetMax,
      budgetMin: num(c.budgetMin),
      yearMin: num(c.yearMin),
      mileageMax: num(c.mileageMax),
      fuel,
      gearbox,
    },
  };
}
