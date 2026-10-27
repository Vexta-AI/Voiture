import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateQualificationMessage } from './messages.js';
import { engineSheet, maintenanceSummary } from './maintenance.js';
import { scoreListing } from './scoring.js';

const clio = { id: 'c', type: 'auto', brand: 'Renault', model: 'Clio', title: 'Clio IV 1.5 dCi 90 Energy', fuel: 'Diesel', year: 2016, mileage: 150000, price: 6000, marketPrice: 9000, publishedAt: new Date().toISOString(), zip: '33000' };

describe('Fiche entretien moteur', () => {
  it('reconnaît le moteur depuis la marque, le carburant, l’année et le titre', () => {
    assert.equal(engineSheet(clio)?.distribution?.type, 'courroie');
    assert.equal(engineSheet({ ...clio, fuel: 'Essence' }), null);
    assert.equal(engineSheet({ ...clio, title: 'Clio IV Estate' }), null);
  });

  it('km au-delà du premier palier sans facture : distribution à demander', () => {
    const m = maintenanceSummary(clio, 'clio iv 1.5 dci 90 energy', false);
    assert.equal(m?.beltDue, true);
    assert.equal(maintenanceSummary(clio, 'clio iv 1.5 dci 90 energy', true)?.beltDue, false);
    assert.match(m?.line ?? '', /courroie/);
  });

  it('information seulement : le score et la marge ne changent pas', () => {
    const a = scoreListing(clio);
    const b = scoreListing({ ...clio, title: 'Clio IV Estate' });
    assert.ok(a.maintenance);
    assert.equal(a.finance.realNetMargin, b.finance.realNetMargin);
    assert.ok(a.insights.some((i) => i.startsWith('🔧')));
  });

  it('message au vendeur : questions propres au moteur à la place de la question générique', () => {
    const analysis = scoreListing(clio);
    const msg = generateQualificationMessage(clio, analysis);
    assert.ok(analysis.maintenance?.sellerQuestions.slice(0, 2).every((q) => msg.questions.includes(q)));
    assert.ok(!msg.questions.includes('La distribution a-t-elle déjà été faite ? Si oui, à quel kilométrage ?'));
  });
});
