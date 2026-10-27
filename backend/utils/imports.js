/**
 * VÉHICULES IMPORTÉS : repérer dans l'annonce une voiture étrangère ou pas encore immatriculée en France.
 *
 * Un import cache des coûts que le prix affiché ne montre pas (homologation, douane, malus, carte grise)
 * et des papiers qui peuvent bloquer la carte grise française (846 A, certificat de conformité, RTI).
 * Les règles et montants par pays sont dans IMPORT_RULES (backend/config/rules.js), chacun sourcé.
 */

import { IMPORT_RULES } from '../config/rules.js';
import { findPattern, normalize } from './text.js';

/** Origine détectée dans le texte normalisé, la plus précise d'abord. */
const ORIGINS = [
  {
    id: 'usa',
    pattern:
      /import(e|ee|ation)? (des |direct )?(usa|us|etats[- ]unis|amerique)|(usa|us) import|carfax|autocheck|(modele|vehicule|origine) (d'origine )?nord[- ]americain|plaques? (us|usa|americaines?)|titre (us|americain)|\bclean title\b|\bmiles?\b.{0,20}(compteur|affiche)/,
  },
  { id: 'japon', pattern: /import(e|ee|ation)? (du |direct )?japon|\bjdm\b|(conduite|volant) a droite|origine japon|japon import/ },
  { id: 'allemagne', pattern: /import(e|ee|ation)? (d'|de l')?allemagne|plaques? allemandes?|immatricul(e|ee|ation) (en )?allemagne|\bausfuhr|vehicule allemand importe|origine allemagne/ },
  { id: 'ue', pattern: /import(e|ee|ation)? (d'|de l'|du |des )?(europe|union europeenne|belgique|espagne|italie|pays-bas|hollande|luxembourg|pologne)/ },
];

/** Signes que la carte grise française n'existe pas encore. */
const PAPERS_PENDING = /homologation (obligatoire|a prevoir|en cours|a faire|en sus|non incluse)|forfait homologation|carte grise (etrangere|en cours|a faire)|immatriculation (etrangere|en cours|definitive francaise)|plaques? (etrangeres?|export|provisoires?|ww)|\bquitus fiscal\b|\b846 ?a\b|pas de carte grise francaise/;

/** Kilométrage peut-être en miles (compteurs américains et britanniques). */
const MILES = /\b\d[\d .]* ?miles?\b|\bmiles?\b/;

/** Montant d'homologation écrit par le vendeur : "Forfait homologation : 4.500 € TTC". */
const QUOTED_HOMOLOGATION = /homologation[^0-9€]{0,40}(\d{1,2}(?:[ .]?\d{3})|\d{3,5}) ?(?:€|euros?)/;

/**
 * @param {{ title?: string, description?: string, brand?: string }} listing
 * @param {string} [text] texte normalisé (titre + description) si déjà calculé
 */
export function detectImport(listing, text = normalize(`${listing.title ?? ''} ${listing.description ?? ''}`)) {
  const origin = ORIGINS.find((o) => findPattern(text, o.pattern));
  const pending = findPattern(text, PAPERS_PENDING);
  if (!origin && !pending) return null;

  const quoted = text.match(QUOTED_HOMOLOGATION);
  const homologationQuoted = quoted ? Number(quoted[1].replace(/[ .]/g, '')) : null;
  const rules = IMPORT_RULES.origins[origin?.id ?? 'inconnue'] ?? IMPORT_RULES.origins.inconnue;
  return {
    origin: origin?.id ?? 'inconnue',
    label: rules.label,
    /** La carte grise française reste à faire (homologation, 846 A, plaques étrangères…). */
    papersPending: Boolean(pending) || rules.homologationRequired,
    /** Montant annoncé par le vendeur lui-même (pas une estimation de l'outil). */
    homologationQuoted: homologationQuoted && homologationQuoted >= 100 && homologationQuoted <= 20000 ? homologationQuoted : null,
    milesRisk: rules.milesRisk || Boolean(findPattern(text, MILES)),
    /** Malus : rien à payer si la 1re immatriculation (à l'étranger) date d'avant 2015 ; l'année du modèle sert d'indice. */
    malusFree: Number(listing.year) > 0 && Number(listing.year) < IMPORT_RULES.malusFreeBefore,
    papers: rules.papers,
    costs: rules.costs,
    sellerQuestions: rules.sellerQuestions,
  };
}

/** Avertissement lisible pour la fiche et Telegram. */
export function importWarning(imp) {
  const parts = [`Import ${imp.label}`];
  if (imp.homologationQuoted) parts.push(`homologation annoncée ${imp.homologationQuoted.toLocaleString('fr-FR')} € (déduite de la marge)`);
  else if (imp.papersPending) {
    const h = imp.costs?.homologation;
    parts.push(h ? `homologation à chiffrer (${h.min.toLocaleString('fr-FR')} à ${h.max.toLocaleString('fr-FR')} € selon les guides, travaux en plus)` : 'carte grise française à faire');
  }
  parts.push(
    imp.malusFree
      ? 'malus probablement nul (1re immatriculation avant 2015, à vérifier sur le titre)'
      : `malus possible jusqu'à ${IMPORT_RULES.malusCap.toLocaleString('fr-FR')} € avant décote (barème en CV sans réception UE)`,
  );
  parts.push('exiger un prix « carte grise française en main »');
  if (imp.milesRisk) parts.push('compteur peut-être en miles (× 1,609)');
  return `${parts.join(' · ')}. Pas de MASTERCLASS tant que les papiers ne sont pas chiffrés.`;
}
