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
