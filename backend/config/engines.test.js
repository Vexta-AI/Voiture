import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_SHEETS } from './engines.js';
import { normalize } from '../utils/text.js';

const find = (l) =>
  ENGINE_SHEETS.find((e) =>
    e.match.some(
      (m) =>
        m.brands.includes(l.brand) &&
        (!m.fuel || m.fuel === l.fuel) &&
        (!m.yearFrom || l.year >= m.yearFrom) &&
        (!m.yearTo || l.year <= m.yearTo) &&
        m.text.test(normalize(l.title)),
    ),
  )?.id;

test('chaque fiche a un id, un label et un tableau match', () => {
  for (const e of ENGINE_SHEETS) {
    assert.equal(typeof e.id, 'string', JSON.stringify(e.label));
    assert.ok(e.id.length > 0);
    assert.equal(typeof e.label, 'string', e.id);
    assert.ok(Array.isArray(e.match) && e.match.length > 0, e.id);
    assert.ok(e.weakPoints.length <= 3, e.id);
    assert.ok(e.sellerQuestions.length <= 3, e.id);
  }
});

test('chaque match.text est une RegExp', () => {
  for (const e of ENGINE_SHEETS) {
    for (const m of e.match) assert.ok(m.text instanceof RegExp, e.id);
  }
});

test('ids uniques', () => {
  const ids = ENGINE_SHEETS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('annonces réalistes → fiche attendue', () => {
  const cases = [
    [{ brand: 'renault', fuel: 'diesel', year: 2016, title: 'Clio IV 1.5 dCi 90 Energy' }, 'renault-k9k-15dci'],
    [{ brand: 'peugeot', fuel: 'diesel', year: 2016, title: '208 1.6 BlueHDi 100' }, 'psa-dv6-16bluehdi'],
    [{ brand: 'peugeot', fuel: 'diesel', year: 2021, title: '208 1.5 BlueHDi 100' }, 'psa-dv5-15bluehdi'],
    [{ brand: 'volkswagen', fuel: 'diesel', year: 2015, title: 'Golf 7 1.6 TDI 110' }, 'vag-16tdi-cr'],
    [{ brand: 'vw', fuel: 'diesel', year: 2015, title: 'Golf 7 2.0 TDI 150' }, 'vag-20tdi-cr'],
    [{ brand: 'volkswagen', fuel: 'essence', year: 2011, title: 'Golf 6 1.4 TSI 122' }, 'vag-ea111-tsi'],
    [{ brand: 'volkswagen', fuel: 'essence', year: 2016, title: 'Golf 7 1.4 TSI 125' }, 'vag-ea211-tsi-mpi'],
    [{ brand: 'toyota', fuel: 'hybride', year: 2017, title: 'Yaris hybride 100h' }, 'toyota-hsd-15-hybrid'],
    [{ brand: 'renault', fuel: 'essence', year: 2021, title: 'Clio V TCe 90' }, 'renault-h4dt-10tce'],
    [{ brand: 'renault', fuel: 'essence', year: 2016, title: 'Clio 4 TCe 90 Energy' }, 'renault-h4bt-09tce'],
    [{ brand: 'dacia', fuel: 'essence', year: 2019, title: 'Sandero 1.0 SCe 75' }, 'renault-h4d-10sce'],
    [{ brand: 'mercedesbenz', fuel: 'diesel', year: 2016, title: 'Classe A 180 CDI' }, 'renault-k9k-15dci'],
    [{ brand: 'mercedes', fuel: 'diesel', year: 2020, title: 'Classe A 200 d' }, 'mb-om654'],
    [{ brand: 'tesla', fuel: 'electrique', year: 2021, title: 'Model 3 Grande Autonomie' }, 'tesla-model3-modely'],
    [{ brand: 'renault', fuel: 'essence', year: 2015, title: 'Clio 4 Estate' }, undefined],
  ];
  for (const [listing, expected] of cases) assert.equal(find(listing), expected, listing.title);
});
