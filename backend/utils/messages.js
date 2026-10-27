/**
 * GÉNÉRATEUR DE SCRIPTS & MESSAGES VENDEUR
 *
 * - Message de négociation : pointe les défauts détectés (rayure, calandre,
 *   consommables...) pour obtenir une baisse d'environ 10 % (800 € à 2 500 €).
 * - Proposition de Mandat / Dépôt-Vente : pour les annonces en ligne depuis
 *   15 jours ou plus (vente plus chère via le pro, zéro avance, gestion complète).
 *
 * Templates déterministes (gratuits, instantanés). La route /api/messages peut
 * ensuite les affiner avec Claude si ANTHROPIC_API_KEY est configurée.
 */

import { MANDATE, NEGOTIATION_RANGE, SEASONALITY } from '../config/rules.js';
import { clamp, roundTo } from './text.js';

const eur = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;

function vehicleName(listing) {
  return [listing.brand, listing.model, listing.version].filter(Boolean).join(' ');
}

/**
 * Bornes de remise pour un prix affiché : [800 € ; 2 500 €], ramenées à 20 % / 15 % du prix sur les petits budgets.
 * @param {number} price
 */
export function negotiationBounds(price) {
  const { min, max, maxRate, floorMaxRate } = NEGOTIATION_RANGE;
  const low = Math.min(min, price * floorMaxRate);
  return { low, high: Math.max(low, Math.min(max, price * maxRate)) };
}

/**
 * Remise demandée : le plus fort entre ~10 % du prix et la somme des leviers, +5 % à J+15, bornée, arrondie à 50 €.
 * @param {ReturnType<import('./scoring.js').scoreListing>} analysis
 */
export function negotiationDiscount(analysis) {
  return discountFor(analysis.finance.askingPrice, analysis.finance.leversTotal, analysis.daysOnline);
}

/** @param {number} price @param {number} leversTotal @param {number} daysOnline */
function discountFor(price, leversTotal, daysOnline) {
  const { step, targetRate, staleRate } = NEGOTIATION_RANGE;
  const { low, high } = negotiationBounds(price);
  const base = Math.max(leversTotal, price * targetRate);
  // Annonce ancienne : vendeur fatigué, on pousse la remise vers le haut de la fourchette.
  const ageBoost = daysOnline >= MANDATE.minDaysOnline ? price * staleRate : 0;
  return clamp(roundTo(base + ageBoost, step), low, high);
}

/**
 * Offre envoyée au vendeur : la même pour le message et pour le calcul de la marge négociée.
 * @param {{ price: number, leversTotal: number, daysOnline: number, puretechMaxBuy?: number | null }} params
 */
export function offerPriceFor({ price, leversTotal, daysOnline, puretechMaxBuy = null }) {
  const { step } = NEGOTIATION_RANGE;
  const { high } = negotiationBounds(price);
  // Offre arrondie au palier inférieur : la remise réelle reste >= la remise visée, sans dépasser le plafond.
  let offer = Math.floor((price - discountFor(price, leversTotal, daysOnline)) / step) * step;
  if (price - offer > high) offer = Math.ceil((price - high) / step) * step;
  // PureTech : le plafond -30 % de la cote prime sur la fourchette de négo.
  if (puretechMaxBuy !== null) offer = Math.min(offer, Math.floor(puretechMaxBuy / step) * step);
  return Math.max(0, offer);
}

/**
 * @param {import('./scoring.js').Listing} listing
 * @param {ReturnType<import('./scoring.js').scoreListing>} analysis
 * @param {{ tone?: 'courtois'|'direct', signature?: string }} [options]
 */
export function generateNegotiationMessage(listing, analysis, options = {}) {
  const tone = options.tone ?? 'direct';
  const signature = options.signature ?? 'Cordialement';
  const offer = offerPriceFor({
    price: listing.price,
    leversTotal: analysis.finance.leversTotal,
    daysOnline: analysis.daysOnline,
    puretechMaxBuy: analysis.puretechCondition?.maxBuyPrice ?? null,
  });
  const discount = listing.price - offer;
  const name = vehicleName(listing);
  const levers = analysis.levers;

  const lines = [];
  lines.push(tone === 'direct' ? 'Bonjour,' : 'Bonjour, j’espère que vous allez bien.');
  lines.push('');
  lines.push(
    `Votre ${name} de ${listing.year} (${listing.mileage.toLocaleString('fr-FR')} km) m’intéresse et je peux conclure très vite : ` +
      'paiement immédiat par virement instantané (fonds reçus en quelques secondes) et déplacement sous 48 h sur le secteur.',
  );
  lines.push('');

  if (levers.length > 0) {
    lines.push('En relisant l’annonce, je note quelques frais à prévoir de mon côté :');
    for (const lever of levers) lines.push(`• ${lever.label} : ${lever.argument}.`);
    lines.push('');
  } else {
    lines.push(
      'Après comparaison avec les annonces équivalentes sur la région, le prix affiché se situe dans le haut de la fourchette du marché, ' +
        'et je dois intégrer un passage en préparation (nettoyage complet, contrôle mécanique).',
    );
    lines.push('');
  }

  // Argument chiffré et vérifiable : le bas du marché des annonces réellement comparées.
  const stats = listing.marketStats;
  if (stats && stats.comparables >= 4 && stats.low < listing.price) {
    lines.push(
      `Sur les ${stats.comparables} annonces équivalentes que j'ai comparées (même motorisation, année et kilométrage proches), une bonne partie est affichée autour de ${eur(stats.low)}.`,
    );
    lines.push('');
  }

  if (analysis.puretechCondition) {
    lines.push(
      'Le 1.2 PureTech impose aussi une vigilance particulière sur la courroie de distribution : pourriez-vous me transmettre la facture de remplacement courroie + crépine ?',
    );
    lines.push('');
  }

  if (listing.type === 'moto' && SEASONALITY.moto.buyMonths.includes(new Date().getMonth() + 1)) {
    lines.push('En pleine période hivernale, la demande moto est au plus bas : je vous propose une solution immédiate plutôt que d’attendre le printemps.');
    lines.push('');
  }

  if (analysis.daysOnline >= MANDATE.minDaysOnline) {
    lines.push(`Votre annonce étant en ligne depuis ${analysis.daysOnline} jours, je vous propose une transaction simple et rapide.`);
    lines.push('');
  }

  lines.push(
    tone === 'direct'
      ? `Mon offre ferme : ${eur(offer)}, payés immédiatement par virement instantané le jour de la vente. Je suis disponible dès cette semaine.`
      : `Dans ces conditions, je peux vous proposer ${eur(offer)}, avec un paiement immédiat le jour de la vente. Seriez-vous ouvert à en discuter ?`,
  );
  lines.push('');
  lines.push(signature);

  return { subject: `${name} : offre ferme à ${eur(offer)}, virement instantané`, text: lines.join('\n'), offer, discount };
}

/**
 * @param {import('./scoring.js').Listing} listing
 * @param {ReturnType<import('./scoring.js').scoreListing>} analysis
 * @param {{ signature?: string, company?: string }} [options]
 */
export function generateMandateMessage(listing, analysis, options = {}) {
  const signature = options.signature ?? 'Cordialement';
  const company = options.company ?? 'notre service de dépôt-vente';
  const name = vehicleName(listing);
  const mandate = analysis.mandate;
  const salePrice = mandate?.salePrice ?? listing.marketPrice;
  const ownerNet = mandate?.ownerNet ?? listing.price;

  const netLine =
    ownerNet >= listing.price
      ? `• Vous fixez votre prix net : ${eur(ownerNet)}, soit le prix de votre annonce. C'est la somme que vous touchez, garantie par écrit.`
      : `• Vous touchez un prix net garanti par écrit, autour de ${eur(ownerNet)}, fixé ensemble selon le marché actuel.`;

  const lines = [
    'Bonjour,',
    '',
    `Votre ${name} est en ligne depuis ${analysis.daysOnline} jours. Je vous propose de vous décharger complètement de la vente via ${company}, sans que vous ayez à avancer un centime.`,
    '',
    netLine,
    `• Nous la vendons plus cher grâce au statut pro (prix visé autour de ${eur(salePrice)}) avec une garantie mécanique pour l'acheteur, ce qui fait accepter le juste prix.`,
    '• Notre rémunération : uniquement la plus-value réalisée au-dessus de votre prix net. Si nous ne vendons pas au-dessus, nous ne gagnons rien.',
    '• Zéro gestion des curieux : nous filtrons les appels, organisons les visites et les essais, et gérons toute la paperasse (cession, carte grise).',
    "• Zéro avance d'argent : aucun frais à payer avant la vente.",
    `• Mandat simple et clair : exclusivité de ${MANDATE.exclusivityDays} jours, vous restez propriétaire jusqu'à la vente.`,
    '',
    'Un appel de 5 minutes cette semaine pour en parler ?',
    '',
    signature,
  ];

  return {
    subject: `Votre ${listing.brand} ${listing.model} : vendue plus cher, sans les curieux`,
    text: lines.join('\n'),
    salePrice,
    ownerNet,
    commission: mandate?.commission ?? Math.max(0, salePrice - ownerNet),
  };
}

/**
 * Premier message quand la cote est peu fiable (ou avant toute offre) : on qualifie la voiture avant de
 * parler prix. Les questions déjà réglées par l'annonce (factures, distribution, CT, propriétaires) sont sautées.
 * @param {import('./scoring.js').Listing} listing
 * @param {ReturnType<import('./scoring.js').scoreListing>} analysis
 * @param {{ signature?: string }} [options]
 */
export function generateQualificationMessage(listing, analysis, options = {}) {
  const name = vehicleName(listing);
  const known = new Set(analysis.quality?.hits.map((h) => h.id) ?? []);
  const questions = [
    // HistoVec : rapport officiel et gratuit (propriétaires, sinistres, gage, km relevés aux CT).
    'Pourriez-vous m’envoyer le lien du rapport HistoVec ? (gratuit sur histovec.interieur.gouv.fr, 2 minutes avec la carte grise)',
    analysis.quality?.owners === null || analysis.quality?.owners === undefined ? 'Combien de propriétaires a-t-elle eus ?' : null,
    known.has('factures') || known.has('carnet') ? 'Les factures d’entretien sont-elles disponibles pour la visite ?' : 'Avez-vous les factures d’entretien ?',
    known.has('distribution') ? null : 'La distribution a-t-elle déjà été faite ? Si oui, à quel kilométrage ?',
    known.has('ct-ok') ? 'Le contrôle technique a-t-il relevé des défauts mineurs ?' : 'De quand date le dernier contrôle technique, et avec quelles remarques ?',
    ...(analysis.imported?.sellerQuestions ?? []),
    'Y a-t-il des frais à prévoir que vous connaissez ?',
    'Pour quelle raison la vendez-vous ?',
  ].filter(Boolean);

  const lines = [
    'Bonjour,',
    '',
    `Votre ${name} de ${listing.year} (${Number(listing.mileage).toLocaleString('fr-FR')} km) m’intéresse sérieusement. Avant de me déplacer, quelques questions :`,
    '',
    ...questions.map((q) => `• ${q}`),
    '',
    'Si tout est clair, je peux venir la voir rapidement, avec paiement immédiat par virement instantané.',
    '',
    options.signature ?? 'Merci d’avance, bonne journée',
  ];
  return { subject: `${name} : quelques questions avant visite`, text: lines.join('\n'), questions };
}
