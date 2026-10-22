import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defaultSources } from '../config/sources.js';
import { getDatasetItems, startRun } from './apify.js';
import { alertKey, priceListings, selectAlerts } from './hunt.js';
import { estimateMarketPrice, modelKey } from './market.js';
import { normalizeApifyItem, toInt } from './normalize.js';
import { formatTelegramAlert, sendTelegram } from './telegram.js';

const NOW = new Date('2026-10-22T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

/** Annonce brute au format du scraper bovi/leboncoin-listings. */
const rawItem = (overrides = {}) => ({
  ad_id: 2901234567,
  title: 'Renault Clio 1.5 dCi 90 Intens',
  description: 'Petite rayure sur la portière. Pneus avant à prévoir.',
  url: 'https://www.leboncoin.fr/ad/voitures/2901234567',
  price: 6990,
  published_date: daysAgo(1),
  location_city: 'Mérignac',
  location_zipcode: '33700',
  owner_type: 'private',
  vehicle_brand: 'RENAULT',
  vehicle_model: 'Clio',
  mileage: 98000,
  gearbox: 'Manuelle',
  registration_year: 2017,
  attributes_map: { doors: '5' },
  ...overrides,
});

const listing = (overrides = {}) => {
  const result = normalizeApifyItem(rawItem(overrides), { type: 'auto' });
  assert.ok(result.ok, 'fixture valide');
  return result.listing;
};

/** Comparables : même modèle, prix donnés. */
const comps = (prices, overrides = {}) => prices.map((price, i) => listing({ ad_id: 1000 + i, price, ...overrides }));

describe('Normalisation Apify', () => {
  it('convertit une annonce voiture complète', () => {
    const l = listing();
    assert.equal(l.id, 'lbc-2901234567');
    assert.equal(l.brand, 'Renault');
    assert.equal(l.model, 'Clio 4'); // génération déduite de l'année
    assert.equal(l.year, 2017);
    assert.equal(l.mileage, 98000);
    assert.equal(l.doors, 5);
    assert.equal(l.location, 'Mérignac (33)');
    assert.equal(l.marketPrice, 0); // jamais inventée ici
  });

  it('lit les nombres formatés et les centimes', () => {
    assert.equal(toInt('98 000 km'), 98000);
    const l = normalizeApifyItem(rawItem({ price: undefined, price_cents: 699000, mileage: '45 000 km' }), { type: 'auto' });
    assert.ok(l.ok);
    assert.equal(l.ok && l.listing.price, 6990);
    assert.equal(l.ok && l.listing.mileage, 45000);
  });

  it('identifie une moto par son titre quand le scraper ne donne pas la marque', () => {
    const r = normalizeApifyItem(rawItem({ title: 'Yamaha MT-07 ABS 2019 bridée A2', vehicle_brand: undefined, vehicle_model: undefined, registration_year: 2019 }), { type: 'moto' });
    assert.ok(r.ok);
    assert.equal(r.ok && r.listing.model, 'MT-07');
    assert.equal(r.ok && r.listing.brand, 'Yamaha');
  });

  it('rejette plutôt que d’inventer', () => {
    assert.equal(normalizeApifyItem(rawItem({ price: null }), { type: 'auto' }).ok, false);
    assert.equal(normalizeApifyItem(rawItem({ registration_year: undefined }), { type: 'auto' }).ok, false);
    assert.equal(normalizeApifyItem(rawItem({ vehicle_brand: undefined, vehicle_model: undefined, title: 'Voiture à vendre' }), { type: 'auto' }).ok, false);
  });
});

describe('Cote par comparables', () => {
  it('prend la médiane des comparables proches', () => {
    const target = listing();
    const est = estimateMarketPrice(target, comps([8000, 8500, 9000, 9500, 10000]));
    assert.equal(est?.price, 9000);
    assert.equal(est?.comparables, 5);
    assert.equal(est?.window, 'serré');
  });

  it('élargit la fenêtre si besoin, refuse sous 4 comparables', () => {
    const target = listing();
    const far = comps([8000, 8200, 8400, 8600], { registration_year: 2015 }); // 2 ans d'écart
    assert.equal(estimateMarketPrice(target, far)?.window, 'élargi');
    assert.equal(estimateMarketPrice(target, comps([8000, 9000, 10000])), null);
  });

  it('ignore les autres modèles, l’annonce elle-même et les prix aberrants', () => {
    const target = listing();
    const others = comps([1000, 1000, 1000, 1000], { vehicle_model: 'Megane' });
    assert.equal(estimateMarketPrice(target, [...others, target]), null);
    const withOutliers = comps([500, 8800, 8900, 9000, 9000, 9100, 9200, 9300, 9400, 40000]);
    assert.equal(estimateMarketPrice(target, withOutliers)?.price, 9050);
    assert.notEqual(modelKey(target), modelKey(others[0]));
  });
});

describe('Pipeline de chasse', () => {
  it('cote, score et sélectionne une PÉPITE avec message de négo', () => {
    const fresh = listing({ ad_id: 1, price: 6990 });
    const pool = [fresh, ...comps([8700, 8900, 9000, 9100, 9300])];
    const { priced, unpriced } = priceListings([fresh], pool);
    assert.equal(unpriced, 0);
    assert.equal(priced[0].listing.marketPrice, 9000);
    const alerts = selectAlerts(priced, { now: NOW });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].payload.ok && alerts[0].payload.strategy, 'negotiation');
    assert.equal(alerts[0].key, alertKey('lbc-1', 'negotiation', 6990));
  });

  it('n’alerte pas sans cote ni sur une annonce sans marge', () => {
    const alone = listing({ ad_id: 2 });
    assert.equal(priceListings([alone], [alone]).unpriced, 1);
    const pricey = listing({ ad_id: 3, price: 9000 });
    const { priced } = priceListings([pricey], comps([8900, 9000, 9100, 9200]));
    assert.equal(selectAlerts(priced, { now: NOW }).length, 0);
  });

  it('la clé d’alerte change quand le prix baisse (nouvelle alerte)', () => {
    assert.notEqual(alertKey('lbc-1', 'negotiation', 7500), alertKey('lbc-1', 'negotiation', 6900));
  });
});

describe('Telegram', () => {
  const fresh = listing({ ad_id: 1, title: 'Clio <script> & co', price: 6990 });
  const [alert] = selectAlerts(priceListings([fresh], comps([8700, 8900, 9000, 9100, 9300])).priced, { now: NOW });

  it('formate une alerte HTML échappée et sous 4 096 caractères', () => {
    assert.ok(alert.payload.ok);
    if (!alert.payload.ok) return;
    const text = formatTelegramAlert(alert.payload, { comparables: 5 });
    assert.match(text, /PÉPITE/);
    assert.match(text, /&lt;script&gt; &amp; co/);
    assert.doesNotMatch(text, /<script>/);
    assert.match(text, /5 comparables/);
    assert.ok(text.length <= 4096);
  });

  it('envoie via l’API Bot avec parse_mode HTML', async () => {
    let call;
    const fetchImpl = async (url, init) => {
      call = { url, body: JSON.parse(init.body) };
      return new Response('{"ok":true}', { status: 200 });
    };
    await sendTelegram({ token: 'T', chatId: '42', text: 'hello', fetchImpl });
    assert.equal(call.url, 'https://api.telegram.org/botT/sendMessage');
    assert.equal(call.body.chat_id, '42');
    assert.equal(call.body.parse_mode, 'HTML');
    await assert.rejects(sendTelegram({ token: 'T', chatId: '42', text: 'x', fetchImpl: async () => new Response('bad', { status: 400 }) }));
  });
});

describe('Apify & sources', () => {
  it('lance un run avec webhook signé, plafond de coût et proxy résidentiel FR', async () => {
    let call;
    const fetchImpl = async (url, init) => {
      call = { url: new URL(url), init };
      return new Response(JSON.stringify({ data: { id: 'run123', status: 'READY' } }), { status: 201 });
    };
    const [source] = defaultSources();
    const res = await startRun({ token: 'tok', source, webhookUrl: 'https://app.test/api/hunt/ingest', webhookSecret: 's3cret', maxChargeUsd: 1, fetchImpl });
    assert.deepEqual(res, { runId: 'run123', status: 'READY' });
    assert.equal(call.url.pathname, '/v2/acts/bovi~leboncoin-listings/runs');
    assert.equal(call.init.headers.Authorization, 'Bearer tok');
    assert.equal(call.url.searchParams.get('maxTotalChargeUsd'), '1');
    const [hook] = JSON.parse(Buffer.from(call.url.searchParams.get('webhooks'), 'base64').toString());
    assert.equal(hook.requestUrl, `https://app.test/api/hunt/ingest?source=${source.key}`);
    assert.deepEqual(JSON.parse(hook.headersTemplate), { 'x-ingest-secret': 's3cret' });
    const input = JSON.parse(call.init.body);
    assert.deepEqual(input.proxyConfiguration, { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'FR' });
  });

  it('remonte les erreurs Apify', async () => {
    await assert.rejects(getDatasetItems({ token: 't', datasetId: 'd', fetchImpl: async () => new Response('nope', { status: 401 }) }), /401/);
  });

  it('sources : fresh + stale par type, comparables seulement sur demande', () => {
    const base = defaultSources();
    assert.deepEqual(base.map((s) => s.key), ['fresh-auto', 'stale-auto', 'fresh-moto', 'stale-moto']);
    assert.ok(base.every((s) => typeof s.input.searchUrl === 'string' && s.input.searchUrl.startsWith('https://www.leboncoin.fr/recherche?')));
    const withMarket = defaultSources({ includeMarket: true });
    const market = withMarket.filter((s) => s.kind === 'market');
    assert.ok(market.length >= 10);
    assert.equal(new Set(withMarket.map((s) => s.key)).size, withMarket.length, 'clés uniques');
  });
});
