/**
 * APPRENTISSAGE : ce que TES deals t'apprennent.
 *
 * Les règles du radar partent d'hypothèses sourcées (négo acheteur ~5 %, remise en état 500 €,
 * délai de vente du marché…). Chaque deal que tu mènes dans le CRM produit des chiffres réels :
 * prix obtenus, prix de revente, frais, délais, réponses des vendeurs. Ce module les mesure et
 * propose d'ajuster les hypothèses. Ces données n'existent que chez toi : c'est ce qu'aucun
 * concurrent ne peut copier.
 *
 * Rien n'est changé automatiquement : chaque ajustement est une proposition à valider (CLAUDE.md).
 */

import { COSTS, MARKET_TRUTH } from '../config/rules.js';

/** En dessous de ce nombre de deals, une mesure est affichée mais jamais proposée comme règle. */
export const LEARNING = { minSample: 3 };

const DAY_MS = 86_400_000;

function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const pct = (x) => (x === null ? null : Math.round(x * 1000) / 10);
const stageAt = (deal, stage) => deal.events.find((e) => e.type === 'stage' && e.stage === stage)?.at ?? null;

/** Tranche de remise demandée dans le premier message (part du prix affiché). */
function offerBucket(rate) {
  if (rate < 0.08) return 'moins de 8 %';
  if (rate < 0.12) return '8 à 12 %';
  return '12 % et plus';
}

/**
 * @param {import('./crm.js').Deal[]} deals
 */
export function learnFromDeals(deals) {
  const vehicles = deals.filter((d) => d.kind !== 'revente');
  const sold = vehicles.filter((d) => d.stage === 'vendu' && Number(d.numbers.soldPrice) > 0);

  // 1. Négo de TES acheteurs : prix affiché à la revente -> prix réellement encaissé.
  const resaleDiscounts = sold.filter((d) => Number(d.numbers.listedPrice) > 0).map((d) => (d.numbers.listedPrice - d.numbers.soldPrice) / d.numbers.listedPrice);

  // 2. Négo obtenue auprès des vendeurs : prix affiché -> prix d'achat.
  const bought = vehicles.filter((d) => d.kind === 'achat' && Number(d.numbers.purchasePrice) > 0 && Number(d.numbers.askingPrice) > 0);
  const purchaseDiscounts = bought.map((d) => (d.numbers.askingPrice - d.numbers.purchasePrice) / d.numbers.askingPrice);

  // 3. Justesse de la cote : prix de revente réel vs prix marché (ou revente locale) annoncé par le radar.
  const resaleErrors = sold
    .filter((d) => d.kind === 'achat' && Number(d.numbers.localPrice ?? d.numbers.marketPrice) > 0)
    .map((d) => {
      const predicted = Number(d.numbers.localPrice ?? d.numbers.marketPrice);
      return (d.numbers.soldPrice - predicted) / predicted;
    });

  // 4. Frais réels de remise en état (saisis dans la fiche) vs hypothèse.
  const reconditioning = bought.map((d) => Number(d.numbers.reconditioning ?? COSTS.RECONDITIONING_BASE) + Number(d.numbers.extraCosts ?? 0));

  // 5. Délai de vente réel : achat (ou mandat signé) -> vendu.
  const sellDays = sold
    .map((d) => {
      const start = stageAt(d, d.kind === 'mandat' ? 'signe' : 'achete');
      const end = stageAt(d, 'vendu');
      return start && end ? (new Date(end).getTime() - new Date(start).getTime()) / DAY_MS : null;
    })
    .filter((x) => x !== null);

  // 6. Taux de réponse des vendeurs et réussite par niveau d'offre.
  const contacted = vehicles.filter((d) => d.events.some((e) => e.type === 'out'));
  const replied = contacted.filter((d) => d.events.some((e) => e.type === 'in'));
  const won = (d) => ['rdv', 'achete', 'signe', 'preparation', 'en_vente', 'vendu'].includes(d.stage) || d.events.some((e) => e.type === 'in' && e.intent === 'accord');
  /** @type {Record<string, { sent: number, replied: number, won: number }>} */
  const byOffer = {};
  for (const d of contacted.filter((x) => x.kind === 'achat' && Number(x.numbers.askingPrice) > 0)) {
    const first = d.events.find((e) => e.type === 'out');
    const offer = Number(first?.amount);
    if (!(offer > 0)) continue;
    const bucket = offerBucket((d.numbers.askingPrice - offer) / d.numbers.askingPrice);
    const b = (byOffer[bucket] ??= { sent: 0, replied: 0, won: 0 });
    b.sent += 1;
    if (d.events.some((e) => e.type === 'in')) b.replied += 1;
    if (won(d)) b.won += 1;
  }

  // 7. Marge encaissée vs marge prévue à la création du deal.
  const marginGaps = sold
    .filter((d) => d.kind === 'achat' && Number(d.numbers.purchasePrice) > 0 && Number.isFinite(d.numbers.realNetMargin))
    .map((d) => {
      const n = d.numbers;
      const costs = Number(n.reconditioning ?? COSTS.RECONDITIONING_BASE) + Number(n.registrationCost ?? 0) + Number(n.transportCost ?? 0) + Number(n.ownershipCost ?? 0) + Number(n.extraCosts ?? 0);
      return n.soldPrice - n.purchasePrice - costs - Number(n.realNetMargin);
    });

  const measures = {
    buyerDiscount: { value: pct(median(resaleDiscounts)), n: resaleDiscounts.length, unit: '%', label: 'Négo de tes acheteurs (prix affiché → encaissé)', hypothesis: pct(MARKET_TRUTH.buyerDiscountRate) },
    purchaseDiscount: { value: pct(median(purchaseDiscounts)), n: purchaseDiscounts.length, unit: '%', label: 'Remise obtenue des vendeurs (affiché → acheté)', hypothesis: null },
    resaleError: { value: pct(median(resaleErrors)), n: resaleErrors.length, unit: '%', label: 'Revente réelle vs prix marché du radar', hypothesis: 0 },
    reconditioning: { value: median(reconditioning), n: reconditioning.length, unit: '€', label: 'Remise en état réelle (+ frais saisis)', hypothesis: COSTS.RECONDITIONING_BASE },
    sellDays: { value: median(sellDays) === null ? null : Math.round(median(sellDays)), n: sellDays.length, unit: 'j', label: 'Délai de vente réel', hypothesis: MARKET_TRUTH.slowDays },
    replyRate: { value: contacted.length ? pct(replied.length / contacted.length) : null, n: contacted.length, unit: '%', label: 'Vendeurs qui répondent', hypothesis: null },
    marginGap: { value: median(marginGaps) === null ? null : Math.round(median(marginGaps)), n: marginGaps.length, unit: '€', label: 'Marge encaissée − marge prévue', hypothesis: 0 },
  };

  const ok = (m) => m.value !== null && m.n >= LEARNING.minSample;
  /** @type {string[]} */
  const suggestions = [];
  const m = measures;
  if (ok(m.buyerDiscount) && Math.abs(m.buyerDiscount.value - m.buyerDiscount.hypothesis) >= 1) {
    suggestions.push(`Tes acheteurs négocient ${m.buyerDiscount.value} % (sur ${m.buyerDiscount.n} ventes), pas ${m.buyerDiscount.hypothesis} % : proposer d'utiliser ${m.buyerDiscount.value} % dans la marge prudente.`);
  }
  if (ok(m.resaleError) && Math.abs(m.resaleError.value) >= 3) {
    suggestions.push(`Tu revends ${m.resaleError.value > 0 ? 'plus cher' : 'moins cher'} que le prix marché du radar (${m.resaleError.value > 0 ? '+' : ''}${m.resaleError.value} % sur ${m.resaleError.n} ventes) : proposer de corriger la cote de ce pourcentage.`);
  }
  if (ok(m.reconditioning) && Math.abs(m.reconditioning.value - m.reconditioning.hypothesis) >= 100) {
    suggestions.push(`Ta remise en état réelle est de ${Math.round(m.reconditioning.value)} € (sur ${m.reconditioning.n} voitures), pas ${m.reconditioning.hypothesis} € : proposer d'ajuster le coût de base.`);
  }
  if (ok(m.sellDays) && m.sellDays.value > m.sellDays.hypothesis) {
    suggestions.push(`Tu mets ${m.sellDays.value} jours à revendre (sur ${m.sellDays.n} ventes) : l'assurance et l'immobilisation coûtent plus que prévu, viser des modèles plus rapides.`);
  }
  if (ok(m.marginGap) && Math.abs(m.marginGap.value) >= 200) {
    suggestions.push(`Ta marge encaissée s'écarte de ${m.marginGap.value > 0 ? '+' : ''}${m.marginGap.value} € de la marge prévue (médiane sur ${m.marginGap.n} ventes).`);
  }
  const bestOffer = Object.entries(byOffer)
    .filter(([, b]) => b.sent >= LEARNING.minSample)
    .sort((a, b) => b[1].won / b[1].sent - a[1].won / a[1].sent)[0];
  if (bestOffer) {
    suggestions.push(`Les offres à ${bestOffer[0]} sous le prix réussissent le mieux (${Math.round((bestOffer[1].won / bestOffer[1].sent) * 100)} % de visites ou d'accords sur ${bestOffer[1].sent} messages).`);
  }

  return { measures, byOffer, suggestions, sold: sold.length, minSample: LEARNING.minSample };
}
