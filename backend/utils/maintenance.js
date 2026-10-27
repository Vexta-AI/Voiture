/**
 * FICHE ENTRETIEN DU MOTEUR : reconnaît le moteur d'une annonce (marque, carburant, année, libellé)
 * et sort ce qu'il faut savoir avant d'acheter : courroie ou chaîne, échéance, points faibles,
 * questions à poser au vendeur. Données sourcées dans backend/config/engines.js.
 *
 * Information seulement : la fiche ne change ni le score ni la marge (aucune règle métier modifiée).
 */

import { ENGINE_SHEETS } from '../config/engines.js';
import { compact, normalize } from './text.js';

const FUELS = [
  ['electrique', /electrique|electric/],
  ['hybride', /hybride|hybrid/],
  ['diesel', /diesel|gazole/],
  ['essence', /essence|petrol|sp ?9[58]/],
];

/** Carburant normalisé à partir du champ de l'annonce. */
export function fuelOf(listing) {
  const f = normalize(listing.fuel);
  return FUELS.find(([, re]) => re.test(f))?.[0] ?? null;
}

/**
 * Fiche du premier moteur reconnu, ou null.
 * @param {{ brand?: string, fuel?: string, year?: number, title?: string, model?: string }} listing
 * @param {string} [text] texte normalisé de l'annonce si déjà calculé
 */
export function engineSheet(listing, text = normalize(`${listing.title ?? ''} ${listing.model ?? ''}`)) {
  const brand = compact(listing.brand);
  const fuel = fuelOf(listing);
  const year = Number(listing.year) || 0;
  return (
    ENGINE_SHEETS.find((e) =>
      e.match.some(
        (m) =>
          m.brands.includes(brand) &&
          (!m.fuel || !fuel || m.fuel === fuel) &&
          (!m.yearFrom || !year || year >= m.yearFrom) &&
          (!m.yearTo || !year || year <= m.yearTo) &&
          m.text.test(text),
      ),
    ) ?? null
  );
}

const DIST_LABEL = { courroie: 'courroie', 'courroie-humide': 'courroie humide (bain d’huile)', chaine: 'chaîne', mixte: 'courroie + chaîne' };

const range = ([min, max], unit) => (min === max ? `${min.toLocaleString('fr-FR')} ${unit}` : `${min.toLocaleString('fr-FR')} à ${max.toLocaleString('fr-FR')} ${unit}`);

/** Ligne lisible : « 1.5 dCi (K9K) : courroie, tous les 120 000 à 160 000 km ou 5 à 6 ans selon les sources ». */
export function distributionLine(sheet) {
  const d = sheet.distribution;
  if (!d?.type) return `${sheet.label} : type de distribution à vérifier (sources contradictoires)`;
  const parts = [`${sheet.label} : ${DIST_LABEL[d.type] ?? d.type}`];
  const when = [d.intervalKm && range(d.intervalKm, 'km'), d.intervalYears && range(d.intervalYears, 'ans')].filter(Boolean);
  if (when.length) parts.push(`à remplacer tous les ${when.join(' ou ')} selon les sources (à valider sur le carnet)`);
  if (sheet.kitCost) parts.push(`kit ≈ ${sheet.kitCost.min.toLocaleString('fr-FR')} à ${sheet.kitCost.max.toLocaleString('fr-FR')} € estimés`);
  return parts.join(', ');
}

/**
 * Résumé attaché à l'analyse : de quoi afficher la fiche et adapter les questions au vendeur.
 * `beltDue` : km de l'annonce au-delà du premier palier publié, sans facture de distribution détectée.
 */
export function maintenanceSummary(listing, text, beltHistoryKnown) {
  const sheet = engineSheet(listing, text);
  if (!sheet) return null;
  const d = sheet.distribution;
  const belt = d?.type === 'courroie' || d?.type === 'courroie-humide' || d?.type === 'mixte';
  const firstKm = d?.intervalKm?.[0] ?? null;
  return {
    id: sheet.id,
    label: sheet.label,
    distribution: d,
    line: distributionLine(sheet),
    beltDue: belt && firstKm !== null && Number(listing.mileage) >= firstKm && !beltHistoryKnown,
    weakPoints: sheet.weakPoints,
    sellerQuestions: sheet.sellerQuestions,
    solid: Boolean(d?.solid),
  };
}
