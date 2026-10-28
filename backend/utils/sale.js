/**
 * DOSSIER DE VENTE : une voiture à vendre (la tienne ou ton stock), comme un pro.
 *
 * Prix d'affichage et plancher tirés des comparables du radar, annonce honnête (ce qui est prouvé est dit
 * prouvé, le reste est dit tel quel), réponses types et check-list des papiers.
 * Sources des démarches :
 *   CT de moins de 6 mois pour vendre une voiture de plus de 4 ans : https://www.service-public.gouv.fr/particuliers/vosdroits/F16540
 *   Cession, code de cession, certificat de situation administrative, déclaration sous 15 jours :
 *     https://www.service-public.gouv.fr/particuliers/vosdroits/F1707
 *   Certificat de cession (cerfa 15776) : https://www.service-public.gouv.fr/particuliers/vosdroits/R20300
 */

import { MARKET_TRUTH } from '../config/rules.js';
import { engineSheet } from './maintenance.js';

const eur = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const km = (n) => `${Math.round(n).toLocaleString('fr-FR')} km`;
const round100 = (n) => Math.round(n / 100) * 100;
const MONTH_MS = 30.44 * 86_400_000;

/** Libellé d'une preuve d'entretien : ce qui est écrit dans l'annonce, sans jamais l'embellir. */
const PROOF = { facture: 'facture', etiquette: 'étiquette sur le moteur, sans facture', aucune: 'sans justificatif' };

/**
 * @typedef {{ label: string, km?: number|null, date?: string|null, proof: 'facture'|'etiquette'|'aucune' }} MaintenanceItem
 * @typedef {{
 *   brand: string, model: string, version?: string, year: number, firstRegistration?: string, mileage: number,
 *   fuel?: string, gearbox?: string, fiscalHp?: number, co2?: number, color?: string, options?: string[],
 *   maintenance?: MaintenanceItem[], invoicesSince?: string,
 *   bodywork?: { repaint?: boolean, reason?: string, invoice?: boolean, remainingDefects?: string },
 *   ctDate?: string|null, location?: string, reason?: string, coOwners?: number, firm?: boolean,
 * }} SaleInput
 */

/**
 * Prix conseillés à partir de la cote du radar (médiane des annonces comparables, pas l'Argus).
 * Affichage : cote + la négo habituelle de l'acheteur (3 à 8 %, MARKET_TRUTH.buyerDiscountRate, sourcé).
 * Plancher : quart bas des comparables (le prix sous lequel la plupart des annonces comparables ne descendent pas).
 * @param {{ price: number, low: number, high: number, comparables: number } | null} market
 * @param {boolean} [firm] prix ferme, sans négociation
 */
export function salePricing(market, firm = false) {
  if (!market) return null;
  return {
    market: market.price,
    // Prix ferme : affiché à la cote, sans marge de négociation.
    listed: round100(market.price * (firm ? 1 : 1 + MARKET_TRUTH.buyerDiscountRate)),
    floor: round100(Math.min(market.low, market.price)),
    comparables: market.comparables,
    range: [market.low, market.high],
  };
}

/**
 * @param {SaleInput} input
 * @param {{ market?: Parameters<typeof salePricing>[0], now?: Date }} [options]
 */
export function saleFile(input, options = {}) {
  const now = options.now ?? new Date();
  const pricing = salePricing(options.market ?? null, Boolean(input.firm));
  const name = [input.brand, input.model, input.version].filter(Boolean).join(' ');
  const sheet = engineSheet({ brand: input.brand, fuel: input.fuel, year: input.year, title: name, model: input.model });
  const warnings = [];
  const checklist = [];

  // --- Entretien : chaque ligne dit sa preuve ---
  const maintenance = input.maintenance ?? [];
  const lines = maintenance.map((m) => {
    const when = [m.km ? `à ${km(m.km)}` : null, m.date ? `en ${m.date}` : null].filter(Boolean).join(' ');
    return `• ${m.label}${when ? ` ${when}` : ''} (${PROOF[m.proof] ?? PROOF.aucune})`;
  });
  const belt = maintenance.find((m) => /distribution|courroie/i.test(m.label));
  if (belt && belt.proof !== 'facture') {
    warnings.push(
      input.firm
        ? 'Distribution sans facture : certains acheteurs la considéreront comme non faite. Avec un prix ferme, attends-toi à moins de contacts, ou à des acheteurs qui passent leur tour. Ne fabrique jamais de justificatif.'
        : 'Distribution sans facture : beaucoup d’acheteurs la considéreront comme non faite et négocieront dessus. Tiens ton prix plancher, ne fabrique jamais de justificatif.',
    );
  }
  if (!belt && sheet?.distribution?.type && sheet.distribution.type !== 'chaine') {
    warnings.push(`Moteur à ${sheet.distribution.type === 'courroie-humide' ? 'courroie humide' : 'courroie'} : l'acheteur demandera quand la distribution a été faite. ${sheet.label}.`);
  }

  // --- Carrosserie : la repeinte se dit, elle rassure quand elle est expliquée ---
  const body = input.bodywork ?? {};
  const bodyLines = [];
  if (body.repaint) {
    bodyLines.push(
      `🎨 Carrosserie repeinte par un professionnel${body.reason ? ` suite à ${body.reason}` : ''}${body.invoice ? ', facture à l’appui' : ''}. Aucun choc ni accident, mécanique non concernée.`,
    );
    warnings.push('Repeinte : un acheteur averti la repère (testeur d’épaisseur). Dis-la toi-même, la cacher expose à l’annulation de la vente (dol, Code civil art. 1137).');
  }
  if (body.remainingDefects) bodyLines.push(`🔎 ${body.remainingDefects}, visibles sur les photos et pris en compte dans le prix.`);

  // --- Contrôle technique ---
  const ageYears = (now.getTime() - new Date(input.firstRegistration ?? `${input.year}-01-01`).getTime()) / (365.25 * 86_400_000);
  const ctMonths = input.ctDate ? (now.getTime() - new Date(input.ctDate).getTime()) / MONTH_MS : null;
  const ctOk = ctMonths !== null && ctMonths < 6;
  if (ageYears > 4) {
    checklist.push(
      ctOk
        ? `Contrôle technique du ${new Date(input.ctDate).toLocaleDateString('fr-FR')} : valable pour la vente encore ${Math.max(0, Math.floor(6 - ctMonths))} mois environ.`
        : 'Faire le contrôle technique : il doit avoir moins de 6 mois le jour où l’acheteur fait sa carte grise.',
    );
  }

  // --- Papiers ---
  checklist.push(
    `Certificat de cession (cerfa 15776) en 2 exemplaires${input.coOwners && input.coOwners > 1 ? ', signé par chaque titulaire de la carte grise (vérifier la notice)' : ''}.`,
    'Code de cession à donner à l’acheteur (valable 15 jours).',
    'Certificat de situation administrative (non-gage) de moins de 15 jours.',
    'Barrer la carte grise : « Vendu le … à … h … », signer, remettre le coupon détachable.',
    'Déclarer la vente sur le site de l’ANTS dans les 15 jours.',
    'Photos : flouter la plaque, ne jamais publier la carte grise (nom, adresse, VIN).',
  );

  // --- Annonce ---
  const title = [name, `${input.year}`, km(input.mileage), belt ? 'Distribution faite' : null, ctOk || ageYears <= 4 ? 'CT OK' : null].filter(Boolean).join(' – ');
  const specs = [
    [input.fuel, input.version, input.gearbox].filter(Boolean).join(', '),
    input.fiscalHp ? `${input.fiscalHp} CV fiscaux` : null,
    input.co2 ? `${input.co2} g/km de CO₂ (carte grise)` : null,
    input.color ? `Couleur : ${input.color}` : null,
    input.options?.length ? `Équipements : ${input.options.join(', ')}` : null,
  ].filter(Boolean);
  const text = [
    `Je vends ma ${name}, ${input.firstRegistration ? `mise en circulation le ${new Date(input.firstRegistration).toLocaleDateString('fr-FR')}` : input.year}, ${km(input.mileage)}.`,
    '',
    ...(lines.length || input.invoicesSince ? ['✅ Entretien', ...lines, ...(input.invoicesSince ? [`• Factures d’entretien depuis ${input.invoicesSince}`] : []), ''] : []),
    '🚗 La voiture',
    ...specs.map((s) => `• ${s}`),
    '• Roule parfaitement, aucun voyant',
    '',
    ...(bodyLines.length ? [...bodyLines, ''] : []),
    `Contrôle technique de moins de 6 mois fourni. Visible${input.location ? ` à ${input.location}` : ''}, essai possible.${input.firm ? ' Prix ferme, non négociable.' : ' Légère négociation sur place.'}`,
    'Paiement par virement instantané ou chèque de banque vérifié.',
    ...(pricing ? ['', `Prix : ${eur(pricing.listed)}`] : []),
  ].join('\n');

  // --- Réponses types ---
  const replies = [
    { q: 'Toujours disponible ?', a: `Bonjour, oui elle est toujours disponible. Vous pouvez venir l'essayer${input.location ? ` à ${input.location}` : ''} : quel jour vous arrange ?` },
    {
      q: 'Dernier prix ?',
      a: input.firm
        ? 'Bonjour, le prix est ferme : il est fixé au prix du marché et tient compte de l’entretien à jour. Vous pouvez venir l’essayer quand vous voulez.'
        : 'Bonjour, le prix tient compte de l’entretien à jour. Je préfère en parler après l’essai, sur place : venez la voir, on trouvera un accord si elle vous plaît.',
    },
    { q: 'Pourquoi vous la vendez ?', a: input.reason ? `${input.reason}.` : '(à compléter : la vraie raison, en une phrase)' },
  ];
  if (body.repaint) replies.push({ q: 'Elle a été accidentée ?', a: `Non, aucun accident. Elle a été repeinte chez un carrossier${body.reason ? ` après ${body.reason}` : ''}${body.invoice ? ', j’ai la facture' : ''}. Vous pourrez le vérifier sur place.` });
  if (belt) replies.push({ q: 'Vous avez la facture de la distribution ?', a: belt.proof === 'facture' ? `Oui, faite à ${belt.km ? km(belt.km) : '…'}${belt.date ? ` en ${belt.date}` : ''}, facture disponible.` : `Elle a été faite à ${belt.km ? km(belt.km) : '…'}${belt.date ? ` en ${belt.date}` : ''}, il y a l’étiquette sur le moteur mais je n’ai pas la facture.` });

  if (!pricing) warnings.push('Pas assez d’annonces comparables dans le radar pour conseiller un prix : relève 5 à 6 annonces de particuliers similaires.');
  return { title, text, pricing, replies, checklist, warnings, engine: sheet ? { label: sheet.label, distribution: sheet.distribution } : null };
}
