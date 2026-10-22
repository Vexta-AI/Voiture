import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_AREA, defaultSources, parseArea, parseTypes } from '../config/sources.js';
import { getDatasetItems, isCapacityError, startRun } from './apify.js';
import { alertKey, priceListings, selectAlerts } from './hunt.js';
import { distanceKm, filterArea } from './geo.js';
import { estimateMarketPrice, modelKey, variantOf } from './market.js';
import { normalizeApifyItem, toInt } from './normalize.js';
import { scoreListing } from '../utils/scoring.js';
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

describe('Zone & variantes (bugs vus en production)', () => {
  const area = { lat: 44.901, lng: -0.74, radiusKm: 200 };

  it('Bordeaux en zone prioritaire, Paris en France, Martinique et sans GPS écartées', () => {
    const bordeaux = listing({ ad_id: 1, location_lat: 44.84, location_lng: -0.58 });
    const paris = listing({ ad_id: 2, location_lat: 48.82, location_lng: 2.21, location_zipcode: '92310' });
    const martinique = listing({ ad_id: 3, location_lat: 14.79, location_lng: -61.11, location_zipcode: '97218' });
    const noGps = listing({ ad_id: 4 });
    const { kept, stats } = filterArea([paris, bordeaux, martinique, noGps], area);
    assert.deepEqual(kept.map((l) => [l.id, l.zone]), [['lbc-1', 'prioritaire'], ['lbc-2', 'france']]);
    assert.deepEqual({ p: stats.prioritaire, f: stats.france, h: stats.hors, none: stats.noCoords }, { p: 1, f: 1, h: 1, none: 1 });
    assert.deepEqual(filterArea([paris, bordeaux], area, { national: false }).kept.map((l) => l.id), ['lbc-1']);
    assert.ok(Math.abs(distanceKm({ lat: 44.84, lng: -0.58 }, { lat: 48.86, lng: 2.35 }) - 500) < 15);
  });

  it('ne compare pas une Golf GTI à une Golf, ni une Clio hybride à une Clio essence', () => {
    const gti = listing({ ad_id: 5, title: 'Volkswagen Golf 7 GTI Performance', vehicle_brand: 'VOLKSWAGEN', vehicle_model: 'Golf' });
    const golf = listing({ ad_id: 6, title: 'Volkswagen Golf 7 1.6 TDI', vehicle_brand: 'VOLKSWAGEN', vehicle_model: 'Golf' });
    assert.notEqual(modelKey(gti), modelKey(golf));
    assert.equal(variantOf(listing({ title: 'Renault Clio 5 E-Tech full hybrid 145' })), 'hybrid');
    assert.equal(variantOf(listing({ title: 'Renault Clio 5 TCe 90' })), 'std');
  });

  it('ne compare pas une MT-10 à une MT-07', () => {
    const mt10 = normalizeApifyItem(rawItem({ title: 'Yamaha MT10sp', vehicle_brand: 'Yamaha', vehicle_model: 'MT' }), { type: 'moto' });
    const mt07 = normalizeApifyItem(rawItem({ title: 'Yamaha MT-07 ABS', vehicle_brand: 'Yamaha', vehicle_model: 'MT' }), { type: 'moto' });
    assert.ok(mt10.ok && mt07.ok);
    if (mt10.ok && mt07.ok) assert.notEqual(modelKey(mt10.listing), modelKey(mt07.listing));
  });

  it('pas d’alerte quand le prix est sous 50 % de la cote (arnaque ou cote faussée)', () => {
    const suspect = listing({ ad_id: 7, price: 3000 });
    const { priced } = priceListings([suspect], comps([8700, 8900, 9000, 9100, 9300]));
    assert.equal(selectAlerts(priced, { now: NOW }).length, 0);
  });
});

describe('Achat à distance', () => {
  it('déduit le rapatriement : une pépite à 500 km peut redevenir "à surveiller"', () => {
    const base = { ad_id: 8, price: 6990 };
    const near = { ...listing(base), marketPrice: 8800, zone: 'prioritaire', distanceKm: 40 };
    const far = { ...listing(base), marketPrice: 8800, zone: 'france', distanceKm: 500 };
    const a = scoreListing(near, { now: NOW });
    const b = scoreListing(far, { now: NOW });
    assert.equal(a.finance.transportCost, 0);
    assert.equal(a.status.key, 'PEPITE'); // 8800 - 6990 - 550 = 1260 > 1000
    assert.equal(b.finance.transportCost, 140); // 60 + 500 × 0,15
    assert.equal(b.finance.netMargin, a.finance.netMargin, 'formule stricte inchangée');
    assert.equal(b.finance.netMarginAfterTransport, 1120);
    assert.equal(b.zone, 'france');
    const veryFar = scoreListing({ ...far, distanceKm: 900 }, { now: NOW }); // 60 + 135 = 200 -> 1060
    assert.equal(veryFar.status.key, 'PEPITE');
    const farther = scoreListing({ ...far, marketPrice: 8700, distanceKm: 900 }, { now: NOW }); // 1160 - 200 = 960
    assert.equal(farther.status.key, 'SURVEILLER');
  });

  it('pas de mandat hors zone prioritaire', () => {
    const old = { ...listing({ ad_id: 9, published_date: daysAgo(20) }), marketPrice: 9000, zone: 'france', distanceKm: 400 };
    assert.equal(scoreListing(old, { now: NOW }).mandateEligible, false);
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
    await startRun({ token: 'tok', source, webhookUrl: 'https://app.test/api/hunt/ingest', webhookSecret: 's3cret', maxChargeUsd: 1, bypassSecret: 'byp', fetchImpl });
    const [hook2] = JSON.parse(Buffer.from(call.url.searchParams.get('webhooks'), 'base64').toString());
    assert.equal(JSON.parse(hook2.headersTemplate)['x-vercel-protection-bypass'], 'byp');
    const input = JSON.parse(call.init.body);
    assert.deepEqual(input.proxyConfiguration, { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'FR' });
  });

  it('transmet le lot dans le webhook et reconnaît les refus de capacité', async () => {
    let call;
    const ok = async (url) => {
      call = new URL(url);
      return new Response(JSON.stringify({ data: { id: 'r1', status: 'READY' } }), { status: 201 });
    };
    const [source] = defaultSources();
    await startRun({ token: 't', source, webhookUrl: 'https://app.test/api/hunt/ingest', webhookSecret: 's', maxChargeUsd: 1, batchId: '2026-10-22-w-abc12345', fetchImpl: ok });
    const [hook] = JSON.parse(Buffer.from(call.searchParams.get('webhooks'), 'base64').toString());
    const cb = new URL(hook.requestUrl);
    assert.equal(cb.searchParams.get('source'), source.key);
    assert.equal(cb.searchParams.get('batch'), '2026-10-22-w-abc12345');

    const full = async () => new Response('{"error":{"type":"concurrent-runs-limit-exceeded"}}', { status: 402 });
    const error = await startRun({ token: 't', source, webhookUrl: 'x', webhookSecret: 's', maxChargeUsd: 1, fetchImpl: full }).catch((e) => e);
    assert.equal(isCapacityError(error), true);
    const bad = await startRun({ token: 't', source, webhookUrl: 'x', webhookSecret: 's', maxChargeUsd: 1, fetchImpl: async () => new Response('bad', { status: 400 }) }).catch((e) => e);
    assert.equal(isCapacityError(bad), false);
  });

  it('remonte les erreurs Apify', async () => {
    await assert.rejects(getDatasetItems({ token: 't', datasetId: 'd', fetchImpl: async () => new Response('nope', { status: 401 }) }), /401/);
  });

  it('sources : fresh chaque jour, stale + comparables chaque semaine', () => {
    const daily = defaultSources();
    assert.deepEqual(daily.map((s) => s.key), ['fresh-auto', 'fresh-auto-fr', 'fresh-moto', 'fresh-moto-fr']);
    assert.equal(new URL(daily[1].input.searchUrl).searchParams.get('locations'), null, 'recherche nationale sans zone');
    const url = new URL(daily[0].input.searchUrl);
    assert.equal(url.origin + url.pathname, 'https://www.leboncoin.fr/recherche');
    assert.equal(url.searchParams.get('category'), '2');
    assert.equal(url.searchParams.get('locations'), `Bordeaux_33000__${DEFAULT_AREA.lat}_${DEFAULT_AREA.lng}_9256_200000`);
    assert.equal(url.searchParams.get('price'), '3000-30000');
    assert.equal(new URL(daily[2].input.searchUrl).searchParams.get('category'), '3');
    const weekly = defaultSources({ includeWeekly: true });
    assert.ok(weekly.some((s) => s.key === 'stale-auto') && weekly.some((s) => s.key === 'stale-moto'));
    assert.ok(weekly.filter((s) => s.kind === 'market').length >= 10);
    assert.equal(new Set(weekly.map((s) => s.key)).size, weekly.length, 'clés uniques');
  });

  it('types : "auto" ne chasse que les voitures (hebdo compris)', () => {
    assert.deepEqual(parseTypes('auto'), ['auto']);
    assert.deepEqual(parseTypes(' Auto , moto '), ['auto', 'moto']);
    assert.equal(parseTypes('bateau'), null);
    assert.equal(parseTypes(undefined), null);
    const autoOnly = defaultSources({ includeWeekly: true, types: ['auto'] });
    assert.ok(autoOnly.length > 0 && autoOnly.every((s) => s.type === 'auto'));
  });

  it('zone : parse "lat,lng,rayonKm" et rejette les valeurs absurdes', () => {
    assert.deepEqual(parseArea('44.9, -0.74, 150'), { lat: 44.9, lng: -0.74, radiusKm: 150 });
    assert.equal(parseArea('44.9,-0.74'), null);
    assert.equal(parseArea('200,0,10'), null);
    assert.equal(parseArea(undefined), null);
  });
});
