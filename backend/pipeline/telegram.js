/**
 * Alerte Telegram : une PÉPITE ou une cible Mandat, avec le message vendeur prêt à copier.
 * L'envoi au vendeur reste un geste humain (LeBonCoin n'a pas d'API de messagerie et
 * bannit les envois automatisés) : tout le reste est automatique.
 */

import { PHOTO_CHECKLIST, inspectionLine } from '../utils/inspection.js';
import { adUrl } from '../utils/links.js';

const escape = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const eur = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;

/** Limite Telegram : 4 096 caractères par message. */
const MAX_LENGTH = 4096;

/**
 * @param {Extract<ReturnType<import('../utils/outreach.js').buildOutreachPayload>, { ok: true }>} payload
 * @param {{ comparables?: number, buyers?: { name: string, budgetMax: number }[], inspection?: any }} [context]
 */
export function formatTelegramAlert(payload, context = {}) {
  const { listing, scoring, negotiation, mandate, message } = payload;
  const head =
    payload.strategy === 'mandate'
      ? `🤝 <b>MANDAT J+${listing.daysOnline}</b> · revenu ${eur(mandate?.totalRevenue ?? 0)} · 0 € de trésorerie`
      : `${listing.priceDrop ? `📉 <b>BAISSE −${eur(listing.priceDrop.amount)}</b> · ` : ''}${scoring.masterclass ? '💎 <b>MASTERCLASS</b>' : '🔥 <b>PÉPITE</b>'} · marge réelle ${eur(scoring.realNetMargin)} · score ${scoring.score}/100`;

  const lines = [
    head,
    `<b>${escape(listing.title)}</b>`,
    `${listing.year} · ${listing.mileage.toLocaleString('fr-FR')} km · ${escape(listing.location ?? '')}`,
    `Prix ${eur(listing.price)} · marché ${eur(listing.marketPrice)}${context.comparables ? ` (médiane de ${context.comparables} annonces)` : ''}`,
  ];
  if (scoring.confidence) lines.push(`Fiabilité de la cote : <b>${escape(scoring.confidence.level)}</b> (${scoring.confidence.score}/100)`);
  if (typeof scoring.prudentMargin === 'number') lines.push(`Marge prudente (acheteur qui négocie ~5 %) : ${eur(scoring.prudentMargin)}`);
  if (scoring.localResale) {
    lines.push(`🏠 Revente chez toi : <b>${eur(scoring.localResale.price)}</b> (${scoring.localResale.comparables} annonces &lt; ${scoring.localResale.radiusKm} km) → marge <b>${eur(scoring.localResale.margin)}</b>`);
  }
  if (scoring.reasons?.length) lines.push(`<i>Pourquoi ce prix :</i> ${scoring.reasons.slice(0, 3).map(escape).join(' ')}`);
  if (payload.strategy === 'negotiation' && negotiation) {
    lines.push(`Offre : <b>${eur(negotiation.offerPrice)}</b> (−${eur(negotiation.discount)}) · marge négociée ${eur(scoring.negotiatedNetMargin)}`);
  }
  if (payload.strategy === 'mandate' && mandate) {
    lines.push(`Prix net vendeur ${eur(mandate.ownerNet)} · plus-value ${eur(mandate.commission)}`);
  }
  if (context.inspection) lines.push(escape(inspectionLine(context.inspection, listing.mileage)));
  else if (payload.strategy === 'negotiation') lines.push(`👀 <i>À regarder sur les photos :</i> ${PHOTO_CHECKLIST.map((c) => escape(c.split(' : ')[0].toLowerCase())).join(', ')}`);
  if (context.buyers?.length) {
    const shown = context.buyers.slice(0, 3).map((b) => `${escape(String(b.name).slice(0, 40))} (budget ${eur(b.budgetMax)})`);
    const more = context.buyers.length > 3 ? ` +${context.buyers.length - 3} autre(s)` : '';
    lines.push(`👥 <b>Acheteur(s) prêt(s)</b> : ${shown.join(', ')}${more}`);
  }
  const url = adUrl(listing);
  if (url) lines.push(`<a href="${escape(url)}">👉 Ouvrir l'annonce</a>`);
  lines.push('', '<b>Message à envoyer :</b>');

  // L'en-tête ne doit jamais dépasser la limite : le message vendeur garde au moins 600 caractères.
  // On retire des lignes de détail (jamais une balise coupée en deux) tant que l'en-tête est trop long.
  while (lines.length > 5 && lines.join('\n').length > MAX_LENGTH - 700) lines.splice(lines.length - 3, 1);
  const header = lines.join('\n');
  const room = MAX_LENGTH - header.length - 20;
  // Échappement d'abord, coupe ensuite : la longueur comptée est celle réellement envoyée.
  const escaped = escape(message.body);
  const body = escaped.length > room ? `${escaped.slice(0, room).replace(/&[a-z]*$/, '')}…` : escaped;
  return `${header}\n<pre>${body}</pre>`;
}

/**
 * @param {{ token: string, chatId: string, text: string, fetchImpl?: typeof fetch }} params
 */
export async function sendTelegram({ token, chatId, text, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
