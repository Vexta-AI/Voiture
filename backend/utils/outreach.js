/**
 * OUTREACH AUTONOME
 *
 * Construit le payload JSON consommé par /api/outreach et par un scénario Make.com :
 * stratégie retenue, chiffres clés, message prêt à envoyer et alternative éventuelle.
 *
 * Stratégies :
 *   - "negotiation" : achat-revente d'une PÉPITE (négo 500-1 000 €, virement instantané)
 *   - "mandate"     : dépôt-vente pour une annonce en ligne depuis 15 jours ou plus
 * En mode "auto", si les deux sont possibles, la plus rentable gagne
 * (marge nette négociée vs revenu du mandat ; à égalité, le mandat : zéro trésorerie).
 */

import { generateMandateMessage, generateNegotiationMessage } from './messages.js';

export const OUTREACH_VERSION = 1;

/** @typedef {'negotiation'|'mandate'} Strategy */

/**
 * @param {ReturnType<import('./scoring.js').scoreListing>} analysis
 * @returns {Strategy[]} stratégies possibles, la plus rentable en premier
 */
export function eligibleStrategies(analysis) {
  if (analysis.blacklist.length > 0) return [];
  /** @type {Strategy[]} */
  const strategies = [];
  if (analysis.status.key === 'PEPITE') strategies.push('negotiation');
  if (analysis.mandateEligible && analysis.mandate) strategies.push('mandate');
  if (strategies.length === 2 && analysis.mandate && analysis.mandate.totalRevenue >= analysis.finance.negotiatedNetMargin) {
    strategies.reverse();
  }
  return strategies;
}

function strategyReason(strategy, analysis, strategies) {
  if (strategies.length < 2) {
    return strategy === 'negotiation'
      ? `PÉPITE : marge nette ${analysis.finance.netMargin} € > seuil ${analysis.threshold} €.`
      : `En ligne depuis ${analysis.daysOnline} jours : mandat sans trésorerie.`;
  }
  const buy = analysis.finance.negotiatedNetMargin;
  const mandate = analysis.mandate?.totalRevenue ?? 0;
  return strategy === 'mandate'
    ? `Mandat (${mandate} € sans trésorerie) ≥ achat-revente (${buy} € négociés).`
    : `Achat-revente (${buy} € négociés) > mandat (${mandate} €).`;
}

/**
 * @param {import('./scoring.js').Listing} listing
 * @param {ReturnType<import('./scoring.js').scoreListing>} analysis
 * @param {Strategy} strategy
 * @param {{ signature?: string, company?: string }} options
 */
function buildMessage(listing, analysis, strategy, options) {
  const generated =
    strategy === 'mandate'
      ? generateMandateMessage(listing, analysis, options)
      : generateNegotiationMessage(listing, analysis, { tone: 'direct', signature: options.signature });
  return { strategy, subject: generated.subject, body: generated.text, length: generated.text.length };
}

/**
 * @param {import('./scoring.js').Listing} listing
 * @param {ReturnType<import('./scoring.js').scoreListing>} analysis
 * @param {{ strategy?: 'auto'|Strategy, signature?: string, company?: string, now?: Date }} [options]
 */
export function buildOutreachPayload(listing, analysis, options = {}) {
  const requested = options.strategy ?? 'auto';
  const strategies = eligibleStrategies(analysis);

  if (strategies.length === 0 || (requested !== 'auto' && !strategies.includes(requested))) {
    const reason =
      analysis.blacklist.length > 0
        ? `Annonce blacklistée : ${analysis.blacklist.map((b) => b.label).join(', ')}.`
        : requested === 'mandate'
          ? 'Mandat impossible : annonce en ligne depuis moins de 15 jours.'
          : `Annonce non PÉPITE (statut ${analysis.status.label}, marge nette ${analysis.finance.netMargin} €).`;
    return { ok: false, error: 'not_eligible', reason, status: analysis.status.key, eligibleStrategies: strategies };
  }

  const strategy = requested === 'auto' ? strategies[0] : requested;
  const message = buildMessage(listing, analysis, strategy, options);
  const negotiation = strategies.includes('negotiation') ? generateNegotiationMessage(listing, analysis, { tone: 'direct' }) : null;
  const m = analysis.mandate;

  return {
    ok: true,
    event: 'outreach.generated',
    version: OUTREACH_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    strategy,
    strategyReason: strategyReason(strategy, analysis, strategies),
    listing: {
      id: listing.id,
      type: listing.type,
      title: listing.title,
      brand: listing.brand,
      model: listing.model,
      year: listing.year,
      mileage: listing.mileage,
      price: listing.price,
      marketPrice: listing.marketPrice,
      daysOnline: analysis.daysOnline,
      location: listing.location ?? null,
      source: listing.source ?? null,
      url: listing.url ?? null,
    },
    scoring: {
      status: analysis.status.key,
      statusLabel: analysis.status.label,
      score: analysis.score,
      segment: analysis.segment,
      threshold: analysis.threshold,
      grossMargin: analysis.finance.grossMargin,
      netMargin: analysis.finance.netMargin,
      negotiatedNetMargin: analysis.finance.negotiatedNetMargin,
    },
    negotiation: negotiation && {
      askingPrice: listing.price,
      offerPrice: negotiation.offer,
      discount: negotiation.discount,
      payment: 'virement_instantane',
      defects: analysis.levers.map((l) => ({ id: l.id, label: l.label, discount: l.discount, argument: l.argument })),
    },
    mandate: m && strategies.includes('mandate')
      ? {
          salePrice: m.salePrice,
          ownerNet: m.ownerNet,
          commission: m.commission,
          commissionModel: 'plus_value_au_dessus_du_prix_net',
          upsellMargin: m.upsellMargin,
          totalRevenue: m.totalRevenue,
          cashRequired: m.cashRequired,
          exclusivityDays: m.exclusivityDays,
          withdrawalPenalty: m.withdrawalPenalty,
        }
      : null,
    message,
    alternatives: strategies.filter((s) => s !== strategy).map((s) => buildMessage(listing, analysis, s, options)),
  };
}
