import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SAMPLE_LISTINGS } from '../data/listings.js';
import { generateMandateMessage, generateNegotiationMessage, negotiationDiscount } from './messages.js';
import { classifySegment, scoreListing } from './scoring.js';

const NOW = new Date('2026-10-22T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** Annonce de base saine, surchargée par chaque test. */
const base = (overrides = {}) => ({
  id: 't',
  type: 'auto',
  title: 'Renault Clio 4 1.5 dCi 90',
  brand: 'Renault',
  model: 'Clio 4',
  engine: '1.5 dCi 90',
  gearbox: 'Manuelle',
  year: 2017,
  mileage: 90000,
  doors: 5,
  price: 6000,
  marketPrice: 7000,
  description: 'Très bon état.',
  publishedAt: new Date(NOW.getTime() - 3 * DAY_MS).toISOString(),
  ...overrides,
});

const score = (overrides) => scoreListing(base(overrides), { now: NOW });

describe('Formule financière', () => {
  it('applique Marge Nette = Cote - Prix - 350 - 200', () => {
    const a = score({ price: 6000, marketPrice: 8000 });
    assert.equal(a.finance.grossMargin, 2000);
    assert.equal(a.finance.netMargin, 2000 - 350 - 200);
  });

  it('ajoute le bonus des options déclencheurs à la valeur de revente', () => {
    const a = score({ description: 'Toit panoramique.' });
    assert.equal(a.finance.triggersBonus, 700);
    assert.equal(a.finance.resaleValue, 7700);
  });

  it('calcule le scénario négocié avec le coût réel des défauts', () => {
    const a = score({ description: 'Petite rayure sur la portière.' });
    assert.equal(a.finance.targetPrice, 6000 - 300);
    assert.equal(a.finance.negotiatedNetMargin, 7000 - 5700 - 550 - 90);
  });
});

describe('Statuts', () => {
  it('citadine : PÉPITE au-delà de 1 000 € de marge nette', () => {
    assert.equal(score({ marketPrice: 7551 }).status.key, 'PEPITE'); // net 1001
    assert.equal(score({ marketPrice: 7550 }).status.key, 'SURVEILLER'); // net 1000
  });

  it('compacte/premium : PÉPITE au-delà de 2 000 €', () => {
    const golf = { brand: 'Volkswagen', model: 'Golf 7', engine: '1.6 TDI 115' };
    assert.equal(score({ ...golf, price: 10000, marketPrice: 12000 }).status.key, 'SURVEILLER'); // net 1450
    assert.equal(score({ ...golf, price: 10000, marketPrice: 12600 }).status.key, 'PEPITE'); // net 2050
  });

  it('REFUSE quand aucune marge, même négociée', () => {
    assert.equal(score({ price: 7000, marketPrice: 7000 }).status.key, 'REFUSE');
  });
});

describe('Blacklist mécanique', () => {
  it('refuse le 1.2 TCe H5Ft 2012-2018 (score 0)', () => {
    const a = score({ engine: '1.2 TCe 120', year: 2015, marketPrice: 12000 });
    assert.equal(a.status.key, 'REFUSE');
    assert.equal(a.score, 0);
    assert.ok(a.blacklist.some((b) => b.id === 'renault-h5ft'));
  });

  it("n'applique pas la règle TCe hors 2012-2018 ni sur le 1.0 TCe", () => {
    assert.equal(score({ engine: '1.2 TCe 120', year: 2019 }).blacklist.length, 0);
    assert.equal(score({ engine: '1.0 TCe 90', year: 2016 }).blacklist.length, 0);
  });

  it('refuse le PureTech avant 2023 sans historique de courroie', () => {
    const a = score({ brand: 'Peugeot', model: '208', engine: '1.2 PureTech 82', year: 2019 });
    assert.ok(a.blacklist.some((b) => b.id === 'psa-puretech'));
  });

  it('accepte le PureTech avec facture < 6 mois, sous condition de -30 %', () => {
    const puretech = { brand: 'Peugeot', model: '208', engine: '1.2 PureTech 100', year: 2020, marketPrice: 10000 };
    const desc = 'Courroie et crépine remplacées il y a 4 mois, facture.';
    const ok = score({ ...puretech, price: 6900, description: desc });
    assert.equal(ok.blacklist.length, 0);
    assert.equal(ok.puretechCondition?.maxBuyPrice, 7000);
    assert.equal(ok.status.key, 'PEPITE');
    const tooExpensive = score({ ...puretech, price: 7500, description: desc });
    assert.equal(tooExpensive.status.key, 'SURVEILLER');
    const oldBelt = score({ ...puretech, price: 6900, description: 'Courroie changée il y a 14 mois.' });
    assert.ok(oldBelt.blacklist.some((b) => b.id === 'psa-puretech'));
  });

  it('refuse la DSG7 à sec DQ200 sur petit moteur mais pas la DQ381 (2.0)', () => {
    const vag = { brand: 'Volkswagen', model: 'Polo', gearbox: 'DSG7' };
    assert.ok(score({ ...vag, engine: '1.0 TSI 95' }).blacklist.some((b) => b.id === 'vag-dq200'));
    assert.equal(score({ ...vag, model: 'Golf 7', engine: '2.0 TSI 245' }).blacklist.length, 0);
    assert.ok(score({ ...vag, gearbox: 'Auto', engine: '2.0 TDI', description: 'boîte DQ200' }).blacklist.length > 0);
  });

  it('refuse les mots-clés rédhibitoires', () => {
    for (const description of ['Voyant moteur allumé.', 'Boîte HS.', "Vendue dans l'état sans CT.", 'Contre-visite à faire.']) {
      assert.equal(score({ description }).status.key, 'REFUSE', description);
    }
  });

  it('ignore les mots-clés niés', () => {
    const a = score({ description: 'Aucune rayure, pas de voyant moteur, jamais eu de contre-visite.' });
    assert.equal(a.blacklist.length, 0);
    assert.equal(a.levers.length, 0);
  });
});

describe('Options déclencheurs', () => {
  it('détecte Tesla Shanghai (VIN LRW) + LFP + Ryzen', () => {
    const a = score({ brand: 'Tesla', model: 'Model 3', engine: 'Électrique', vin: 'LRW3E7EK1NC512345', description: 'Batterie LFP, processeur Ryzen.', price: 25000, marketPrice: 28000 });
    assert.deepEqual(a.triggers.map((t) => t.id).sort(), ['tesla-lfp', 'tesla-ryzen', 'tesla-shanghai']);
    assert.equal(a.finance.triggersBonus, 1000);
    assert.equal(a.segment, 'premium');
  });

  it("n'accorde pas de bonus Shanghai à un VIN Fremont/Berlin", () => {
    const a = score({ brand: 'Tesla', model: 'Model Y', vin: 'XP7YGCEK5NB012345', description: 'LFP Ryzen' });
    assert.equal(a.triggers.length, 0);
  });

  it('moto : MTT1, Akrapovic, valises, shifter', () => {
    const a = score({ type: 'moto', brand: 'BMW', model: 'R 1250 GS', licenseCategory: 'MTT1', description: 'Valises alu BMW, ligne Akrapovic, Shifter Pro.', price: 12000, marketPrice: 13000 });
    const ids = a.triggers.map((t) => t.id);
    for (const id of ['valises', 'akrapovic', 'shifter', 'a2']) assert.ok(ids.includes(id), id);
  });

  it('S-Line ne matche pas "ABS line"', () => {
    assert.equal(score({ description: 'ABS line assist' }).triggers.length, 0);
  });
});

describe('Segments & Mandat', () => {
  it('classe les segments', () => {
    assert.equal(classifySegment(base()), 'citadine');
    assert.equal(classifySegment(base({ brand: 'Volkswagen', model: 'Golf 7', version: 'GTI' })), 'premium');
    assert.equal(classifySegment(base({ brand: 'Peugeot', model: '308' })), 'compacte');
  });

  it('cible le mandat à partir de J+15 et calcule les upsells', () => {
    const fresh = score({ publishedAt: new Date(NOW.getTime() - 14 * DAY_MS).toISOString() });
    assert.equal(fresh.mandateEligible, false);
    const old = score({ publishedAt: new Date(NOW.getTime() - 15 * DAY_MS).toISOString() });
    assert.equal(old.mandateEligible, true);
    assert.equal(old.mandate?.upsellMargin, 70 + 100);
    assert.equal(old.mandate?.cashRequired, 0);
  });
});

describe('Messages', () => {
  it('borne la remise de négociation entre 500 € et 1 000 €', () => {
    assert.equal(negotiationDiscount(score({ description: 'Très bon état.' })), 500);
    assert.equal(negotiationDiscount(score({ description: 'Rayure, pneus à prévoir, plaquettes à prévoir, jantes rayées, bosse.' })), 1000);
  });

  it('génère des messages exploitables sur toute la démo', () => {
    for (const listing of SAMPLE_LISTINGS) {
      const a = scoreListing(listing, { now: NOW });
      const nego = generateNegotiationMessage(listing, a);
      assert.ok(nego.offer < listing.price && nego.text.includes('€'));
      if (a.mandateEligible) assert.ok(generateMandateMessage(listing, a).text.includes('dépôt-vente'));
    }
  });
});
