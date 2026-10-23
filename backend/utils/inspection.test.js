import assert from 'node:assert/strict';
import { test } from 'node:test';

import { INSPECTION_SCHEMA, inspectionCostUsd, inspectionLine, inspectionPrompt, odometerGap, parseInspection } from './inspection.js';

const raw = {
  verdict: 'a_verifier',
  summary: 'Carrosserie propre, compteur visible.',
  defects: [
    { zone: 'Pare-choc avant', observation: 'Rayure profonde', severity: 'moyen', photo: 2 },
    { zone: 'Aile', observation: 'Écart de teinte', severity: 'majeur', photo: 99 },
    { zone: 'x', observation: '', severity: 'mineur', photo: 1 },
  ],
  consistency: [{ point: 'Usure / km', ok: true, observation: 'Volant peu usé' }],
  odometer: { visible: true, reading: 152000, photo: 4 },
  missingPhotos: ['compartiment moteur'],
  questions: ['La courroie a-t-elle été faite ?'],
};

test('parseInspection valide et nettoie la réponse IA', () => {
  const p = parseInspection(raw, 5);
  assert.equal(p?.verdict, 'a_verifier');
  assert.equal(p?.defects.length, 2, 'défaut sans observation retiré');
  assert.equal(p?.defects[1].photo, null, 'numéro de photo hors bornes ignoré');
  assert.equal(p?.odometer.reading, 152000);
  assert.equal(parseInspection({ ...raw, verdict: 'super' }, 5), null);
  assert.equal(parseInspection(null, 5), null);
});

test('odometerGap : écart signalé au-delà de 5 % et 2 000 km', () => {
  const p = /** @type {any} */ (parseInspection(raw, 5));
  assert.equal(odometerGap(p, 150_500), null);
  assert.equal(odometerGap(p, 120_000), 32_000);
  assert.equal(odometerGap({ odometer: { reading: null } }, 120_000), null);
});

test('inspectionLine résume verdict, défauts majeurs et compteur', () => {
  const p = /** @type {any} */ (parseInspection(raw, 5));
  const line = inspectionLine(p, 120_000);
  assert.match(line, /à vérifier/);
  assert.match(line, /1 défaut\(s\) majeur\(s\) : Écart de teinte/);
  assert.match(line, /compteur photo 152\s000 km ≠ annonce/);
});

test('coût estimé depuis les tokens et le tarif publié', () => {
  assert.equal(inspectionCostUsd({ input_tokens: 10_000, output_tokens: 1_000 }), 0.06);
  assert.equal(inspectionCostUsd(undefined), 0);
});

test('prompt et schéma', () => {
  const text = inspectionPrompt(/** @type {any} */ ({ title: 'Clio IV', year: 2016, mileage: 98000, price: 7500, description: 'Très propre' }), 3);
  assert.match(text, /98\s000 km annoncés/);
  assert.match(text, /3 photo\(s\)/);
  assert.equal(INSPECTION_SCHEMA.additionalProperties, false);
  assert.deepEqual([...INSPECTION_SCHEMA.required].sort(), Object.keys(INSPECTION_SCHEMA.properties).sort());
});

test('inspection automatique désactivée par défaut, check-list au format « point : détail »', async () => {
  const { INSPECTION, PHOTO_CHECKLIST } = await import('./inspection.js');
  assert.equal(INSPECTION.maxPerRun, 0);
  for (const c of PHOTO_CHECKLIST) assert.match(c, /^[^:]+ : /);
});
