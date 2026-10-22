/**
 * GÉNÉRATEUR DE SCRIPTS & MESSAGES VENDEUR
 *
 * - Message de négociation : pointe les défauts détectés (rayure, calandre,
 *   consommables...) pour obtenir une baisse de 500 € à 1 000 €.
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
 * Remise demandée : somme des leviers, bornée à [500 € ; 1 000 €], arrondie à 50 €.
 * @param {ReturnType<import('./scoring.js').scoreListing>} analysis
 */
export function negotiationDiscount(analysis) {
  const { min, max, step } = NEGOTIATION_RANGE;
  const base = analysis.finance.leversTotal > 0 ? analysis.finance.leversTotal : min;
  // Annonce ancienne : on pousse la remise vers le haut de la fourchette.
  const ageBoost = analysis.daysOnline >= MANDATE.minDaysOnline ? 200 : 0;
  return clamp(roundTo(base + ageBoost, step), min, max);
}

/**
 * @param {import('./scoring.js').Listing} listing
 * @param {ReturnType<import('./scoring.js').scoreListing>} analysis
 * @param {{ tone?: 'courtois'|'direct', signature?: string }} [options]
 */
export function generateNegotiationMessage(listing, analysis, options = {}) {
  const tone = options.tone ?? 'courtois';
  const signature = options.signature ?? 'Cordialement';
  const discount = negotiationDiscount(analysis);
  let offer = roundTo(listing.price - discount, 50);
  if (analysis.puretechCondition) offer = Math.min(offer, roundTo(analysis.puretechCondition.maxBuyPrice, 50));
  const name = vehicleName(listing);
  const levers = analysis.levers;

  const lines = [];
  lines.push(tone === 'direct' ? 'Bonjour,' : 'Bonjour, j’espère que vous allez bien.');
  lines.push('');
  lines.push(
    `Votre ${name} de ${listing.year} (${listing.mileage.toLocaleString('fr-FR')} km) m’intéresse sérieusement. ` +
      'Je suis acheteur rapide : paiement par virement instantané et déplacement sous 48 h sur le secteur.',
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
      ? `Mon offre : ${eur(offer)}, paiement immédiat. Disponible pour voir le véhicule dès cette semaine.`
      : `Dans ces conditions, je peux vous proposer ${eur(offer)}, avec un paiement immédiat le jour de la vente. Seriez-vous ouvert à en discuter ?`,
  );
  lines.push('');
  lines.push(signature);

  return { text: lines.join('\n'), offer, discount };
}

/**
 * @param {import('./scoring.js').Listing} listing
 * @param {ReturnType<import('./scoring.js').scoreListing>} analysis
 * @param {{ signature?: string, company?: string }} [options]
 */
export function generateMandateMessage(listing, analysis, options = {}) {
  const signature = options.signature ?? 'Cordialement';
  const company = options.company ?? 'notre structure de dépôt-vente';
  const name = vehicleName(listing);
  const mandate = analysis.mandate;
  const salePrice = mandate?.salePrice ?? listing.price;

  const lines = [
    'Bonjour,',
    '',
    `Je vois que votre ${name} est en ligne depuis ${analysis.daysOnline} jours. Entre les appels sans suite, les curieux et les essais qui n’aboutissent pas, vendre seul prend du temps et de l’énergie.`,
    '',
    `Je vous propose de m’en occuper via ${company}, en dépôt-vente :`,
    `• Vente plus chère grâce au statut professionnel : prix de vente visé autour de ${eur(salePrice)}, avec garantie mécanique proposée à l’acheteur (c’est ce qui rassure et fait payer le juste prix).`,
    '• Zéro avance d’argent de votre part : vous ne payez rien avant la vente.',
    '• Gestion complète : photos pro, diffusion des annonces, filtrage des appels, essais, paperasse (cession, carte grise).',
    `• Mandat clair : exclusivité de ${MANDATE.exclusivityDays} jours, conditions écrites, vous restez propriétaire jusqu’à la vente.`,
    '',
    'En option, nous pouvons aussi remettre le véhicule à son meilleur niveau avant la mise en vente (detailing complet, entretien), ce qui accélère la vente.',
    '',
    'Seriez-vous disponible pour un appel de 5 minutes cette semaine afin que je vous détaille le fonctionnement ?',
    '',
    signature,
  ];

  return { text: lines.join('\n'), salePrice };
}
