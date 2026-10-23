import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUSINESS } from '../config/rules.js';
import { applyAction, createDeal } from './crm.js';
import { learnFromDeals } from './learning.js';
import { scoreListing } from './scoring.js';

BUSINESS.status = 'particulier';

const NOW = new Date('2026-10-22T12:00:00Z');
const at = (days) => new Date(NOW.getTime() + days * 86_400_000);
const base = (id, price, marketPrice) => ({
  id: `lbc-${id}`,
  type: 'auto',
  title: 'Renault Clio 4 1.5 dCi 90',
  brand: 'Renault',
  model: 'Clio 4',
  year: 2017,
  mileage: 90000,
  price,
  marketPrice,
  publishedAt: NOW.toISOString(),
});

const run = (deal, steps) =>
  steps.reduce((d, [action, when]) => {
    const r = applyAction(d, action, when);
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    return r.ok ? r.deal : d;
  }, deal);

/** Un cycle complet : offre, accord, achat, mise en vente, vente. */
function soldDeal(id, { asking = 8000, market = 10000, offer = 7200, bought = 7300, listed = 9900, sold = 9400, extra = 0, days = 20 } = {}) {
  const listing = base(id, asking, market);
  const deal = createDeal({ kind: 'achat', listing, analysis: scoreListing(listing, { now: NOW }), offerPrice: offer, now: NOW });
  return run(deal, [
    [{ type: 'outbound', text: 'Offre', offer }, at(0)],
    [{ type: 'inbound', text: "D'accord, passez demain" }, at(1)],
    [{ type: 'stage', stage: 'achete', amount: bought }, at(2)],
    [{ type: 'update', numbers: { extraCosts: extra } }, at(2)],
    [{ type: 'stage', stage: 'en_vente', amount: listed }, at(5)],
    [{ type: 'stage', stage: 'vendu', amount: sold }, at(2 + days)],
  ]);
}

describe('Apprentissage', () => {
  it('mesure négo acheteurs, remise obtenue, justesse de la cote, frais et délai réels', () => {
    const deals = [soldDeal(1), soldDeal(2, { sold: 9500 }), soldDeal(3, { sold: 9300, extra: 200, days: 30 })];
    const { measures, suggestions } = learnFromDeals(deals);
    assert.equal(measures.buyerDiscount.n, 3);
    assert.equal(measures.buyerDiscount.value, 5.1); // (9900 - 9400) / 9900
    assert.equal(measures.purchaseDiscount.value, 8.8); // (8000 - 7300) / 8000
    assert.equal(measures.resaleError.value, -6); // 9400 vs 10 000
    assert.equal(measures.sellDays.value, 20);
    assert.equal(measures.replyRate.value, 100);
    assert.ok(suggestions.some((s) => s.includes('moins cher que le prix marché')));
  });

  it('ne propose rien sous 3 deals, mesure les offres qui marchent', () => {
    const one = learnFromDeals([soldDeal(1)]);
    assert.equal(one.measures.buyerDiscount.n, 1);
    assert.equal(one.suggestions.length, 0);
    const many = learnFromDeals([soldDeal(1), soldDeal(2), soldDeal(3)]);
    assert.equal(many.byOffer['8 à 12 %'].sent, 3); // (8000 - 7200) / 8000 = 10 %
    assert.equal(many.byOffer['8 à 12 %'].won, 3);
  });
});
