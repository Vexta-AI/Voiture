import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buyerPitch, matchBuyers, parseBuyerInput } from './matching.js';

const clio = {
  id: 'lbc-1',
  type: 'auto',
  title: 'Renault Clio 4 1.5 dCi 90',
  brand: 'Renault',
  model: 'Clio 4',
  gearbox: 'Manuelle',
  year: 2017,
  mileage: 90000,
  price: 6000,
  marketPrice: 8500,
  localMarket: { price: 8200 },
  publishedAt: '2026-10-20T00:00:00Z',
};
const buyer = (id, criteria) => ({ id, name: id, active: true, createdAt: '2026-10-01T00:00:00Z', criteria });

describe('Réseau d’acheteurs', () => {
  it('trouve les acheteurs dont les critères collent, au prix de revente chez toi', () => {
    const buyers = [
      buyer('karim', { models: ['clio'], budgetMax: 9000, fuel: 'diesel' }),
      buyer('lea', { models: ['clio'], budgetMax: 8000 }), // budget trop court pour 8 200 €
      buyer('tom', { models: ['clio'], budgetMax: 9000, fuel: 'essence' }), // mauvais carburant
      buyer('sam', { models: ['208'], budgetMax: 12000 }), // mauvais modèle
      buyer('ana', { models: ['clio'], budgetMax: 8500, mileageMax: 100000, yearMin: 2016, gearbox: 'manuelle' }),
    ];
    const found = matchBuyers(clio, buyers);
    assert.deepEqual(found.map((f) => f.buyer.id), ['ana', 'karim']);
    assert.equal(found[0].resalePrice, 8200);
    assert.match(buyerPitch(clio, found[0].buyer), /autour de 8\s190 €/);
  });

  it('ignore un acheteur désactivé et valide la saisie', () => {
    assert.equal(matchBuyers(clio, [{ ...buyer('x', { budgetMax: 9000 }), active: false }]).length, 0);
    assert.deepEqual(parseBuyerInput({ name: 'Karim', criteria: { models: 'clio, 208', budgetMax: '9000', fuel: 'Diesel' } }), {
      ok: true,
      name: 'Karim',
      phone: undefined,
      email: undefined,
      notes: undefined,
      criteria: { type: 'auto', models: ['clio', '208'], budgetMax: 9000, budgetMin: undefined, yearMin: undefined, mileageMax: undefined, fuel: 'diesel', gearbox: undefined },
    });
    assert.equal(parseBuyerInput({ name: 'X', criteria: {} }).ok, false);
  });
});
