import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  actionQueue,
  analyzeReply,
  applyAction,
  classifyOffer,
  createBuyerDeal,
  createDeal,
  crmStats,
  dailyDigest,
  dealEconomics,
  extractAmounts,
  leadHeat,
  nextAction,
} from './crm.js';
import { scoreListing } from './scoring.js';
import { BUSINESS } from '../config/rules.js';

// Formule de base testée hors cotisations micro (testées à part).
BUSINESS.status = 'particulier';

const NOW = new Date('2026-10-22T12:00:00Z');
const H = 3_600_000;
const at = (hoursFromNow) => new Date(NOW.getTime() + hoursFromNow * H);

const listing = {
  id: 'lbc-1',
  type: 'auto',
  title: 'Renault Clio 4 1.5 dCi 90',
  brand: 'Renault',
  model: 'Clio 4',
  engine: '1.5 dCi 90',
  year: 2017,
  mileage: 90000,
  doors: 5,
  price: 7000,
  marketPrice: 9500,
  publishedAt: new Date(NOW.getTime() - 2 * 24 * H).toISOString(),
  url: 'https://www.leboncoin.fr/ad/voitures/1',
};

/** Deal achat : cote 9 500, max PÉPITE ≈ 7 645, plafond ≈ 8 646. */
const newDeal = (now = NOW) => createDeal({ kind: 'achat', listing, analysis: scoreListing(listing, { now }), message: { subject: 's', body: 'Bonjour…' }, offerPrice: 6200, source: 'radar', now });

const run = (deal, ...steps) =>
  steps.reduce((d, [action, when]) => {
    const r = applyAction(d, action, when ?? NOW);
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    return r.ok ? r.deal : d;
  }, deal);

describe('Lecture des réponses', () => {
  it('extrait les montants sans confondre années, km et téléphone', () => {
    assert.deepEqual(extractAmounts('Je peux descendre à 6 800 € pas moins'), [6800]);
    assert.deepEqual(extractAmounts('ok pour 6,5k', 7000), [6500]);
    assert.deepEqual(extractAmounts('elle est de 2017, 90000 km, appelez le 0612345678', 7000), []);
    assert.deepEqual(extractAmounts('6500 euros et elle est à vous', 7000), [6500]);
  });

  it('reconnaît accord, contre-offre, question, refus, vendu', () => {
    assert.equal(analyzeReply("D'accord, vous pouvez passer samedi ?").intent, 'accord');
    assert.deepEqual(analyzeReply('Je descends à 6800 minimum', { reference: 7000 }), { intent: 'contre_offre', amount: 6800 });
    assert.equal(analyzeReply('Pas en dessous de 6900 €', { reference: 7000 }).intent, 'contre_offre');
    assert.equal(analyzeReply('Vous êtes professionnel ?').intent, 'question');
    assert.equal(analyzeReply('Vous êtes un garage ? Comment ça marche ?').intent, 'question');
    assert.equal(analyzeReply('Ça marche, vous passez quand ?').intent, 'accord');
    assert.equal(analyzeReply("Le prix est ferme, pas d'accord").intent, 'refus');
    assert.equal(analyzeReply('Désolé elle est déjà vendue').intent, 'vendu');
  });

  it('juge une contre-offre selon tes prix', () => {
    const deal = newDeal();
    assert.equal(classifyOffer(deal, deal.numbers.maxBuyPrice ?? 0), 'ok');
    assert.equal(classifyOffer(deal, (deal.numbers.maxBuyPrice ?? 0) + 300), 'jouable');
    assert.equal(classifyOffer(deal, (deal.numbers.walkAwayPrice ?? 0) + 1), 'haute');
  });
});

describe('Pipeline & chaleur', () => {
  it('nouveau lead radar : premier message à envoyer', () => {
    const deal = newDeal();
    const action = nextAction(deal, NOW);
    assert.equal(action.kind, 'contacter');
    assert.equal(action.message, 'Bonjour…');
    assert.equal(leadHeat(deal, NOW).level, 'froid');
  });

  it('vendeur d’accord sur un prix dans tes clous = lead CHAUD avec réponse prête', () => {
    const deal = run(newDeal(), [{ type: 'outbound', text: 'Offre 6 200 €' }, at(-20)], [{ type: 'inbound', text: 'Ok pour 6900, vous passez quand ?' }, at(-1)]);
    assert.equal(deal.stage, 'discussion');
    const heat = leadHeat(deal, NOW);
    assert.equal(heat.level, 'chaud', JSON.stringify(heat));
    const action = nextAction(deal, NOW);
    assert.equal(action.kind, 'repondre');
    assert.match(action.message ?? '', /D’accord pour 6\s900 €/);
    assert.equal(action.offer, 6900);
  });

  it('contre-offre trop haute : on coupe la poire en deux sans dépasser le plafond', () => {
    const deal0 = newDeal();
    const ask = (deal0.numbers.maxBuyPrice ?? 0) + 600;
    const deal = run(deal0, [{ type: 'outbound', text: 'Offre' }, at(-10)], [{ type: 'inbound', text: `Je peux faire ${ask} €` }, at(-2)]);
    const action = nextAction(deal, NOW);
    assert.ok((action.offer ?? 0) > 6200 && (action.offer ?? 0) <= (deal.numbers.walkAwayPrice ?? 0), String(action.offer));
    assert.match(action.message ?? '', /Je peux monter à/);
  });

  it('relances à J+2 et J+5, puis clôture après 9 jours de silence', () => {
    const sent = run(newDeal(), [{ type: 'outbound', text: 'Offre' }, at(-24)]);
    assert.equal(nextAction(sent, NOW).kind, 'attendre');
    assert.equal(nextAction(sent, at(25)).kind, 'relancer');
    const relance1 = run(sent, [{ type: 'outbound', text: 'Relance 1' }, at(25)]);
    assert.equal(nextAction(relance1, at(30)).kind, 'attendre');
    assert.equal(nextAction(relance1, at(25 + 5 * 24)).kind, 'relancer');
    const relance2 = run(relance1, [{ type: 'outbound', text: 'Relance 2' }, at(25 + 5 * 24)]);
    assert.equal(nextAction(relance2, at(9 * 24)).kind, 'cloturer');
  });

  it('vendu ailleurs : clôture proposée', () => {
    const deal = run(newDeal(), [{ type: 'outbound', text: 'Offre' }, at(-10)], [{ type: 'inbound', text: 'Désolé, déjà vendue' }, at(-1)]);
    assert.equal(nextAction(deal, NOW).kind, 'cloturer');
    assert.equal(leadHeat(deal, NOW).level, 'froid');
  });

  it('visite : rappel la veille, puis achat -> carte grise -> préparation -> annonce de revente', () => {
    let deal = run(newDeal(), [{ type: 'outbound', text: 'Offre' }, at(-48)], [{ type: 'inbound', text: "D'accord" }, at(-30)], [{ type: 'outbound', text: 'Samedi 10 h ?' }, at(-29)], [{ type: 'update', rdvAt: at(12).toISOString() }]);
    assert.equal(deal.stage, 'rdv');
    assert.equal(nextAction(deal, NOW).kind, 'visite');
    assert.ok(nextAction(deal, NOW).priority >= 90, 'visite dans moins de 24 h');
    deal = run(deal, [{ type: 'stage', stage: 'achete', amount: 6700 }, at(14)]);
    assert.equal(nextAction(deal, at(15)).kind, 'carte_grise');
    deal = run(deal, [{ type: 'doc', id: 'immat', done: true }]);
    assert.equal(nextAction(deal, at(15)).kind, 'preparer');
    deal = run(deal, [{ type: 'stage', stage: 'en_vente' }]);
    const publish = nextAction(deal, at(16));
    assert.equal(publish.kind, 'publier');
    assert.equal(publish.offer, 9490);
    deal = run(deal, [{ type: 'stage', stage: 'vendu', amount: 9300 }, at(200)]);
    const money = dealEconomics(deal);
    assert.equal(money.realized, 9300 - 6700 - 500 - 304 - 260); // remise en état, carte grise, assurance + annonce
    assert.equal(nextAction(deal, at(201)).kind, 'aucune');
  });

  it('acheteur : offre au-dessus du plancher acceptée, en dessous contre-proposée', () => {
    const vehicle = run(newDeal(), [{ type: 'stage', stage: 'achete', amount: 6700 }], [{ type: 'stage', stage: 'en_vente', amount: 9490 }]);
    const buyer = createBuyerDeal({ vehicleDeal: vehicle, contact: { name: 'Karim' }, now: NOW, suffix: 'k' });
    assert.equal(buyer.numbers.floorPrice, 9050);
    const ok = run(buyer, [{ type: 'inbound', text: 'Je vous en propose 9100 €' }]);
    assert.match(nextAction(ok, NOW).message ?? '', /c’est d’accord pour 9\s100 €/);
    assert.equal(leadHeat(ok, NOW).level, 'chaud');
    const low = run(buyer, [{ type: 'inbound', text: 'Je vous en propose 7500 €' }]);
    assert.match(nextAction(low, NOW).message ?? '', /trop bas/);
  });

  it('refuse une action invalide sans rien casser', () => {
    const deal = newDeal();
    assert.equal(applyAction(deal, { type: 'stage', stage: 'nimporte' }, NOW).ok, false);
    assert.equal(applyAction(deal, { type: 'inbound', text: '  ' }, NOW).ok, false);
    assert.equal(applyAction(deal, { type: 'doc', id: 'inconnu', done: true }, NOW).ok, false);
  });
});

describe('Vue d’ensemble', () => {
  it('file d’attente : les leads chauds passent en tête, le résumé Telegram les liste', () => {
    const cold = newDeal();
    const hot = run({ ...newDeal(), id: 'achat-hot', vehicle: { ...newDeal().vehicle, title: 'Clio chaude' } }, [{ type: 'outbound', text: 'Offre' }, at(-5)], [{ type: 'inbound', text: 'Ok pour 6900' }, at(-1)]);
    const queue = actionQueue([cold, hot], NOW);
    assert.equal(queue[0].deal.id, 'achat-hot');
    const stats = crmStats([cold, hot], NOW);
    assert.equal(stats.hot, 1);
    assert.equal(stats.toReply, 1);
    assert.equal(stats.toContact, 1);
    const digest = dailyDigest([cold, hot], { now: NOW, appUrl: 'https://x.app' });
    assert.match(digest ?? '', /🔥 Clio chaude/);
    assert.match(digest ?? '', /x\.app\/crm/);
    assert.equal(dailyDigest([], { now: NOW }), null);
  });
});
