/**
 * VENDABILITÉ : la voiture va-t-elle partir vite à la revente ?
 * Finition (entrée / intermédiaire / haute), options recherchées, couleur, annonce qui traîne.
 * Signaux sourcés dans backend/config/rules.js (SELLABILITY) : aucun montant, aucun effet sur la marge.
 */

import { SELLABILITY } from '../config/rules.js';
import { compact, normalize } from './text.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, word) => new RegExp(`(^|[^a-z0-9])${escapeRe(word)}($|[^a-z0-9])`).test(text);

/**
 * Niveau de finition lu dans le titre / la version : 'entree' | 'milieu' | 'haut' | null (inconnu).
 * Le niveau le plus haut l'emporte ("Cooper S" avant "Cooper", "GT Line" avant "Line").
 * @param {{ brand?: string, title?: string, version?: string }} listing
 */
export function trimOf(listing) {
  const tiers = SELLABILITY.trims[compact(listing.brand ?? '')];
  if (!tiers) return null;
  const text = normalize(`${listing.title ?? ''} ${listing.version ?? ''}`);
  for (const tier of /** @type {const} */ (['haut', 'milieu', 'entree'])) {
    const hit = [...tiers[tier]].sort((a, b) => b.length - a.length).find((w) => hasWord(text, normalize(w)));
    if (hit) return { tier, name: hit };
  }
  return null;
}

/** Couleur : attribut LeBonCoin, sinon "couleur : xxx" dans l'annonce. */
export function colorOf(listing) {
  if (listing.color) return normalize(String(listing.color));
  const m = normalize(`${listing.title ?? ''} ${listing.description ?? ''}`).match(/couleur\s*:?\s*([a-z]+(?: [a-z]+)?)/);
  return m ? m[1] : null;
}

const TIER_LABEL = { entree: "entrée de gamme", milieu: 'intermédiaire', haut: 'haute' };

/**
 * @param {import('./scoring.js').Listing} listing
 * @param {{ triggers?: { label: string }[], daysOnline?: number, reliability?: string[] }} [context]
 * @returns {{ level: 'facile'|'moyenne'|'difficile', trim: ReturnType<typeof trimOf>, color: string|null, points: { tone: 'good'|'warn'|'info', label: string }[] }}
 */
export function sellability(listing, context = {}) {
  /** @type {{ tone: 'good'|'warn'|'info', label: string }[]} */
  const points = [];
  const trim = trimOf(listing);
  if (trim?.tier === 'entree') points.push({ tone: 'warn', label: `Finition ${TIER_LABEL.entree} (${trim.name}) : souvent plus dure à revendre à bon prix (L'argus)` });
  if (trim?.tier === 'milieu') points.push({ tone: 'good', label: `Finition ${TIER_LABEL.milieu} (${trim.name}) : généralement la mieux placée à la revente (L'argus)` });
  if (trim?.tier === 'haut') points.push({ tone: 'good', label: `Finition ${TIER_LABEL.haut} (${trim.name}) : recherchée, mais son surcoût ne se récupère pas toujours (L'argus)` });
  if (!trim) points.push({ tone: 'info', label: 'Finition non reconnue : vérifie-la sur les photos (sellerie, jantes, écran)' });

  // Moteur à mauvaise réputation : les acheteurs le fuient, même s'il roule bien.
  for (const r of context.reliability ?? []) points.push({ tone: 'warn', label: r.replace(/ Exiger.*$/, '').replace(/\.$/, '') + ' : beaucoup d’acheteurs l’évitent' });

  for (const t of context.triggers ?? []) points.push({ tone: 'good', label: `Option recherchée : ${t.label}` });

  const color = colorOf(listing);
  if (color && SELLABILITY.colors.atypical.some((c) => color.includes(normalize(c)))) {
    points.push({ tone: 'warn', label: `Couleur ${color} : peu demandée, peut allonger la revente (guides du secteur)` });
  } else if (color && SELLABILITY.colors.neutral.some((c) => color.includes(normalize(c)))) {
    points.push({ tone: 'good', label: `Couleur ${color} : parmi les plus vendues` });
  }

  const marketDays = listing.marketStats?.daysOnMarket;
  const days = context.daysOnline ?? 0;
  if (marketDays && days > marketDays * SELLABILITY.staleRatio && days >= 15) {
    points.push({ tone: 'warn', label: `En ligne depuis ${days} j contre ~${marketDays} j pour les comparables : demande-toi pourquoi elle ne part pas (finition, état, prix)` });
  }

  const rivals = listing.competition;
  if (rivals && rivals.count >= SELLABILITY.rivalsWarn) {
    points.push({ tone: 'warn', label: `${rivals.count} annonces du même modèle, aussi récentes et moins kilométrées, affichées sous ton prix de revente (${rivals.resalePrice.toLocaleString('fr-FR')} €) : ton acheteur les verra` });
  } else if (rivals && rivals.count === 0) {
    points.push({ tone: 'good', label: 'Aucune annonce moins kilométrée sous ton prix de revente : peu de concurrence directe' });
  }

  // Un moteur à mauvaise réputation pèse double : il suffit à faire fuir une partie des acheteurs.
  const warns = points.filter((p) => p.tone === 'warn').length + (context.reliability?.length ?? 0);
  const goods = points.filter((p) => p.tone === 'good').length;
  const level = warns >= 2 || (trim?.tier === 'entree' && warns > goods) ? 'difficile' : warns > goods ? 'moyenne' : 'facile';
  return { level, trim, color, points };
}
