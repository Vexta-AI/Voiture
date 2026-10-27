import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_AREA, defaultSources, parseArea, parseTypes } from '../config/sources.js';
import { getDatasetItems, isCapacityError, startRun } from './apify.js';
import { alertKey, priceListings, selectAlerts, selectVerifyAlerts } from './hunt.js';
import { distanceKm, filterArea } from './geo.js';
import { estimateMarketPrice, modelKey, variantOf } from './market.js';
import { detailsFromItem, normalizeApifyItem, toInt } from './normalize.js';
import { scoreListing } from '../utils/scoring.js';
import { formatTelegramAlert, formatVerifyAlert, sendTelegram } from './telegram.js';
import { generateQualificationMessage } from '../utils/messages.js';
import { priceCheckLinks } from '../utils/links.js';
import { BUSINESS } from '../config/rules.js';

// Formule de base testée hors cotisations micro (testées à part).
BUSINESS.status = 'particulier';

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

  it('particuliers seulement quand ils suffisent, pros inclus sinon', () => {
    const target = listing();
    const priv = comps([8000, 8500, 9000, 9500]);
    const pros = comps([11000, 11500, 12000]).map((p, i) => ({ ...p, id: `pro-${i}`, source: 'LeBonCoin · Pro' }));
    const est = estimateMarketPrice(target, [...priv, ...pros]);
    assert.equal(est?.comparables, 4);
    assert.ok(est?.criteria.some((c) => c.startsWith('particuliers seulement (3 pro')));
    const mixed = estimateMarketPrice(target, [...priv.slice(0, 2), ...pros]);
    assert.equal(mixed?.comparables, 5);
    assert.ok(mixed?.criteria.includes('pros inclus (pas assez d’annonces de particuliers)'));
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
    // Carte grise Clio 2017 304 € + assurance 30 j 180 € + annonce 80 € ; visite à 40 km : 10 €.
    const near = { ...listing(base), marketPrice: 9534, zone: 'prioritaire', distanceKm: 40 };
    const far = { ...listing(base), marketPrice: 9534, zone: 'france', distanceKm: 500 };
    const a = scoreListing(near, { now: NOW });
    const b = scoreListing(far, { now: NOW });
    assert.equal(a.finance.transportCost, 0);
    assert.equal(a.status.key, 'PEPITE'); // 9534 - 6990 - 700 - 574 = 1270 > 1000
    assert.equal(a.finance.ownership.visit, 10);
    assert.equal(b.finance.transportCost, 140); // 60 + 500 × 0,15
    assert.equal(b.finance.netMargin, a.finance.netMargin, 'formule stricte inchangée');
    assert.equal(b.finance.realNetMargin, 1140); // 2544 - 700 - 304 - 260 - 140
    assert.equal(b.zone, 'france');
    const veryFar = scoreListing({ ...far, distanceKm: 900 }, { now: NOW }); // 60 + 135 = 200 -> 1080
    assert.equal(veryFar.status.key, 'PEPITE');
    const farther = scoreListing({ ...far, marketPrice: 9434, distanceKm: 900 }, { now: NOW }); // 980
    assert.equal(farther.status.key, 'SURVEILLER');
  });

  it('pas de mandat hors zone prioritaire', () => {
    const old = { ...listing({ ad_id: 9, published_date: daysAgo(20) }), marketPrice: 9000, zone: 'france', distanceKm: 400 };
    assert.equal(scoreListing(old, { now: NOW }).mandateEligible, false);
  });
});

describe('Pipeline de chasse', () => {
  it('cote, score et sélectionne une PÉPITE avec message de négo', () => {
    const fresh = listing({ ad_id: 1, price: 6500 });
    const pool = [fresh, ...comps([8700, 8900, 9000, 9100, 9300])];
    const { priced, unpriced } = priceListings([fresh], pool);
    assert.equal(unpriced, 0);
    assert.equal(priced[0].listing.marketPrice, 9000);
    const alerts = selectAlerts(priced, { now: NOW });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].payload.ok && alerts[0].payload.strategy, 'negotiation');
    assert.equal(alerts[0].key, alertKey('lbc-1', 'negotiation', 6500));
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
  const fresh = listing({ ad_id: 1, title: 'Clio <script> & co', price: 6500 });
  const [alert] = selectAlerts(priceListings([fresh], comps([8700, 8900, 9000, 9100, 9300])).priced, { now: NOW });

  it('formate une alerte HTML échappée et sous 4 096 caractères', () => {
    assert.ok(alert.payload.ok);
    if (!alert.payload.ok) return;
    const text = formatTelegramAlert(alert.payload, { comparables: 5 });
    assert.match(text, /PÉPITE/);
    assert.match(text, /&lt;script&gt; &amp; co/);
    assert.doesNotMatch(text, /<script>/);
    assert.match(text, /médiane de 5 annonces/);
    assert.ok(text.length <= 4096);
  });

  it('reste sous 4 096 caractères même avec beaucoup d’acheteurs aux noms longs', () => {
    assert.ok(alert.payload.ok);
    if (!alert.payload.ok) return;
    const buyers = Array.from({ length: 60 }, (_, i) => ({ name: `${'X'.repeat(95)}${i}`, budgetMax: 99_000 }));
    const text = formatTelegramAlert(alert.payload, { comparables: 5, buyers });
    assert.ok(text.length <= 4096, `longueur ${text.length}`);
    assert.match(text, /\+57 autre\(s\)/);
    assert.match(text, /<pre>[\s\S]+<\/pre>$/);
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
    assert.equal(url.searchParams.get('price'), '1500-30000');
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

describe('Comparables à la demande', () => {
  it('une recherche par modèle sans cote, zone prioritaire d’abord, modèles récents exclus', async () => {
    const { ondemandCandidates } = await import('./hunt.js');
    const { ondemandSource } = await import('../config/sources.js');
    const mk = (id, brand, model, extra = {}) => ({ id, type: 'auto', brand, model, title: `${brand} ${model}`, year: 2018, mileage: 80000, price: 9000, marketPrice: 0, publishedAt: NOW.toISOString(), ...extra });
    const missing = [
      mk('1', 'Seat', 'Ibiza', { zone: 'france', distanceKm: 600 }),
      mk('2', 'Kia', 'Ceed', { zone: 'prioritaire', distanceKm: 50 }),
      mk('3', 'Kia', 'Ceed', { zone: 'prioritaire', distanceKm: 20 }),
      mk('4', 'Fiat', '500', { zone: 'prioritaire', distanceKm: 10, price: 1200 }), // hors budget
      mk('5', 'Skoda', 'Fabia', { zone: 'prioritaire', distanceKm: 90 }),
    ];
    const picked = ondemandCandidates(missing, { max: 2 });
    const text = (src) => new URL(src.input.searchUrl).searchParams.get('text');
    assert.deepEqual(picked.map(text), ['kia ceed', 'skoda fabia']);
    const url = new URL(picked[0].input.searchUrl);
    assert.equal(url.searchParams.get('regdate'), '2016-2020', 'années ±2');
    assert.equal(url.searchParams.get('mileage'), '32000-128000');
    assert.equal(picked[0].kind, 'market');
    assert.ok(picked[0].key.startsWith('ondemand-auto-'));
    const skip = new Set([ondemandSource(missing[1]).key]);
    assert.deepEqual(ondemandCandidates(missing, { max: 2, skip }).map(text), ['skoda fabia', 'seat ibiza']);
    assert.equal(ondemandCandidates([mk('6', 'Bmw', 'Autres model all')], { max: 2 }).length, 0, 'modèle non listé');
  });
});

describe('Modèles LeBonCoin', () => {
  it('nettoie "model all", la marque répétée et "Autres"', async () => {
    const { cleanModel } = await import('./normalize.js');
    const { modelKey } = await import('./market.js');
    const { ondemandSource } = await import('../config/sources.js');
    assert.equal(cleanModel('Tiguan_model_all', 'Volkswagen'), 'Tiguan');
    assert.equal(cleanModel('Tiguan model all', 'Volkswagen'), 'Tiguan');
    assert.equal(cleanModel('Volkswagen Tiguan', 'Volkswagen'), 'Tiguan');
    assert.equal(cleanModel('Autres', 'Opel'), null);
    const a = { type: 'auto', brand: 'Volkswagen', model: 'Tiguan model all', title: 'Tiguan' };
    assert.equal(modelKey(a), modelKey({ ...a, model: 'Tiguan' }), 'anciens stocks comparables');
    assert.equal(new URL(ondemandSource({ ...a, year: 2018 }).input.searchUrl).searchParams.get('text'), 'volkswagen tiguan');
  });
});

describe('Lien de l’annonce', () => {
  it('reconstruit le lien LeBonCoin depuis l’identifiant', async () => {
    const { adUrl } = await import('../utils/links.js');
    assert.equal(adUrl({ id: 'lbc-2841234567', type: 'auto' }), 'https://www.leboncoin.fr/ad/voitures/2841234567');
    assert.equal(adUrl({ listingId: 'lbc-12', type: 'moto' }), 'https://www.leboncoin.fr/ad/motos/12');
    assert.equal(adUrl({ id: 'x', url: 'https://a.b/c' }), 'https://a.b/c');
    assert.equal(adUrl({ id: 'a-001' }), null);
  });
});

describe('Photos', () => {
  it('lit les photos quel que soit le format du scraper', async () => {
    const { extractPhotos } = await import('./normalize.js');
    assert.deepEqual(extractPhotos({ images: ['https://img/1.jpg', 'https://img/2.jpg'] }), ['https://img/1.jpg', 'https://img/2.jpg']);
    assert.deepEqual(extractPhotos({ images: { urls_large: ['https://img/a.jpg'] } }), ['https://img/a.jpg']);
    assert.deepEqual(extractPhotos({ images: [{ url: 'https://img/b.jpg' }] }), ['https://img/b.jpg']);
    assert.deepEqual(extractPhotos({ thumbnail: 'https://img/t.jpg' }), ['https://img/t.jpg']);
    assert.deepEqual(extractPhotos({}), []);
  });
});

describe('Revente chez toi', () => {
  it('cote locale à moins de 100 km, puis 200 km', async () => {
    const { estimateLocalPrice } = await import('./market.js');
    const base = { lat: 44.9, lng: -0.74 };
    const near = (id, price, lat = 44.85, lng = -0.58) => ({ ...listing({ ad_id: id, price }), lat, lng });
    const target = listing({ ad_id: 500, price: 6000 });
    const pool = [near(501, 9500), near(502, 9600), near(503, 9700), { ...near(504, 7000), lat: 48.85, lng: 2.35 }, { ...near(505, 7100), lat: 48.85, lng: 2.35 }];
    const local = estimateLocalPrice(target, pool, base);
    assert.equal(local?.radiusKm, 100);
    assert.equal(local?.price, 9600);
    assert.equal(estimateLocalPrice(target, pool.slice(3), base), null, 'Paris hors zone');
  });

  it('MASTERCLASS seulement si ta zone confirme', () => {
    const base = { ...listing({ ad_id: 600, price: 6000 }), marketPrice: 10000, description: 'Vente urgente.' };
    const ok = scoreListing({ ...base, localMarket: { price: 10200, low: 9900, high: 10500, comparables: 5, daysOnMarket: 20, radiusKm: 100 } }, { now: NOW });
    assert.equal(ok.masterclass, true);
    assert.equal(ok.local?.margin, 10200 - 6000 - 700 - 304 - 260);
    const low = scoreListing({ ...base, localMarket: { price: 7200, low: 7000, high: 7400, comparables: 4, daysOnMarket: 40, radiusKm: 100 } }, { now: NOW });
    assert.equal(low.masterclass, false);
    assert.ok(low.warnings.some((w) => w.includes('Chez toi')));
  });
});

describe('Comparables fiables', () => {
  it('lit carburant, boîte et puissance dans la motorisation', async () => {
    const { fuelOf, gearboxOf, powerOf } = await import('./market.js');
    assert.equal(fuelOf({ title: 'Clio 4 1.5 dCi 90' }), 'diesel');
    assert.equal(fuelOf({ title: 'Clio 4 0.9 TCe 90' }), 'essence');
    assert.equal(fuelOf({ title: 'Clio 5 E-Tech 140' }), 'hybride');
    assert.equal(gearboxOf({ title: 'Captur 1.3 TCe 130 EDC' }), 'auto');
    assert.equal(gearboxOf({ gearbox: 'Manuelle' }), 'manuelle');
    assert.equal(powerOf({ title: 'Golf 7 2.0 TDI 150' }), 150);
    assert.equal(powerOf({ title: 'Polo 95 ch' }), 95);
    assert.equal(powerOf({ title: 'Polo' }), null);
  });

  it('ne compare pas diesel / essence, auto / manuelle, ni les annonces accidentées', async () => {
    const { estimateMarketPrice } = await import('./market.js');
    const mk = (id, price, title, extra = {}) => ({ id: String(id), type: 'auto', brand: 'Renault', model: 'Clio 4', title, year: 2017, mileage: 80000, price, publishedAt: NOW.toISOString(), ...extra });
    const target = mk(0, 6000, 'Renault Clio 4 1.5 dCi 90', { gearbox: 'Manuelle' });
    const pool = [
      mk(1, 9000, 'Renault Clio 4 1.5 dCi 90'),
      mk(2, 9100, 'Renault Clio 4 1.5 dCi 90'),
      mk(3, 9200, 'Renault Clio 4 1.5 dCi 90'),
      mk(4, 9300, 'Renault Clio 4 1.5 dCi 90'),
      mk(5, 6500, 'Renault Clio 4 0.9 TCe 90'), // essence
      mk(6, 6600, 'Renault Clio 4 0.9 TCe 90'),
      mk(7, 12000, 'Renault Clio 4 1.5 dCi 90 EDC'), // auto
      mk(8, 4000, 'Renault Clio 4 1.5 dCi 90', { description: 'Accidentée à l’avant, roule.' }),
    ];
    const m = estimateMarketPrice(target, pool);
    assert.equal(m?.comparables, 4);
    assert.equal(m?.price, 9150);
    assert.ok(m?.criteria.includes('même carburant (diesel)'));
    assert.ok(m?.criteria.some((c) => c.includes('écartée')));
  });
});

describe('Fiabilité de la cote', () => {
  it('beaucoup de comparables serrés et vérifiés = haute ; peu et dispersés = faible', async () => {
    const { marketConfidence } = await import('./market.js');
    assert.equal(marketConfidence({ comparables: 10, low: 8800, high: 9300, price: 9000, verified: 3, window: 'serré' }).level, 'haute');
    assert.equal(marketConfidence({ comparables: 4, low: 6000, high: 9000, price: 7500, verified: 0, window: 'élargi' }).level, 'faible');
  });

  it('liste les annonces comparées et ne déclenche pas d’alerte sur une cote faible', async () => {
    const { estimateMarketPrice } = await import('./market.js');
    const target = listing({ ad_id: 700, price: 6000 });
    const tight = comps([8900, 9000, 9100, 9200]);
    const m = estimateMarketPrice(target, tight);
    assert.equal(m?.samples.length, 4);
    assert.ok(m?.samples[0].url?.startsWith('https://www.leboncoin.fr/ad/'));
    const spread = comps([6000, 8000, 11000, 14000]);
    const weak = priceListings([listing({ ad_id: 701, price: 5000 })], spread);
    assert.equal(weak.priced[0].market.confidence.level, 'faible');
    assert.equal(selectAlerts(weak.priced, { now: NOW }).length, 0);
  });
});

describe('Baisses de prix', () => {
  it('repère une baisse depuis un relevé précédent et en fait un signal vendeur motivé', async () => {
    const { priceHistory, withPriceDrop } = await import('./history.js');
    const runs = [
      { runId: 'a', fetchedAt: '2026-10-10T05:00:00Z', listings: [{ id: 'lbc-1', price: 7500 }] },
      { runId: 'b', fetchedAt: '2026-10-15T05:00:00Z', listings: [{ id: 'lbc-1', price: 7200 }] },
      { runId: 'now', fetchedAt: '2026-10-22T05:00:00Z', listings: [{ id: 'lbc-1', price: 6900 }] },
    ];
    const h = priceHistory(runs, { excludeRunId: 'now' });
    const l = withPriceDrop({ ...listing({ ad_id: 1, price: 6900 }), marketPrice: 9000 }, h);
    assert.deepEqual(l.priceDrop, { from: 7500, to: 6900, amount: 600, since: '2026-10-10T05:00:00Z' });
    const a = scoreListing(l, { now: NOW });
    assert.equal(a.priceReasons.motivated[0].id, 'baisse');
    assert.equal(withPriceDrop({ id: 'lbc-1', price: 7450 }, h).priceDrop, undefined, 'moins de 100 € : pas une baisse');
  });

  it('le message de négo cite le bas du marché des annonces comparées', async () => {
    const { generateNegotiationMessage } = await import('../utils/messages.js');
    const l = { ...listing({ ad_id: 2, price: 9000 }), marketPrice: 9500, marketStats: { low: 8600, high: 9800, comparables: 7, daysOnMarket: 20 } };
    const msg = generateNegotiationMessage(l, scoreListing(l, { now: NOW }));
    assert.match(msg.text, /7 annonces équivalentes/);
    assert.match(msg.text, /8\s600 €/);
  });
});

describe('Annonces republiées', () => {
  it('reconnaît la même voiture sous un nouvel identifiant et recalcule le temps en ligne', async () => {
    const { repostIndex, withRepost } = await import('./history.js');
    const old = { ...listing({ ad_id: 10, price: 8000 }), zip: '33000', publishedAt: '2026-09-01T00:00:00Z' };
    const runs = [{ runId: 'a', fetchedAt: '2026-09-02T05:00:00Z', listings: [old] }];
    const fresh = { ...listing({ ad_id: 11, price: 7700 }), zip: '33000', mileage: old.mileage + 300, publishedAt: '2026-10-21T00:00:00Z', marketPrice: 9500 };
    const r = withRepost(fresh, repostIndex(runs));
    assert.equal(r.repost?.previousId, old.id);
    const a = scoreListing(r, { now: NOW });
    assert.ok(a.daysOnline >= 50, String(a.daysOnline));
    assert.equal(a.priceReasons.motivated[0].id, 'republiee');
    const other = withRepost({ ...fresh, zip: '64000' }, repostIndex(runs));
    assert.equal(other.repost, undefined, 'autre ville : autre voiture');
  });
});

describe('Pépites à vérifier (cote peu fiable)', () => {
  const fresh = listing({ ad_id: 7, price: 6500 });
  // Prix très dispersés : la médiane existe, mais la cote est classée « faible ».
  const { priced } = priceListings([fresh], comps([5000, 6500, 9500, 12500, 14000]));

  it('pas d’alerte classique, mais une alerte « à vérifier »', () => {
    assert.equal(priced[0].market.confidence?.level, 'faible');
    assert.equal(selectAlerts(priced, { now: NOW }).length, 0);
    const verify = selectVerifyAlerts(priced, { now: NOW });
    assert.equal(verify.length, 1);
    assert.equal(verify[0].key, alertKey(fresh.id, 'verify', 6500));
  });

  it('alerte Telegram : liens de cote, check-list, message de questions, sans offre', () => {
    const [v] = selectVerifyAlerts(priced, { now: NOW });
    const text = formatVerifyAlert(v.listing, v.analysis);
    assert.match(text, /PÉPITE À VÉRIFIER/);
    assert.match(text, /largus\.fr/);
    assert.match(text, /leboncoin\.fr\/recherche\?category=2/);
    assert.match(text, /HistoVec/);
    assert.doesNotMatch(text, /offre ferme/i);
    assert.ok(text.length <= 4096);
  });

  it('message de questions : saute ce que l’annonce dit déjà', () => {
    const withDistri = listing({ ad_id: 8, description: 'Distribution faite à 90 000 km, toutes les factures.' });
    const a = scoreListing(withDistri, { now: NOW });
    const m = generateQualificationMessage(withDistri, a);
    assert.doesNotMatch(m.text, /distribution a-t-elle/);
    assert.match(m.text, /factures d’entretien sont-elles disponibles/);
    assert.match(m.text, /HistoVec/);
  });

  it('liens de vérification : modèle nettoyé, année ±1, km sans plancher', () => {
    const links = priceCheckLinks({ type: 'auto', brand: 'Mini', model: 'Mini_model all', year: 2012, mileage: 100000 });
    const url = new URL(links.leboncoin);
    assert.equal(url.searchParams.get('text'), 'mini mini');
    assert.equal(url.searchParams.get('regdate'), '2011-2013');
    assert.equal(url.searchParams.get('mileage'), '0-130000');
  });
});

describe('Pages d’annonce (scraper de détails)', () => {
  it('récupère id et description, quel que soit le nom du champ', () => {
    assert.deepEqual(detailsFromItem({ ad_id: 3279214320, description: 'Distribution faite à 120 000 km.' }), { id: 'lbc-3279214320', description: 'Distribution faite à 120 000 km.' });
    assert.equal(detailsFromItem({ url: 'https://www.leboncoin.fr/ad/voitures/3020845973', body: 'Carnet complet' })?.id, 'lbc-3020845973');
    assert.equal(detailsFromItem({ ad_id: 3020845973, description: '' }), null);
  });
});
