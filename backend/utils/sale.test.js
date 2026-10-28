import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { saleFile, salePricing } from './sale.js';

const clio = {
  brand: 'Renault',
  model: 'Clio 4',
  version: '1.5 dCi 90',
  year: 2014,
  firstRegistration: '2014-01-16',
  mileage: 98950,
  fuel: 'Diesel',
  fiscalHp: 4,
  co2: 90,
  maintenance: [{ label: 'Distribution faite', km: 92000, date: '2024', proof: 'etiquette' }],
  bodywork: { repaint: true, reason: 'des rayures (vandalisme)', invoice: true },
  ctDate: '2026-04-07',
  coOwners: 2,
};
const market = { price: 7000, low: 6500, high: 7800, comparables: 6 };
const NOW = new Date('2026-10-28T12:00:00Z');

describe('Dossier de vente', () => {
  it('prix : négo de 5 % au-dessus de la cote, ou prix ferme à la cote', () => {
    assert.deepEqual(salePricing(market), { market: 7000, listed: 7400, floor: 6500, comparables: 6, range: [6500, 7800] });
    assert.equal(salePricing(market, true)?.listed, 7000);
    assert.equal(salePricing(null), null);
  });

  it('annonce honnête : la preuve de chaque entretien est dite, la repeinte aussi', () => {
    const f = saleFile(clio, { market, now: NOW });
    assert.match(f.text, /Distribution faite à 92.000 km en 2024 \(étiquette sur le moteur, sans facture\)/);
    assert.match(f.text, /repeinte par un professionnel suite à des rayures \(vandalisme\), facture/);
    assert.ok(f.warnings.some((w) => w.startsWith('Distribution sans facture')));
    assert.ok(f.replies.some((r) => r.q === 'Elle a été accidentée ?'));
  });

  it('CT de plus de 6 mois : à refaire ; deux titulaires : les deux signent', () => {
    const f = saleFile(clio, { market, now: NOW });
    assert.ok(f.checklist[0].startsWith('Faire le contrôle technique'));
    assert.ok(f.checklist.some((c) => c.includes('chaque titulaire')));
    assert.ok(!f.title.includes('CT OK'));
  });

  it('prix ferme : annonce et réponse « dernier prix » sans négociation', () => {
    const f = saleFile({ ...clio, firm: true }, { market, now: NOW });
    assert.match(f.text, /Prix ferme, non négociable/);
    assert.match(f.text, /Prix : 7.000 €/);
    assert.match(f.replies.find((r) => r.q === 'Dernier prix ?')?.a ?? '', /ferme/);
  });
});
