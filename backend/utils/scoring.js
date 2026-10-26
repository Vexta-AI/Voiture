/**
 * MOTEUR DE SCORING & CALCUL DE MARGE
 *
 * Analyse une annonce Auto/Moto selon les règles strictes du cursus :
 *   1. Blacklist mécanique (moteurs poison + mots-clés rédhibitoires) -> REFUSE, score 0
 *   2. Options "déclencheurs" -> bonus de valeur perçue (+500 € à +1 000 €)
 *   3. Défauts détectés -> leviers de négociation (baisse de prix argumentée)
 *   4. Formule financière :
 *        Marge Brute  = Cote Marché Pro (+ bonus options) - Prix Affiché
 *        Marge Nette  = Marge Brute - 500 € (remise en état) - 200 € (capital risque)
 *        Marge réelle = Marge Nette - carte grise - assurance temporaire - annonce - trajet / rapatriement
 *   5. Statut : 🔥 PÉPITE POTENTIELLE / A SURVEILLER / REFUSE
 *   6. Éligibilité Dépôt-Vente / Mandat (annonce en ligne depuis plus de 14 jours)
 *
 * Fonction pure, sans dépendance réseau : utilisable côté client, serveur et tests.
 */

import {
  AUTO_TARGETS,
  BLACKLIST,
  BLACKLIST_KEYWORDS,
  BUDGETS,
  BUSINESS,
  COSTS,
  DOORS_RULE,
  LOGISTICS,
  MANDATE,
  MAX_TRIGGER_BONUS,
  MOTO_A2,
  MOTO_TARGETS,
  NEGOTIATION_LEVERS,
  OWNERSHIP_COSTS,
  MARKET_TRUTH,
  MASTERCLASS,
  PRICE_BANDS,
  PRICE_SIGNALS,
  QUALITY_SIGNALS,
  REGISTRATION,
  RURAL,
  SEASONALITY,
  SEGMENTS,
  SEGMENT_RULES,
  TESLA_RULES,
  VALUE_TRIGGERS,
} from '../config/rules.js';
import { distanceKm as gpsDistanceKm } from '../pipeline/geo.js';
import { offerPriceFor } from './messages.js';
import { sellability } from './sellability.js';
import { clamp, compact, findAnyKeyword, findPattern, normalize, parseDisplacement } from './text.js';

/**
 * @typedef {Object} Listing
 * @property {string} id
 * @property {'auto'|'moto'} type
 * @property {string} title
 * @property {string} brand
 * @property {string} model
 * @property {string} [version]
 * @property {string} [engine]        ex. "1.2 TCe 120", "1.0 TSI 95"
 * @property {string} [engineCode]    ex. "H5Ft", "DQ200"
 * @property {string} [gearbox]       ex. "Manuelle", "DSG7", "EDC"
 * @property {number} year
 * @property {number} mileage
 * @property {number} price           prix affiché (€)
 * @property {number} marketPrice     cote marché pro / prix plancher de revente (€)
 * @property {string} [description]
 * @property {string[]} [options]
 * @property {number} [doors]
 * @property {string} [fuel]           carburant
 * @property {number} [powerDin]       puissance DIN (ch)
 * @property {{ low: number, high: number, comparables: number, daysOnMarket: number|null, criteria?: string[] }} [marketStats] marché actuel (comparables)
 * @property {{ price: number, low: number, high: number, comparables: number, daysOnMarket: number|null, radiusKm: number }} [localMarket] revente chez toi
 * @property {number} [argusPrice]    cote Argus saisie à la main
 * @property {{ from: number, to: number, amount: number, since: string }} [priceDrop] baisse relevée par le radar
 * @property {{ previousId: string, firstSeenAt: string, previousPrice: number }} [repost] annonce republiée
 * @property {string[]} [photos]    photos de l'annonce
 * @property {number} [fiscalHp]       puissance fiscale (CV), base de la carte grise
 * @property {string} [vin]
 * @property {'MTT1'|'MTT2'} [licenseCategory]  moto : carte grise A2 (MTT1) ou Full (MTT2)
 * @property {number} [beltMonthsAgo] PureTech : ancienneté (mois) de la facture courroie + crépine
 * @property {'citadine'|'compacte'|'suv'|'premium'|'moto'} [segment] force le segment
 * @property {'prioritaire'|'france'} [zone] zone fixée à l'ingestion
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {number} [distanceKm]    distance à la base (annonces réelles) : rapatriement au-delà de la zone prioritaire
 * @property {string} publishedAt     ISO date de mise en ligne
 * @property {string} [location]
 * @property {string} [source]
 * @property {string} [url]
 * @property {string} [color]
 * @property {{ count: number, resalePrice: number, samples: { id: string, title: string, price: number, year: number, mileage: number, url: string|null }[] }} [competition]
 * @property {{ verdict: 'rassurant'|'a_verifier'|'suspect', summary: string, questions: string[] }} [inspection] inspection IA des photos (indicative)
 */

export const STATUS = /** @type {const} */ ({
  PEPITE: { key: 'PEPITE', label: '🔥 PÉPITE POTENTIELLE' },
  SURVEILLER: { key: 'SURVEILLER', label: 'A SURVEILLER' },
  REFUSE: { key: 'REFUSE', label: 'REFUSE' },
});

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers d'identification
// ---------------------------------------------------------------------------

/** Texte complet normalisé utilisé pour la détection (titre + fiche + description + options). */
export function listingText(listing) {
  return normalize(
    [
      listing.title,
      listing.brand,
      listing.model,
      listing.version,
      listing.engine,
      listing.engineCode,
      listing.gearbox,
      ...(listing.options ?? []),
      listing.description,
    ]
      .filter(Boolean)
      .join(' . '),
  );
}

export function brandKey(listing) {
  return compact(listing.brand);
}

export function daysOnline(listing, now = new Date()) {
  // Annonce republiée : le vendeur est en ligne depuis la première annonce, pas depuis la nouvelle.
  const start = listing.repost?.firstSeenAt && listing.repost.firstSeenAt < listing.publishedAt ? listing.repost.firstSeenAt : listing.publishedAt;
  const published = new Date(start).getTime();
  if (Number.isNaN(published)) return 0;
  return Math.max(0, Math.floor((now.getTime() - published) / DAY_MS));
}

export function classifySegment(listing) {
  if (listing.type === 'moto') return 'moto';
  if (listing.segment && SEGMENTS[listing.segment]) return listing.segment;
  const base = compact(`${listing.brand} ${listing.model}`);
  const withVersion = compact(`${listing.brand} ${listing.model} ${listing.version ?? ''}`);
  for (const rule of SEGMENT_RULES) {
    if (rule.patterns.some((p) => base.includes(p))) return rule.segment;
    if (rule.versionPatterns?.some((p) => withVersion.includes(p))) return rule.segment;
  }
  return 'compacte';
}

/** Tranche de budget de l'annonce (id de PRICE_BANDS) ou null si hors tranches. */
export function priceBand(listing) {
  const bands = PRICE_BANDS[listing.type] ?? [];
  return bands.find((b) => listing.price >= b.min && listing.price < b.max)?.id ?? bands.find((b) => listing.price === b.max)?.id ?? null;
}

/**
 * Zone et coût de rapatriement : 0 dans la zone prioritaire, billet + route au-delà.
 * @returns {{ zone: 'prioritaire'|'france'|null, distanceKm: number|null, transportCost: number }}
 */
export function logistics(listing) {
  if (typeof listing.distanceKm !== 'number') return { zone: null, distanceKm: null, transportCost: 0 };
  const d = Math.round(listing.distanceKm);
  // La zone fixée à l'ingestion (rayon HUNT_AREA) prime sur le rayon par défaut.
  const priority = listing.zone ? listing.zone === 'prioritaire' : d <= LOGISTICS.priorityRadiusKm;
  if (priority) return { zone: 'prioritaire', distanceKm: d, transportCost: 0 };
  return { zone: 'france', distanceKm: d, transportCost: Math.round((LOGISTICS.ticketCost + d * LOGISTICS.perKm) / 10) * 10 };
}

/** Cibles de chasse (onglets) auxquelles correspond l'annonce. */
export function matchTargets(listing) {
  const targets = listing.type === 'moto' ? MOTO_TARGETS : AUTO_TARGETS;
  const brand = brandKey(listing);
  const model = compact(`${listing.model} ${listing.version ?? ''}`);
  return targets
    .filter((t) => (!t.brands?.length || t.brands.some((b) => brand.includes(b))))
    .filter((t) => t.patterns.some((p) => model.includes(p)))
    .map((t) => t.id);
}

// ---------------------------------------------------------------------------
// 1. Blacklist mécanique
// ---------------------------------------------------------------------------

/**
 * Ancienneté (en mois) de la facture courroie/crépine PureTech, depuis la fiche
 * ou le texte ("courroie ... remplacée il y a 3 mois").
 * @returns {{status: 'recent'|'old'|'undated'|'none', months: number|null}}
 */
export function detectBeltHistory(listing, text) {
  if (typeof listing.beltMonthsAgo === 'number') {
    return {
      status: listing.beltMonthsAgo <= BLACKLIST.puretech.maxBeltAgeMonths ? 'recent' : 'old',
      months: listing.beltMonthsAgo,
    };
  }
  const mentions = /(courroie|distribution|crepine)/;
  if (!mentions.test(text)) return { status: 'none', months: null };

  const dated = text.match(/(courroie|distribution|crepine)[^.]{0,80}?(\d{1,2})\s*mois/);
  if (dated) {
    const months = Number(dated[2]);
    return { status: months <= BLACKLIST.puretech.maxBeltAgeMonths ? 'recent' : 'old', months };
  }
  const done = /(courroie|distribution|crepine)[^.]{0,40}(neuve|changee|remplacee|faite|refaite|effectuee)|(changement|remplacement|kit) (de la |du )?(courroie|distribution)/;
  if (done.test(text)) return { status: 'undated', months: null };
  return { status: 'none', months: null };
}

function checkBlacklist(listing, text) {
  /** @type {{id: string, label: string, reason: string, evidence?: string}[]} */
  const hits = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {null|{maxBuyPrice: number, belt: ReturnType<typeof detectBeltHistory>}} */
  let puretechCondition = null;
  const brand = brandKey(listing);
  const engineText = normalize(`${listing.engine ?? ''} ${listing.engineCode ?? ''} ${listing.version ?? ''} ${listing.title ?? ''}`);

  // Mots-clés rédhibitoires (auto & moto)
  for (const kw of BLACKLIST_KEYWORDS) {
    const evidence = findPattern(text, kw.pattern);
    if (evidence) {
      hits.push({ id: `kw-${kw.id}`, label: `Mot-clé rédhibitoire : "${kw.label}"`, reason: 'Refus immédiat : risque mécanique/administratif non chiffrable.', evidence });
    }
  }

  if (listing.type !== 'auto') return { hits, warnings, puretechCondition };

  // Renault 1.2 TCe H5Ft 2012-2018
  const tce = BLACKLIST.renaultTce;
  const isH5ftCode = /h5f/.test(engineText) || /h5f/.test(text);
  const is12Tce = /1[.,]2\s*(l\s*)?(16v\s*)?tce/.test(engineText) || /1[.,]2\s*tce/.test(text);
  if (tce.brands.some((b) => brand.includes(b)) && (isH5ftCode || (is12Tce && listing.year >= tce.yearFrom && listing.year <= tce.yearTo))) {
    hits.push({ id: tce.id, label: tce.label, reason: tce.reason });
  }

  // PureTech 1.2 avant 2023
  const pt = BLACKLIST.puretech;
  const isPuretech = /pure ?tech/.test(engineText) || /1[.,]2 pure ?tech/.test(text) || (brand.includes('opel') && /1[.,]2\s*turbo/.test(engineText));
  if (pt.brands.some((b) => brand.includes(b)) && isPuretech && listing.year < pt.beforeYear) {
    const belt = detectBeltHistory(listing, text);
    if (belt.status === 'none' || belt.status === 'old') {
      hits.push({
        id: pt.id,
        label: `${pt.label} sans historique de courroie récent`,
        reason: belt.status === 'old' ? `Facture courroie trop ancienne (${belt.months} mois > ${pt.maxBeltAgeMonths} mois). ${pt.reason}` : pt.reason,
      });
    } else {
      const maxBuyPrice = Math.floor(listing.marketPrice * (1 - pt.requiredDiscount));
      puretechCondition = { maxBuyPrice, belt };
      warnings.push(
        belt.status === 'recent'
          ? `PureTech : courroie + crépine faites il y a ${belt.months} mois. Achat uniquement à ${maxBuyPrice.toLocaleString('fr-FR')} € max (-30 % de la cote).`
          : `PureTech : courroie mentionnée SANS date. Exiger la facture courroie + crépine < 6 mois, achat à ${maxBuyPrice.toLocaleString('fr-FR')} € max (-30 %).`,
      );
    }
  }

  // VAG DSG7 à sec DQ200
  const dq = BLACKLIST.dq200;
  if (dq.brands.some((b) => brand.includes(b))) {
    const gearText = normalize(`${listing.gearbox ?? ''} ${listing.engineCode ?? ''} ${listing.version ?? ''} ${listing.title ?? ''}`);
    const explicitDq200 = /dq ?200|0am/.test(gearText) || /dq ?200/.test(text);
    const isDsg7 = /(dsg|s[ -]?tronic)\s*-?\s*7|7\s*rapports|dsg7|7 vitesses/.test(gearText) || /(dsg|s[ -]?tronic)\s*-?\s*7/.test(text);
    const isDsg = /dsg|s[ -]?tronic/.test(gearText);
    const displacement = parseDisplacement(listing.engine ?? listing.version ?? listing.title);
    const smallEngine = displacement !== null && displacement <= dq.maxDisplacement;
    // Mention explicite d'une boîte à bain d'huile (DQ381 / DQ250 / DQ500) : jamais de refus par déduction.
    const isWet = dq.wetPattern.test(gearText) || dq.wetPattern.test(text);
    if (explicitDq200 || (isDsg7 && smallEngine && !isWet)) {
      hits.push({ id: dq.id, label: dq.label, reason: dq.reason });
    } else if (isDsg && (smallEngine || displacement === null) && !isWet) {
      warnings.push('Boîte DSG/S tronic sur petit moteur : vérifier le code boîte (DQ200 à sec = blacklist).');
    }
  }

  return { hits, warnings, puretechCondition };
}

// ---------------------------------------------------------------------------
// 2. Options déclencheurs
// ---------------------------------------------------------------------------

function detectTriggers(listing, text) {
  /** @type {{id: string, label: string, bonus: number, evidence?: string}[]} */
  const triggers = [];
  /** @type {string[]} */
  const insights = [];

  for (const trig of VALUE_TRIGGERS[listing.type] ?? []) {
    const evidence = findAnyKeyword(text, trig.keywords);
    if (evidence) triggers.push({ id: trig.id, label: trig.label, bonus: trig.bonus, evidence });
  }

  if (listing.type === 'auto' && brandKey(listing).includes('tesla')) {
    const vin = String(listing.vin ?? '').trim().toUpperCase();
    if (vin.startsWith(TESLA_RULES.shanghaiVinPrefix)) {
      triggers.push({ id: TESLA_RULES.shanghai.id, label: TESLA_RULES.shanghai.label, bonus: TESLA_RULES.shanghai.bonus, evidence: vin });
      for (const key of /** @type {const} */ (['lfp', 'ryzen'])) {
        const rule = TESLA_RULES[key];
        const evidence = findAnyKeyword(text, rule.keywords);
        if (evidence) triggers.push({ id: rule.id, label: rule.label, bonus: rule.bonus, evidence });
      }
    } else if (vin) {
      insights.push(`VIN ${vin.slice(0, 3)}… : version non Shanghai (Fremont 5YJ / Berlin XP7). Pas de bonus Shanghai.`);
    } else {
      insights.push('Tesla : demander le VIN pour confirmer une version Shanghai (préfixe LRW), LFP et Ryzen.');
    }
  }

  if (listing.type === 'moto') {
    const isMtt1 = String(listing.licenseCategory ?? '').toUpperCase() === 'MTT1';
    const evidence = isMtt1 ? 'carte grise MTT1' : findAnyKeyword(text, MOTO_A2.keywords);
    if (evidence) {
      triggers.push({ id: MOTO_A2.id, label: MOTO_A2.label, bonus: MOTO_A2.bonus, evidence });
      insights.push(isMtt1 ? 'MTT1 (A2) : cible jeunes permis, liquidité maximale. Débridage possible pour revente Full (MTT2).' : 'Kit bridage A2 disponible : double marché A2 + Full à la revente.');
    } else if (String(listing.licenseCategory ?? '').toUpperCase() === 'MTT2') {
      insights.push('MTT2 (Full) sans kit bridage : marché A2 fermé. Chiffrer un kit bridage pour élargir la cible.');
    }
  }

  const rawBonus = triggers.reduce((sum, t) => sum + t.bonus, 0);
  const bonus = Math.min(rawBonus, MAX_TRIGGER_BONUS);
  if (rawBonus > MAX_TRIGGER_BONUS) insights.push(`Bonus options plafonné à ${MAX_TRIGGER_BONUS} € (règle d'or : viser la moyenne du marché).`);
  return { triggers, bonus, insights };
}

// ---------------------------------------------------------------------------
// 3. Leviers de négociation
// ---------------------------------------------------------------------------

function detectLevers(listing, text) {
  return NEGOTIATION_LEVERS.filter((lever) => !lever.vehicleType || lever.vehicleType === listing.type)
    .map((lever) => {
      const evidence = findAnyKeyword(text, lever.keywords);
      return evidence ? { id: lever.id, label: lever.label, discount: lever.discount, realCost: lever.realCost, argument: lever.argument, evidence } : null;
    })
    .filter((l) => l !== null);
}

// ---------------------------------------------------------------------------
// 4. Mandat / Dépôt-Vente
// ---------------------------------------------------------------------------

/**
 * Économie d'un mandat de dépôt-vente (zéro trésorerie).
 * Le propriétaire touche un PRIX NET garanti ; le pro se rémunère sur la
 * plus-value au-dessus de ce prix net (commission = prix de vente - prix net).
 * Le prix de vente visé est la cote pro (règle d'or : la moyenne du marché).
 * @param {Listing} listing
 */
export function computeMandate(listing) {
  const salePrice = listing.marketPrice;
  const ownerNet = Math.min(listing.price, salePrice - MANDATE.commission.minSpread);
  const commission = salePrice - ownerNet;
  const upsells = MANDATE.upsells.map((u) => ({ ...u, margin: u.price - u.cost }));
  const upsellMargin = upsells.reduce((sum, u) => sum + u.margin, 0);
  const upsellBilled = upsells.reduce((sum, u) => sum + u.price, 0);
  // Micro : cotisations sur ce que tu factures (commission + upsells), au taux des prestations commerciales.
  const socialCharges = BUSINESS.status === 'micro' ? Math.round((commission + upsellBilled) * BUSINESS.servicesSocialRate) : 0;
  return {
    salePrice,
    ownerNet,
    commission,
    minSpread: MANDATE.commission.minSpread,
    upsells,
    upsellMargin,
    upsellBilled,
    socialCharges,
    grossRevenue: commission + upsellMargin,
    /** Ce qui te reste : commission + marge des upsells − cotisations micro. */
    totalRevenue: commission + upsellMargin - socialCharges,
    /** 0 = le propriétaire touche son prix affiché ; négatif = prix net à négocier sous l'annonce. */
    ownerGainVsAd: ownerNet - listing.price,
    cashRequired: 0,
    exclusivityDays: MANDATE.exclusivityDays,
    withdrawalPenalty: MANDATE.withdrawalPenalty,
  };
}

// ---------------------------------------------------------------------------
// 5. Scoring principal
/**
 * Pourquoi ce prix ? Lecture de l'écart à la cote et du texte de l'annonce :
 * vendeur pressé (bonne affaire réelle) ou défaut caché (prix bas justifié).
 * @returns {{ gapRate: number, motivated: {id: string, label: string, evidence: string}[], risks: {id: string, label: string, evidence: string}[], reasons: string[] }}
 */
export function priceReasons(listing, text, online, now = new Date()) {
  const market = Number(listing.marketPrice) || 0;
  const gapRate = market > 0 ? (market - listing.price) / market : 0;
  const hits = (rules) =>
    rules.flatMap((r) => {
      const evidence = findPattern(text, r.pattern);
      return evidence ? [{ id: r.id, label: r.label, evidence }] : [];
    });
  const motivated = hits(PRICE_SIGNALS.motivated);
  if (listing.repost) {
    motivated.unshift({
      id: 'republiee',
      label: 'Annonce republiée',
      evidence: `même voiture déjà en ligne depuis le ${new Date(listing.repost.firstSeenAt).toLocaleDateString('fr-FR')} (à ${listing.repost.previousPrice.toLocaleString('fr-FR')} €)`,
    });
  }
  // Baisse de prix relevée par le radar : le signal le plus fiable d'un vendeur qui veut vendre.
  if (listing.priceDrop) {
    const since = new Date(listing.priceDrop.since).toLocaleDateString('fr-FR');
    motivated.unshift({ id: 'baisse', label: 'Prix déjà baissé', evidence: `${listing.priceDrop.from.toLocaleString('fr-FR')} € → ${listing.priceDrop.to.toLocaleString('fr-FR')} € depuis le ${since}` });
  }
  const risks = hits(PRICE_SIGNALS.risks);
  const reasons = [];
  if (gapRate >= PRICE_SIGNALS.bigGapRate) reasons.push(`${Math.round(gapRate * 100)} % sous la cote du marché.`);
  else if (gapRate > 0) reasons.push(`${Math.round(gapRate * 100)} % sous la cote : petite décote, la marge se fera à la négo.`);
  for (const m of motivated) reasons.push(`Vendeur pressé : ${m.label.toLowerCase()} (« ${m.evidence} »).`);
  const age = Math.max(1, now.getFullYear() - Number(listing.year));
  const perYear = listing.mileage ? Math.round(listing.mileage / age) : 0;
  if (perYear > PRICE_SIGNALS.highMileagePerYear) reasons.push(`Gros rouleur : ${perYear.toLocaleString('fr-FR')} km/an, la décote est en partie normale.`);
  if (online >= MANDATE.minDaysOnline) reasons.push(`En ligne depuis ${online} jours : vendeur lassé.`);
  if (/pro/i.test(String(listing.source ?? ''))) reasons.push('Vendeur professionnel : prix souvent déjà travaillé, garantie à exiger.');
  for (const r of risks) reasons.push(`⚠️ ${r.label} : « ${r.evidence} ». Le prix bas s'explique peut-être, vérifier avant de bouger.`);
  if (gapRate >= PRICE_SIGNALS.bigGapRate && motivated.length === 0 && risks.length === 0) {
    reasons.push("Aucune raison donnée dans l'annonce : demander au vendeur pourquoi il vend, et regarder les photos de près.");
  }
  return { gapRate, motivated, risks, reasons };
}

/** Nombre de propriétaires annoncé ("première main", "2 propriétaires") ; null si non dit. */
export function ownersCount(text) {
  const words = { premiere: 1, '1ere': 1, '1re': 1, '1er': 1, deuxieme: 2, seconde: 2, '2eme': 2, '2e': 2, troisieme: 3, '3eme': 3, '3e': 3, un: 1, une: 1, deux: 2, trois: 3, quatre: 4 };
  const main = text.match(/\b(premiere|1ere|1re|deuxieme|seconde|2eme|2e|troisieme|3eme|3e) main\b/);
  if (main) return words[main[1]];
  const owners = text.match(/\b(\d|un|une|deux|trois|quatre|1er) (seul )?(proprietaires?|proprio)\b/);
  if (owners) return words[owners[1]] ?? Number(owners[1]);
  if (/\bunique proprietaire|seul proprietaire\b/.test(text)) return 1;
  return null;
}

/**
 * Points forts : factures, carnet, révision, distribution, propriétaires…
 * @returns {{ owners: number|null, hits: { id: string, label: string, evidence: string }[], points: number }}
 */
export function qualitySignals(text) {
  const hits = QUALITY_SIGNALS.items.flatMap((q) => {
    const evidence = findPattern(text, q.pattern);
    return evidence ? [{ id: q.id, label: q.label, evidence }] : [];
  });
  const owners = ownersCount(text);
  if (owners !== null && owners <= 2) hits.unshift({ id: 'owners', label: owners === 1 ? '1ère main' : '2 propriétaires', evidence: '' });
  return { owners, hits, points: Math.min(QUALITY_SIGNALS.maxPoints, hits.length * QUALITY_SIGNALS.pointsEach) };
}

/**
 * Campagne ou ville : distance à la grande ville la plus proche (GPS requis).
 * @returns {{ type: 'campagne'|'ville'|null, nearestCity: string|null, cityKm: number|null }}
 */
export function areaType(listing) {
  if (typeof listing.lat !== 'number' || typeof listing.lng !== 'number') return { type: null, nearestCity: null, cityKm: null };
  let best = { name: '', km: Infinity };
  for (const city of RURAL.cities) {
    const km = gpsDistanceKm(listing, city);
    if (km < best.km) best = { name: city.name, km };
  }
  return { type: best.km > RURAL.minKm ? 'campagne' : 'ville', nearestCity: best.name, cityKm: Math.round(best.km) };
}

/**
 * Frais de détention et de revente : assurance pendant le délai de vente, annonce, déplacement.
 * @returns {{ insurance: number, holdingDays: number, adFee: number, visit: number, total: number }}
 */
export function ownershipCosts(listing, geo) {
  const days = listing.marketStats?.daysOnMarket ?? OWNERSHIP_COSTS.minHoldingDays;
  const holdingDays = clamp(Math.round(days), OWNERSHIP_COSTS.minHoldingDays, OWNERSHIP_COSTS.maxHoldingDays);
  const insurance = Math.round((holdingDays * OWNERSHIP_COSTS.insurancePerDay) / 10) * 10;
  // Hors zone, le rapatriement couvre déjà le voyage.
  const visit = geo.zone === 'prioritaire' && geo.distanceKm ? Math.round((geo.distanceKm * 2 * OWNERSHIP_COSTS.visitPerKm) / 10) * 10 : 0;
  const adFee = OWNERSHIP_COSTS.adFee;
  return { insurance, holdingDays, adFee, visit, total: insurance + adFee + visit };
}

/**
 * Coût de la carte grise à l'achat : chevaux fiscaux × tarif régional (÷ 2 au-delà de 10 ans) + frais fixes.
 * 0 € en statut pro (déclaration d'achat + W garage).
 * @returns {{ cost: number, cv: number, estimatedCv: boolean, halved: boolean, status: 'particulier'|'pro' }}
 */
export function registrationCost(listing, segment, now = new Date()) {
  const fiscal = Number(listing.fiscalHp);
  const estimatedCv = !(fiscal >= 1 && fiscal <= 60);
  const cv = estimatedCv ? REGISTRATION.defaultCv[segment] ?? REGISTRATION.defaultCv.compacte : Math.round(fiscal);
  // Seule l'année est connue : demi-tarif seulement quand les 10 ans sont dépassés à coup sûr.
  const halved = now.getFullYear() - Number(listing.year) > REGISTRATION.oldVehicleYears;
  if (REGISTRATION.status === 'pro') return { cost: 0, cv, estimatedCv, halved, status: REGISTRATION.status };
  const regional = cv * REGISTRATION.pricePerCv * (halved ? REGISTRATION.oldVehicleDiscount : 1);
  return { cost: Math.round(regional + REGISTRATION.fixedFees), cv, estimatedCv, halved, status: REGISTRATION.status };
}

// ---------------------------------------------------------------------------

/**
 * @param {Listing} listing
 * @param {{ now?: Date }} [options]
 */
export function scoreListing(listing, options = {}) {
  const now = options.now ?? new Date();
  const text = listingText(listing);
  const segment = classifySegment(listing);
  const segmentRule = SEGMENTS[segment];
  const threshold = segmentRule.pepiteThreshold;
  const budget = BUDGETS[listing.type] ?? BUDGETS.auto;
  const online = daysOnline(listing, now);

  const blacklist = checkBlacklist(listing, text);
  const { triggers, bonus: triggersBonus, insights: triggerInsights } = detectTriggers(listing, text);
  const levers = detectLevers(listing, text);
  const warnings = [...blacklist.warnings];
  const insights = [...triggerInsights];

  // --- Formule financière (stricte) ---
  const askingPrice = Number(listing.price) || 0;
  const marketPrice = Number(listing.marketPrice) || 0;
  // Règle d'or : la marge se calcule sur la cote pro seule. Les options sont un potentiel, jamais acquis.
  const grossMargin = marketPrice - askingPrice;
  const fixedCosts = COSTS.RECONDITIONING_BASE + COSTS.RISK_CAPITAL;
  const netMargin = grossMargin - fixedCosts;
  /** Valeur perçue avec options déclencheurs (argument de revente, hors statut). */
  const resaleValue = marketPrice + triggersBonus;
  const netMarginWithOptions = netMargin + triggersBonus;
  // Achat à distance : le rapatriement est déduit avant de parler de pépite, comme la carte grise.
  const geo = logistics(listing);
  const registration = registrationCost(listing, segment, now);
  const registrationFee = registration.cost;
  const ownership = ownershipCosts(listing, geo);
  // Micro : 12,3 % du prix de revente part en cotisations (calculées sur le CA, pas sur la marge).
  const socialCharges = BUSINESS.status === 'micro' ? Math.round(marketPrice * BUSINESS.salesSocialRate) : 0;
  const purchaseCosts = geo.transportCost + registrationFee + ownership.total + socialCharges;
  /** Ce qui reste vraiment dans la poche : la base du statut PÉPITE. */
  const realNetMargin = netMargin - purchaseCosts;

  // --- Scénario négocié (leviers + coût réel des défauts) ---
  const leversTotal = levers.reduce((sum, l) => sum + l.discount, 0);
  const leversRealCost = levers.reduce((sum, l) => sum + l.realCost, 0);
  // Prix cible = l'offre réellement envoyée au vendeur (même calcul que le message de négo).
  const targetPrice = offerPriceFor({ price: askingPrice, leversTotal, daysOnline: online, puretechMaxBuy: blacklist.puretechCondition?.maxBuyPrice ?? null });
  const negotiatedNetMargin = marketPrice - targetPrice - fixedCosts - leversRealCost - purchaseCosts;
  /** Prix d'achat maximum pour atteindre le seuil PÉPITE (marge réelle strictement supérieure au seuil). */
  const maxBuyPriceForPepite = marketPrice - fixedCosts - threshold - 1 - purchaseCosts;
  /** Prix au-delà duquel l'opération ne rapporte plus rien : on ne monte jamais au-dessus. */
  const walkAwayPrice = marketPrice - fixedCosts - purchaseCosts;

  // --- Contexte marché ---
  const inBudget = askingPrice >= budget.min && askingPrice <= budget.max;
  if (!inBudget) warnings.push(`Hors budget de chasse ${listing.type} (${budget.min.toLocaleString('fr-FR')} € - ${budget.max.toLocaleString('fr-FR')} €).`);

  if (listing.type === 'auto' && segment === 'citadine' && listing.doors) {
    if (listing.doors <= 3) {
      warnings.push(`3 portes : valeur inférieure de ${DOORS_RULE.valueGap[0]} € à ${DOORS_RULE.valueGap[1]} € vs 5 portes, revente plus lente. Vérifier que la cote utilisée est celle de la 3p.`);
    } else if (listing.doors >= DOORS_RULE.preferred) {
      insights.push('5 portes : la version la plus liquide du segment.');
    }
  }

  if (listing.type === 'moto') {
    const month = now.getMonth() + 1;
    const season = SEASONALITY.moto;
    if (season.buyMonths.includes(month)) {
      const winterTarget = Math.round(marketPrice * (1 - season.winterDiscount));
      insights.push(`Fenêtre d'achat hiver : viser ${winterTarget.toLocaleString('fr-FR')} € (-20 % cote) pour revente au printemps.`);
    } else if (season.sellMonths.includes(month)) {
      insights.push('Saison de revente (printemps) : demande au plus haut, rotation rapide.');
    }
    insights.push("Comparer avec l'Italie / la Belgique : écart de prix exploitable à l'import.");
  }

  if (geo.zone === 'france') {
    warnings.push(`Achat à distance (${geo.distanceKm} km) : rapatriement ≈ ${geo.transportCost.toLocaleString('fr-FR')} € déduit de la marge. Mandat impossible.`);
  }
  const area = areaType(listing);
  if (area.type === 'campagne') {
    insights.push(`🌾 Annonce de campagne (${area.cityKm} km de ${area.nearestCity}) : moins de concurrence d'acheteurs, prix souvent plus bas. Achète ici, revends à Bordeaux.`);
  }
  if (registrationFee > 0) {
    insights.push(
      `Carte grise à ton nom ≈ ${registrationFee} € (${registration.cv} CV${registration.estimatedCv ? ' estimés' : ''}${registration.halved ? ', -50 % plus de 10 ans' : ''}) déduite de la marge. En pro (W garage) : 0 €.`,
    );
  }
  if (online >= MANDATE.minDaysOnline && geo.zone !== 'france') {
    insights.push(`En ligne depuis ${online} jours : vendeur fatigué par les curieux, levier de négo et cible Mandat.`);
  }

  // --- Statut ---
  const isBlacklisted = blacklist.hits.length > 0;
  const puretechOverpriced = blacklist.puretechCondition !== null && askingPrice > blacklist.puretechCondition.maxBuyPrice;
  /** @type {typeof STATUS[keyof typeof STATUS]} */
  let status;
  if (isBlacklisted) status = STATUS.REFUSE;
  else if (realNetMargin > threshold && !puretechOverpriced) status = STATUS.PEPITE;
  else if (realNetMargin > 0 || negotiatedNetMargin > 0) status = STATUS.SURVEILLER;
  else status = STATUS.REFUSE;

  // --- Pourquoi ce prix ? & MASTERCLASS ---
  const why = priceReasons(listing, text, online, now);
  const quality = qualitySignals(text);
  if (quality.owners !== null && quality.owners >= 4) warnings.push(`${quality.owners} propriétaires : historique chargé, décote à la revente.`);
  const stats = listing.marketStats;
  const isEv = MARKET_TRUTH.evPattern.test(text);
  const slowDays = isEv ? MARKET_TRUTH.evSlowDays : MARKET_TRUTH.slowDays;
  if (stats?.daysOnMarket !== null && stats?.daysOnMarket !== undefined) {
    insights.push(
      stats.daysOnMarket >= slowDays
        ? `Marché lent : les ${stats.comparables} annonces similaires sont en ligne depuis ${stats.daysOnMarket} jours (médiane), au-delà de la moyenne leboncoin (${slowDays} j). Prévoir du temps pour revendre.`
        : `Délai de revente : annonces similaires en ligne depuis ${stats.daysOnMarket} jours (médiane ; moyenne leboncoin ≈ ${slowDays} j${isEv ? ' en électrique' : ''}).`,
    );
  } else if (isEv) {
    insights.push(`Électrique : délai de revente moyen ≈ ${MARKET_TRUTH.evSlowDays} jours sur leboncoin (L'argus 2025), contre ~90 j en thermique.`);
  }
  // Revente chez toi : la marge réelle si tu revends au prix des annonces de ta zone.
  const local = listing.localMarket ?? null;
  // Cotisations micro recalculées sur le prix de revente local (elles portent sur le CA réellement encaissé).
  const localSocialCharges = local && BUSINESS.status === 'micro' ? Math.round(local.price * BUSINESS.salesSocialRate) : socialCharges;
  const localMargin = local ? local.price - askingPrice - fixedCosts - (purchaseCosts - socialCharges + localSocialCharges) : null;
  // Marge prudente : ton acheteur négociera aussi (3 à 8 % selon le secteur) sur le prix de revente.
  const resaleBase = local?.price ?? marketPrice;
  const buyerDiscount = Math.round((resaleBase * MARKET_TRUTH.buyerDiscountRate) / 50) * 50;
  const prudentMargin = (localMargin ?? realNetMargin) - buyerDiscount;
  if (local && localMargin !== null) {
    insights.push(
      `Revente chez toi (${local.comparables} annonces à moins de ${local.radiusKm} km) : ${local.price.toLocaleString('fr-FR')} € → marge réelle ${localMargin >= 0 ? '+' : ''}${localMargin.toLocaleString('fr-FR')} €.`,
    );
  }
  if (listing.argusPrice) {
    const gap = Math.round(((listing.argusPrice - marketPrice) / listing.argusPrice) * 100);
    insights.push(`Cote Argus ${listing.argusPrice.toLocaleString('fr-FR')} € : le marché actuel est ${gap >= 0 ? `${gap} % en dessous` : `${-gap} % au-dessus`}.`);
  }
  const confidence = listing.marketStats?.confidence ?? null;
  if (confidence?.level === 'faible' && status.key === 'PEPITE') {
    warnings.push(`Cote peu fiable (${listing.marketStats?.comparables} comparables, prix dispersés à ${confidence.spreadPct} %) : vérifie les annonces comparées avant de bouger. Pas d'alerte.`);
  }
  const masterclass =
    status.key === 'PEPITE' &&
    // MASTERCLASS : seulement sur une cote très fiable.
    (confidence === null || confidence.level === 'haute') &&
    realNetMargin >= threshold * MASTERCLASS.marginMultiplier &&
    why.risks.length === 0 &&
    marketPrice > 0 &&
    askingPrice >= marketPrice * MASTERCLASS.minPriceRate &&
    // Le marché de ta zone doit confirmer : revendue chez toi, l'affaire reste au-dessus du seuil.
    (localMargin === null || localMargin > threshold);
  if (status.key === 'PEPITE' && localMargin !== null && localMargin <= threshold) {
    warnings.push(`Chez toi, ça se revend moins cher (${local?.price.toLocaleString('fr-FR')} €) : marge locale ${localMargin.toLocaleString('fr-FR')} €, sous le seuil pépite.`);
  }
  if (why.risks.length > 0 && status.key === 'PEPITE') warnings.push(`Prix bas possiblement justifié : ${why.risks.map((r) => r.label).join(', ')}.`);

  // --- Score 0-100 ---
  let score = 0;
  if (!isBlacklisted) {
    const marginPts = clamp((realNetMargin / threshold) * 50, 0, 70);
    const triggerPts = clamp(triggersBonus / 100, 0, 10);
    const leverPts = clamp(leversTotal / 100, 0, 10);
    const agePts = online >= MANDATE.minDaysOnline ? 5 : 0;
    const ruralPts = area.type === 'campagne' ? RURAL.scoreBonus : 0;
    const qualityPts = quality.points;
    const liquidityPts = listing.type === 'auto' && segment === 'citadine' && (listing.doors ?? 5) >= 5 ? 5 : listing.type === 'moto' && triggers.some((t) => t.id === MOTO_A2.id) ? 5 : 0;
    // Le rapatriement est déjà déduit de la marge : son avertissement ne pénalise pas deux fois.
    // Idem pour le hors budget : son avertissement ne compte pas, seule la pénalité de 10 points s'applique.
    let penalties = (warnings.length - (geo.zone === 'france' ? 1 : 0) - (inBudget ? 0 : 1)) * 5;
    if (puretechOverpriced) penalties += 15;
    if (!inBudget) penalties += 10;
    score = Math.round(clamp(marginPts + triggerPts + leverPts + agePts + ruralPts + qualityPts + liquidityPts - penalties, 0, 100));
    if (status.key === 'REFUSE') score = Math.min(score, 20);
    if (masterclass) score = Math.min(100, score + MASTERCLASS.scoreBonus);
  }

  // Le dépôt-vente suppose de récupérer le véhicule : zone prioritaire uniquement.
  const mandateEligible = online >= MANDATE.minDaysOnline && !isBlacklisted && geo.zone !== 'france';

  return {
    listingId: listing.id,
    status,
    masterclass,
    priceReasons: why,
    sellability: sellability(listing, { triggers, daysOnline: online }),
    quality,
    prudent: { margin: prudentMargin, buyerDiscount, slowDays, isEv },
    local: local && localMargin !== null ? { ...local, margin: localMargin } : null,
    market: stats ? { ...stats, argus: listing.argusPrice ?? null } : listing.argusPrice ? { argus: listing.argusPrice } : null,
    score,
    segment,
    segmentLabel: segmentRule.label,
    priceBand: priceBand(listing),
    zone: geo.zone,
    distanceKm: geo.distanceKm,
    areaType: area.type,
    nearestCity: area.nearestCity,
    cityKm: area.cityKm,
    threshold,
    targets: matchTargets(listing),
    daysOnline: online,
    blacklist: blacklist.hits,
    puretechCondition: blacklist.puretechCondition,
    triggers,
    levers,
    warnings,
    insights,
    budget: { ...budget, inRange: inBudget },
    finance: {
      askingPrice,
      marketPrice,
      triggersBonus,
      resaleValue,
      grossMargin,
      netMarginWithOptions,
      transportCost: geo.transportCost,
      registrationCost: registrationFee,
      ownership,
      socialCharges,
      registration,
      realNetMargin,
      reconditioning: COSTS.RECONDITIONING_BASE,
      riskCapital: COSTS.RISK_CAPITAL,
      netMargin,
      leversTotal,
      leversRealCost,
      targetPrice,
      negotiatedNetMargin,
      maxBuyPriceForPepite,
      walkAwayPrice,
      targetNetMargin: segmentRule.targetNetMargin,
    },
    mandateEligible,
    mandate: mandateEligible ? computeMandate(listing) : null,
  };
}

/**
 * Score et trie une liste d'annonces (meilleur score d'abord).
 * @param {Listing[]} listings
 * @param {{ now?: Date }} [options]
 */
export function scoreListings(listings, options = {}) {
  return listings
    .map((listing) => ({ listing, analysis: scoreListing(listing, options) }))
    .sort((a, b) => b.analysis.score - a.analysis.score || b.analysis.finance.netMargin - a.analysis.finance.netMargin);
}
