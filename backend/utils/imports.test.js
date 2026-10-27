import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectImport, importWarning } from './imports.js';
import { scoreListing } from './scoring.js';

const corvette = {
  title: 'CHEVROLET CORVETTE C6 – 6.0 V8 LS2 – 404 CH – BVA – 73.278 KM – 2005',
  description:
    "Avant toute acquisition, nous procéderons à nos vérifications habituelles : VIN, CARFAX, cohérence du kilométrage. 🇫🇷 HOMOLOGATION OBLIGATOIRE Cette Chevrolet Corvette étant un modèle d'origine nord-américaine, une procédure d'homologation est nécessaire. Forfait homologation : 4.500 € TTC",
};

describe('Véhicules importés', () => {
  it('Corvette américaine : origine USA, homologation annoncée, risque miles', () => {
    const imp = detectImport(corvette);
    assert.equal(imp?.origin, 'usa');
    assert.equal(imp?.papersPending, true);
    assert.equal(imp?.homologationQuoted, 4500);
    assert.equal(imp?.milesRisk, true);
    assert.match(importWarning(imp), /homologation annoncée 4.500 €.*miles/);
  });

  it('Japon et Allemagne', () => {
    assert.equal(detectImport({ title: 'Toyota Supra JDM', description: 'import Japon, conduite à droite' })?.origin, 'japon');
    assert.equal(detectImport({ title: 'Golf 7', description: 'Véhicule importé d’Allemagne, COC fourni' })?.origin, 'allemagne');
  });

  it('annonce française classique : rien', () => {
    assert.equal(detectImport({ title: 'Clio 4 1.5 dCi', description: 'Carte grise française, première main, sportive allemande' }), null);
    assert.equal(detectImport({ title: 'Clio 4', description: 'aucune homologation à prévoir' }), null);
  });

  it('scoring : homologation annoncée déduite de la marge, jamais MASTERCLASS', () => {
    const base = { id: 'x', type: 'auto', brand: 'Chevrolet', model: 'Corvette', year: 2005, mileage: 73278, price: 20000, marketPrice: 40000, publishedAt: new Date().toISOString(), zip: '33000' };
    const fr = scoreListing({ ...base, title: 'Corvette C6', description: 'Carte grise française' });
    const us = scoreListing({ ...base, ...corvette });
    assert.equal(us.finance.importCost, 4500);
    assert.equal(fr.finance.realNetMargin - us.finance.realNetMargin, 4500);
    assert.equal(us.masterclass, false);
    assert.ok(us.warnings.some((w) => w.startsWith('Import USA')));
  });
});
