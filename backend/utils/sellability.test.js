import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { estimateMarketPrice } from '../pipeline/market.js';
import { colorOf, sellability, trimOf } from './sellability.js';

const base = { type: 'auto', brand: 'Volkswagen', model: 'Golf', year: 2016, mileage: 120000, price: 9000, marketPrice: 0, publishedAt: new Date().toISOString() };

describe('Vendabilité', () => {
  it('reconnaît le niveau de finition, le plus haut d’abord', () => {
    assert.deepEqual(trimOf({ ...base, title: 'Golf 7 1.6 TDI Trendline' }), { tier: 'entree', name: 'trendline' });
    assert.equal(trimOf({ ...base, title: 'Golf 7 Confortline' })?.tier, 'milieu');
    assert.equal(trimOf({ ...base, title: 'Golf 7 Carat Exclusive' })?.tier, 'haut');
    assert.equal(trimOf({ ...base, brand: 'Mini', title: 'Mini Cooper S Chili' })?.name, 'cooper s');
    assert.equal(trimOf({ ...base, brand: 'Peugeot', title: '208 GT Line' })?.name, 'gt line');
    assert.equal(trimOf({ ...base, title: 'Golf 7 GTI' })?.tier, 'haut');
    assert.equal(trimOf({ ...base, title: 'Golf 7 1.6 TDI' }), null);
  });

  it('couleur : attribut, sinon « couleur : » dans l’annonce', () => {
    assert.equal(colorOf({ color: 'Gris' }), 'gris');
    assert.equal(colorOf({ title: 'Golf', description: 'Couleur : jaune citron, très propre' }), 'jaune citron');
  });

  it('entrée de gamme + couleur rare + annonce qui traîne = risque de traîner', () => {
    const s = sellability(
      { ...base, title: 'Golf Trendline', color: 'Jaune', marketStats: { low: 0, high: 0, comparables: 5, daysOnMarket: 20 } },
      { triggers: [], daysOnline: 60 },
    );
    assert.equal(s.level, 'difficile');
    assert.ok(s.points.some((p) => /entrée de gamme/.test(p.label)));
    assert.ok(s.points.some((p) => /60 j contre ~20 j/.test(p.label)));
  });

  it('finition intermédiaire + option + couleur neutre = devrait partir facilement', () => {
    const s = sellability({ ...base, title: 'Golf Confortline', color: 'Noir' }, { triggers: [{ label: 'Toit ouvrant / panoramique' }], daysOnline: 5 });
    assert.equal(s.level, 'facile');
  });

  it('comparables : même niveau de finition quand il est connu des deux côtés', () => {
    const mk = (i, title, price) => ({ ...base, id: `c${i}`, title, price });
    const pool = [
      ...[8000, 8200, 8400, 8600].map((p, i) => mk(i, 'Golf Trendline', p)),
      ...[11000, 11500, 12000, 12500].map((p, i) => mk(10 + i, 'Golf Carat', p)),
    ];
    const est = estimateMarketPrice({ ...base, id: 'x', title: 'Golf Trendline' }, pool, 4);
    assert.ok(est);
    assert.ok(est.price < 9000, `prix ${est.price} calculé sur les Trendline seulement`);
    assert.ok(est.criteria.some((c) => /même niveau de finition \(entrée de gamme\)/.test(c)));
  });
});
