import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SAMPLE_LISTINGS } from '../data/listings.js';
import { generateMandateMessage, generateNegotiationMessage, negotiationBounds, negotiationDiscount } from './messages.js';
import { buildOutreachPayload, eligibleStrategies } from './outreach.js';
import { REGISTRATION } from '../config/rules.js';
import { classifySegment, priceBand, registrationCost, scoreListing } from './scoring.js';

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

  it('ne compte JAMAIS le bonus options dans la marge (cote pro seule)', () => {
    const a = score({ description: 'Toit panoramique.' });
    assert.equal(a.finance.triggersBonus, 700);
    assert.equal(a.finance.grossMargin, 7000 - 6000);
    assert.equal(a.finance.netMargin, 7000 - 6000 - 550);
    assert.equal(a.finance.netMarginWithOptions, a.finance.netMargin + 700);
  });

  it('prix d’achat max PÉPITE = premier prix qui passe le seuil', () => {
    const a = score({ marketPrice: 9000 });
    const atMax = score({ marketPrice: 9000, price: a.finance.maxBuyPriceForPepite });
    const above = score({ marketPrice: 9000, price: a.finance.maxBuyPriceForPepite + 1 });
    assert.equal(atMax.status.key, 'PEPITE');
    assert.notEqual(above.status.key, 'PEPITE');
  });

  it('calcule le scénario négocié avec le coût réel des défauts', () => {
    const a = score({ description: 'Petite rayure sur la portière.' });
    assert.equal(a.finance.targetPrice, 6000 - 300);
    assert.equal(a.finance.negotiatedNetMargin, 7000 - 5700 - 550 - 90 - 304);
  });

  it('déduit la carte grise de la marge réelle (5 CV × 58 € + 13,76 €)', () => {
    const a = score({ price: 6000, marketPrice: 8000 });
    assert.equal(a.finance.registrationCost, 304);
    assert.equal(a.finance.realNetMargin, a.finance.netMargin - 304);
    assert.equal(a.finance.walkAwayPrice, 8000 - 550 - 304);
  });
});

describe('Carte grise', () => {
  it('chevaux fiscaux de l’annonce, sinon estimation par segment', () => {
    assert.deepEqual(registrationCost(base({ fiscalHp: 7 }), 'citadine', NOW), { cost: 420, cv: 7, estimatedCv: false, halved: false, status: 'particulier' });
    assert.equal(registrationCost(base(), 'compacte', NOW).cost, 362);
  });

  it('demi-tarif au-delà de 10 ans', () => {
    const old = registrationCost(base({ year: 2012 }), 'citadine', NOW);
    assert.equal(old.halved, true);
    assert.equal(old.cost, 159);
    assert.equal(registrationCost(base({ year: 2016 }), 'citadine', NOW).halved, false, '10 ans pas forcément atteints');
  });

  it('0 € en statut pro (déclaration d’achat + W garage)', () => {
    REGISTRATION.status = 'pro';
    try {
      assert.equal(registrationCost(base(), 'citadine', NOW).cost, 0);
      assert.equal(score({}).finance.realNetMargin, score({}).finance.netMargin);
    } finally {
      REGISTRATION.status = 'particulier';
    }
  });
});

describe('Statuts', () => {
  it('citadine : PÉPITE au-delà de 1 000 € de marge réelle', () => {
    assert.equal(score({ marketPrice: 7855 }).status.key, 'PEPITE'); // 1305 - 304 de carte grise = 1001
    assert.equal(score({ marketPrice: 7854 }).status.key, 'SURVEILLER'); // 1000
  });

  it('compacte/premium : PÉPITE au-delà de 2 000 €', () => {
    const golf = { brand: 'Volkswagen', model: 'Golf 7', engine: '1.6 TDI 115' };
    assert.equal(score({ ...golf, price: 10000, marketPrice: 12000 }).status.key, 'SURVEILLER'); // net 1450
    assert.equal(score({ ...golf, price: 10000, marketPrice: 13000 }).status.key, 'PEPITE'); // net 2450 - 362 = 2088
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

  it('ne refuse jamais une boîte à bain d’huile mentionnée (DQ381 / DSG381 / DQ250)', () => {
    const vag = { brand: 'Volkswagen', model: 'Golf 7', engine: '1.6 TDI 110' };
    for (const gearbox of ['DSG7 DQ381', 'DSG381', 'DSG6 DQ250', 'DSG7 à bain d’huile']) {
      const a = score({ ...vag, gearbox });
      assert.equal(a.blacklist.length, 0, gearbox);
      assert.equal(a.warnings.some((w) => w.includes('DSG')), false, gearbox);
    }
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
  it('classe les SUV à part (C3 Aircross n’est pas une C3)', () => {
    assert.equal(classifySegment(base({ brand: 'Peugeot', model: '2008' })), 'suv');
    assert.equal(classifySegment(base({ brand: 'Renault', model: 'Captur' })), 'suv');
    assert.equal(classifySegment(base({ brand: 'Citroen', model: 'C3 Aircross' })), 'suv');
    assert.equal(classifySegment(base({ brand: 'Citroen', model: 'C3' })), 'citadine');
    assert.equal(classifySegment(base({ brand: 'Peugeot', model: '208' })), 'citadine');
  });

  it('range chaque annonce dans sa tranche de budget', () => {
    assert.equal(priceBand(base({ price: 4500 })), 'a1');
    assert.equal(priceBand(base({ price: 6000 })), 'a2');
    assert.equal(priceBand(base({ price: 30000 })), 'a4');
    assert.equal(priceBand(base({ price: 2500 })), null);
    assert.equal(priceBand(base({ type: 'moto', price: 9000 })), 'm2');
  });

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

  it('commission = plus-value au-dessus du prix net vendeur', () => {
    const daysAgo15 = new Date(NOW.getTime() - 15 * DAY_MS).toISOString();
    const roomy = score({ price: 6000, marketPrice: 7500, publishedAt: daysAgo15 }).mandate;
    assert.equal(roomy?.ownerNet, 6000); // le vendeur touche son prix affiché
    assert.equal(roomy?.commission, 1500);
    const tight = score({ price: 7300, marketPrice: 7500, publishedAt: daysAgo15 }).mandate;
    assert.equal(tight?.ownerNet, 7000); // prix net abaissé pour garder la plus-value minimale
    assert.equal(tight?.commission, 500);
  });
});

describe('Messages', () => {
  it('vise ~10 % du prix, entre 800 € et 2 500 €, +5 % à J+15', () => {
    assert.equal(negotiationDiscount(score({ price: 6000, description: 'Très bon état.' })), 800, 'plancher 800 €');
    assert.equal(negotiationDiscount(score({ price: 12000, marketPrice: 15000 })), 1200, '10 %');
    assert.equal(negotiationDiscount(score({ price: 25000, marketPrice: 30000 })), 2500, 'plafond 2 500 €');
    const stale = new Date(NOW.getTime() - 20 * DAY_MS).toISOString();
    assert.equal(negotiationDiscount(score({ price: 12000, marketPrice: 15000, publishedAt: stale })), 1800, '10 % + 5 %');
    assert.equal(negotiationDiscount(score({ description: 'Rayure, pneus à prévoir, plaquettes à prévoir, jantes rayées, bosse.' })), 900, 'leviers plafonnés à 15 %');
    assert.deepEqual(negotiationBounds(3000), { low: 600, high: 600 }, 'petits prix : crédible');
  });

  it('génère des messages exploitables sur toute la démo', () => {
    for (const listing of SAMPLE_LISTINGS) {
      const a = scoreListing(listing, { now: NOW });
      const nego = generateNegotiationMessage(listing, a);
      assert.ok(nego.offer < listing.price && nego.text.includes('€'));
      assert.equal(nego.discount, listing.price - nego.offer, 'remise rapportée = écart réel');
      const { low, high } = negotiationBounds(listing.price);
      // Arrondi de l'offre au palier de 50 € : la remise peut tomber jusqu'à 50 € sous le plancher.
      if (!a.puretechCondition) assert.ok(nego.discount > low - 50 && nego.discount <= high, `${listing.id} : ${nego.discount}`);
      if (a.mandateEligible) assert.ok(generateMandateMessage(listing, a).text.includes('dépôt-vente'));
    }
  });
});

describe('Outreach autonome', () => {
  const old = new Date(NOW.getTime() - 20 * DAY_MS).toISOString();

  it('PÉPITE récente : négociation, offre ~10 % sous le prix, virement instantané', () => {
    const listing = base({ price: 6000, marketPrice: 8000, description: 'Rayure sur l’aile, pneus à prévoir.' });
    const payload = buildOutreachPayload(listing, scoreListing(listing, { now: NOW }), { now: NOW });
    assert.equal(payload.ok, true);
    if (!payload.ok) return;
    assert.equal(payload.strategy, 'negotiation');
    assert.ok(payload.negotiation);
    const discount = listing.price - payload.negotiation.offerPrice;
    assert.ok(discount >= 800 && discount <= 900, String(discount));
    assert.equal(payload.negotiation.payment, 'virement_instantane');
    assert.match(payload.message.body, /virement instantané/);
    assert.match(payload.message.body, /Rayure/);
    assert.equal(payload.mandate, null);
    assert.deepEqual(payload.alternatives, []);
  });

  it('J+15 non pépite : mandat avec commission sur la plus-value', () => {
    const listing = base({ price: 6800, marketPrice: 7500, publishedAt: old });
    const payload = buildOutreachPayload(listing, scoreListing(listing, { now: NOW }), { now: NOW });
    assert.equal(payload.ok, true);
    if (!payload.ok) return;
    assert.equal(payload.strategy, 'mandate');
    assert.equal(payload.mandate?.commissionModel, 'plus_value_au_dessus_du_prix_net');
    assert.match(payload.message.body, /plus-value/);
    assert.match(payload.message.body, /curieux/);
    assert.match(payload.message.body, /avance/);
  });

  it('PÉPITE à J+15 : la stratégie la plus rentable gagne, l’autre est en alternative', () => {
    const listing = base({ price: 5000, marketPrice: 8000, publishedAt: old });
    const analysis = scoreListing(listing, { now: NOW });
    assert.deepEqual(eligibleStrategies(analysis).sort(), ['mandate', 'negotiation']);
    const payload = buildOutreachPayload(listing, analysis, { now: NOW });
    assert.equal(payload.ok, true);
    if (!payload.ok) return;
    const best = analysis.finance.negotiatedNetMargin > (analysis.mandate?.totalRevenue ?? 0) ? 'negotiation' : 'mandate';
    assert.equal(payload.strategy, best);
    assert.equal(payload.alternatives.length, 1);
    const forced = buildOutreachPayload(listing, analysis, { now: NOW, strategy: 'mandate' });
    assert.equal(forced.ok && forced.strategy, 'mandate');
  });

  it('refuse les annonces blacklistées ou sans intérêt', () => {
    const blacklisted = base({ engine: '1.2 TCe 120', year: 2015, marketPrice: 12000, publishedAt: old });
    const r1 = buildOutreachPayload(blacklisted, scoreListing(blacklisted, { now: NOW }));
    assert.equal(r1.ok, false);
    const meh = base({ price: 6500, marketPrice: 7000 });
    const r2 = buildOutreachPayload(meh, scoreListing(meh, { now: NOW }));
    assert.equal(r2.ok, false);
    assert.equal(!r2.ok && r2.error, 'not_eligible');
  });

  it('produit un JSON sérialisable et stable pour Make.com', () => {
    for (const listing of SAMPLE_LISTINGS) {
      const payload = buildOutreachPayload(listing, scoreListing(listing, { now: NOW }), { now: NOW });
      const roundTrip = JSON.parse(JSON.stringify(payload));
      assert.deepEqual(roundTrip, payload);
      if (payload.ok) {
        for (const key of ['event', 'version', 'strategy', 'listing', 'scoring', 'message']) assert.ok(key in payload, key);
        assert.ok(payload.message.subject && payload.message.body.length > 100);
      }
    }
  });
});

describe('Campagne / ville', () => {
  it('campagne à plus de 30 km de toute grande ville, bonus de score', () => {
    const city = score({ lat: 44.84, lng: -0.58, marketPrice: 8000 }); // Bordeaux
    const rural = score({ lat: 44.43, lng: -0.21, marketPrice: 8000 }); // Bazas
    assert.equal(city.areaType, 'ville');
    assert.equal(rural.areaType, 'campagne');
    assert.equal(rural.nearestCity, 'Bordeaux');
    assert.ok(rural.score > city.score);
    assert.equal(score({}).areaType, null, 'sans GPS : inconnu');
  });
});
