/**
 * Alerte Telegram : une PÉPITE ou une cible Mandat, avec le message vendeur prêt à copier.
 * L'envoi au vendeur reste un geste humain (LeBonCoin n'a pas d'API de messagerie et
 * bannit les envois automatisés) : tout le reste est automatique.
 */

import { adUrl } from '../utils/links.js';

const escape = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const eur = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;

/** Limite Telegram : 4 096 caractères par message. */
const MAX_LENGTH = 4096;

/**
 * @param {Extract<ReturnType<import('../utils/outreach.js').buildOutreachPayload>, { ok: true }>} payload
 * @param {{ comparables?: number }} [context]
 */
export function formatTelegramAlert(payload, context = {}) {
  const { listing, scoring, negotiation, mandate, message } = payload;
  const head =
    payload.strategy === 'mandate'
      ? `🤝 <b>MANDAT J+${listing.daysOnline}</b> · revenu ${eur(mandate?.totalRevenue ?? 0)} · 0 € de trésorerie`
      : `${scoring.masterclass ? '💎 <b>MASTERCLASS</b>' : '🔥 <b>PÉPITE</b>'} · marge réelle ${eur(scoring.realNetMargin)} · score ${scoring.score}/100`;

  const lines = [
    head,
    `<b>${escape(listing.title)}</b>`,
    `${listing.year} · ${listing.mileage.toLocaleString('fr-FR')} km · ${escape(listing.location ?? '')}`,
    `Prix ${eur(listing.price)} · cote ${eur(listing.marketPrice)}${context.comparables ? ` (${context.comparables} comparables)` : ''}`,
  ];
  if (scoring.reasons?.length) lines.push(`<i>Pourquoi ce prix :</i> ${scoring.reasons.slice(0, 3).map(escape).join(' ')}`);
  if (payload.strategy === 'negotiation' && negotiation) {
    lines.push(`Offre : <b>${eur(negotiation.offerPrice)}</b> (−${eur(negotiation.discount)}) · marge négociée ${eur(scoring.negotiatedNetMargin)}`);
  }
  if (payload.strategy === 'mandate' && mandate) {
    lines.push(`Prix net vendeur ${eur(mandate.ownerNet)} · plus-value ${eur(mandate.commission)}`);
  }
  const url = adUrl(listing);
  if (url) lines.push(`<a href="${escape(url)}">👉 Ouvrir l'annonce</a>`);
  lines.push('', '<b>Message à envoyer :</b>');

  const header = lines.join('\n');
  const room = MAX_LENGTH - header.length - 20;
  const body = message.body.length > room ? `${message.body.slice(0, room)}…` : message.body;
  return `${header}\n<pre>${escape(body)}</pre>`;
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
