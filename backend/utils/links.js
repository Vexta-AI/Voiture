import { cleanModel } from '../pipeline/normalize.js';

/**
 * Lien vers l'annonce d'origine. Le scraper ne fournit pas toujours l'URL :
 * on la reconstruit depuis l'identifiant LeBonCoin ("lbc-<id>").
 * @param {{ id?: string, listingId?: string, type?: 'auto'|'moto', url?: string|null }} listing
 * @returns {string|null}
 */
export function adUrl(listing) {
  if (listing.url) return listing.url;
  const id = String(listing.id ?? listing.listingId ?? '').match(/^lbc-(\d+)$/)?.[1];
  if (!id) return null;
  return `https://www.leboncoin.fr/ad/${listing.type === 'moto' ? 'motos' : 'voitures'}/${id}`;
}

/**
 * Liens pour vérifier soi-même la cote d'une annonce : cote L'argus (site commercial, gratuit) et
 * annonces comparables LeBonCoin (même modèle, année ±1, km ±30 %, les moins chères d'abord).
 * @param {{ type?: 'auto'|'moto', brand?: string, model?: string, year?: number, mileage?: number }} listing
 */
export function priceCheckLinks(listing) {
  const params = new URLSearchParams({
    category: listing.type === 'moto' ? '3' : '2',
    text: `${listing.brand ?? ''} ${cleanModel(listing.model, listing.brand) ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim(),
  });
  const y = Number(listing.year) || 0;
  const km = Number(listing.mileage) || 0;
  if (y) params.set('regdate', `${y - 1}-${y + 1}`);
  if (km) params.set('mileage', `${Math.max(0, Math.round((km * 0.7) / 1000) * 1000)}-${Math.round((km * 1.3) / 1000) * 1000}`);
  params.set('sort', 'price');
  params.set('order', 'asc');
  return { argus: 'https://www.largus.fr/cote-auto.html', leboncoin: `https://www.leboncoin.fr/recherche?${params}` };
}
