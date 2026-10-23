import type { Listing } from './types';

type Result = { ok: true; listing: Listing } | { ok: false; error: string };

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[\s€]/g, '').replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** Valide et normalise une annonce reçue de l'extérieur (API ou formulaire). */
export function validateListing(input: unknown): Result {
  if (!input || typeof input !== 'object') return { ok: false, error: 'objet attendu' };
  const o = input as Record<string, unknown>;

  const type = o.type === 'moto' ? 'moto' : o.type === 'auto' || o.type === undefined ? 'auto' : null;
  if (!type) return { ok: false, error: 'type doit valoir "auto" ou "moto"' };

  const brand = str(o.brand);
  const model = str(o.model);
  const price = num(o.price);
  const marketPrice = num(o.marketPrice);
  const year = num(o.year);
  if (!brand || !model) return { ok: false, error: 'brand et model sont requis' };
  if (!price || price <= 0) return { ok: false, error: 'price (prix affiché) est requis' };
  if (!marketPrice || marketPrice <= 0) return { ok: false, error: 'marketPrice (cote marché pro) est requis' };
  if (!year || year < 1980 || year > 2100) return { ok: false, error: 'year invalide' };

  const publishedAt = str(o.publishedAt);
  const daysOnline = num(o.daysOnline);
  const published =
    publishedAt && !Number.isNaN(new Date(publishedAt).getTime())
      ? new Date(publishedAt).toISOString()
      : new Date(Date.now() - (daysOnline ?? 0) * 86_400_000).toISOString();

  const license = str(o.licenseCategory)?.toUpperCase();
  const segment = str(o.segment);

  return {
    ok: true,
    listing: {
      id: str(o.id) ?? `ext-${Math.random().toString(36).slice(2, 10)}`,
      type,
      title: str(o.title) ?? `${brand} ${model}`,
      brand,
      model,
      version: str(o.version),
      engine: str(o.engine),
      engineCode: str(o.engineCode),
      gearbox: str(o.gearbox),
      year,
      mileage: num(o.mileage) ?? 0,
      price,
      marketPrice,
      description: str(o.description),
      options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : undefined,
      doors: num(o.doors),
      fiscalHp: num(o.fiscalHp),
      fuel: str(o.fuel),
      powerDin: num(o.powerDin),
      argusPrice: num(o.argusPrice),
      marketStats:
        o.marketStats && typeof o.marketStats === 'object'
          ? (() => {
              const m = o.marketStats as Record<string, unknown>;
              const low = num(m.low);
              const high = num(m.high);
              const comparables = num(m.comparables);
              return low && high && comparables ? { low, high, comparables, daysOnMarket: num(m.daysOnMarket) ?? null } : undefined;
            })()
          : undefined,
      photos: Array.isArray(o.photos) ? o.photos.filter((x): x is string => typeof x === 'string' && /^https?:\/\//.test(x)).slice(0, 8) : undefined,
      vin: str(o.vin),
      licenseCategory: license === 'MTT1' || license === 'MTT2' ? license : undefined,
      beltMonthsAgo: num(o.beltMonthsAgo),
      segment: segment === 'citadine' || segment === 'compacte' || segment === 'suv' || segment === 'premium' || segment === 'moto' ? segment : undefined,
      publishedAt: published,
      location: str(o.location),
      source: str(o.source),
      url: str(o.url),
      lat: num(o.lat),
      lng: num(o.lng),
      zip: str(o.zip),
      distanceKm: num(o.distanceKm),
      zone: o.zone === 'prioritaire' || o.zone === 'france' ? o.zone : undefined,
    },
  };
}
