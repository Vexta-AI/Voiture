/**
 * Normalisation d'une annonce brute du scraper LeBonCoin (Apify) vers le format Listing du moteur.
 *
 * Principe : ne jamais inventer. Une annonce sans prix, sans année ou sans modèle identifiable
 * est rejetée (raison retournée) plutôt que scorée sur des données fausses.
 * La cote (marketPrice) n'est PAS fixée ici : elle vient des comparables (market.js).
 */

import { AUTO_TARGETS, MOTO_TARGETS } from '../config/rules.js';
import { compact, normalize } from '../utils/text.js';

/** Premier entier plausible d'une valeur ("98 000 km" -> 98000). */
export function toInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[\s  .]/g, '').match(/\d+/);
  return digits ? Number(digits[0]) : null;
}

function attr(item, ...keys) {
  const map = item.attributes_map ?? {};
  for (const key of keys) {
    const value = item[key] ?? map[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/** Marque/modèle depuis les cibles connues quand le scraper ne les fournit pas (motos notamment). */
function inferFromTargets(type, title) {
  const text = compact(title);
  const targets = type === 'moto' ? MOTO_TARGETS : AUTO_TARGETS;
  for (const target of targets) {
    if (target.patterns.some((p) => text.includes(p))) {
      return { brand: target.brands[0], model: target.label };
    }
  }
  return null;
}

/** Génération Clio déduite de l'année quand le titre ne la précise pas (Clio 4 : 2012-2019, Clio 5 : 2020+). */
function withGeneration(model, title, year) {
  const m = normalize(model);
  if (m === 'clio' && !/clio\s*(iv|v|4|5)\b/.test(normalize(title))) {
    return year >= 2020 ? 'Clio 5' : year >= 2012 ? 'Clio 4' : model;
  }
  return model;
}

const capitalize = (s) => s.replace(/(^|[\s-])([a-zà-ÿ])/g, (_, sep, c) => sep + c.toUpperCase());

/**
 * @param {Record<string, any>} item annonce brute Apify
 * @param {{ type: 'auto'|'moto', source?: string }} context
 * @returns {{ ok: true, listing: import('../utils/scoring.js').Listing } | { ok: false, reason: string, id?: string }}
 */
export function normalizeApifyItem(item, context) {
  const id = item.ad_id ?? item.id ?? item.list_id;
  if (!id) return { ok: false, reason: 'identifiant manquant' };
  const title = String(item.title ?? item.subject ?? '').trim();
  const price = toInt(item.price) ?? (toInt(item.price_cents) !== null ? Math.round(toInt(item.price_cents) / 100) : null);
  if (!price || price < 500) return { ok: false, reason: 'prix manquant', id: String(id) };
  const year = toInt(attr(item, 'registration_year', 'regdate', 'year'));
  if (!year || year < 1990 || year > new Date().getFullYear() + 1) return { ok: false, reason: 'année manquante', id: String(id) };

  let brand = attr(item, 'vehicle_brand', 'brand', 'moto_brand', 'u_moto_brand', 'u_car_brand');
  let model = attr(item, 'vehicle_model', 'model', 'moto_model', 'u_moto_model', 'u_car_model');
  if (!brand || !model) {
    const inferred = inferFromTargets(context.type, title);
    if (!inferred) return { ok: false, reason: 'modèle non identifié', id: String(id) };
    brand = brand ?? inferred.brand;
    model = model ?? inferred.model;
  }
  brand = capitalize(String(brand).toLowerCase());
  model = withGeneration(String(model), title, year);

  const city = item.location_city ?? item.city;
  const zip = item.location_zipcode ?? item.zipcode;
  const doors = toInt(attr(item, 'doors', 'nb_doors'));
  const description = String(item.description ?? item.body ?? '');
  // Carte grise MTT1/MTT2 uniquement si le scraper la fournit ; sinon les mots-clés A2 du texte font foi.
  const license = String(attr(item, 'licence', 'license', 'license_category') ?? '').toUpperCase();

  return {
    ok: true,
    listing: {
      id: `lbc-${id}`,
      type: context.type,
      title: title || `${brand} ${model}`,
      brand,
      model,
      // Le titre porte souvent motorisation et boîte ("1.2 TCe 120 EDC") : il sert de version pour le moteur de règles.
      version: title,
      engine: attr(item, 'engine', 'cubic_capacity') ? String(attr(item, 'engine', 'cubic_capacity')) : undefined,
      gearbox: attr(item, 'gearbox') ? String(attr(item, 'gearbox')) : undefined,
      year,
      mileage: toInt(attr(item, 'mileage', 'kilometrage')) ?? 0,
      price,
      marketPrice: 0,
      description,
      doors: doors && doors >= 2 && doors <= 5 ? doors : undefined,
      licenseCategory: context.type === 'moto' && (license === 'MTT1' || license === 'MTT2') ? license : undefined,
      publishedAt: item.published_date ?? item.first_publication_date ?? item.index_date ?? new Date().toISOString(),
      location: city ? `${city}${zip ? ` (${String(zip).slice(0, 2)})` : ''}` : undefined,
      source: item.owner_type === 'pro' ? 'LeBonCoin · Pro' : 'LeBonCoin · Particulier',
      url: item.url ?? undefined,
    },
  };
}
