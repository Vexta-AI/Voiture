import { NextResponse } from 'next/server';

import { sendTelegram } from '@/backend/pipeline/telegram.js';
import { createDeal } from '@/backend/utils/crm.js';
import { scoreListing } from '@/backend/utils/scoring.js';
import { crmEnabled, loadDeals, saveDeal } from '@/lib/crm-store';
import { huntConfig } from '@/lib/hunt';
import type { Listing } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Choix métier : plafond de demandes publiques par heure (anti-spam). */
const PUBLIC_LIMITS = { perHour: 20 };

const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * POST /api/public/seller-request — formulaire public « Je vends ma voiture » (mandat / dépôt-vente).
 * Le vendeur laisse lui-même son véhicule et ses coordonnées, avec son consentement explicite (RGPD).
 * La demande arrive dans le CRM comme un mandat « à contacter ».
 */
export async function POST(request: Request) {
  if (!crmEnabled()) return NextResponse.json({ ok: false, error: 'indisponible' }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 5000) return NextResponse.json({ ok: false, error: 'trop long' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 });
  }
  // Champ piège invisible : rempli = robot.
  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true });
  if (body.consent !== true) return NextResponse.json({ ok: false, error: 'Merci de cocher la case de consentement.' }, { status: 422 });

  const name = str(body.name, 60);
  const phone = str(body.phone, 30);
  const email = str(body.email, 120);
  const brand = str(body.brand, 40);
  const model = str(body.model, 60);
  const year = int(body.year);
  const mileage = int(body.mileage);
  const price = int(body.price);
  const city = str(body.city, 60);
  const notes = str(body.notes, 600);
  const now = new Date();
  if (!name) return NextResponse.json({ ok: false, error: 'Indiquez votre prénom.' }, { status: 422 });
  if (!phone && !email) return NextResponse.json({ ok: false, error: 'Indiquez un téléphone ou un e-mail pour être recontacté.' }, { status: 422 });
  if (!brand || !model) return NextResponse.json({ ok: false, error: 'Indiquez la marque et le modèle.' }, { status: 422 });
  if (!year || year < 1980 || year > now.getFullYear() + 1) return NextResponse.json({ ok: false, error: 'Année invalide.' }, { status: 422 });
  if (!mileage || mileage > 1_000_000) return NextResponse.json({ ok: false, error: 'Kilométrage invalide.' }, { status: 422 });
  if (!price || price < 500 || price > 500_000) return NextResponse.json({ ok: false, error: 'Prix souhaité invalide.' }, { status: 422 });

  const deals = await loadDeals().catch(() => []);
  const lastHour = deals.filter((d) => d.vehicle.listingId.startsWith('vendeur-') && now.getTime() - new Date(d.createdAt).getTime() < 3_600_000).length;
  if (lastHour >= PUBLIC_LIMITS.perHour) return NextResponse.json({ ok: false, error: 'Trop de demandes, réessayez plus tard.' }, { status: 429 });

  const listing = {
    id: `vendeur-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'auto',
    title: `${brand} ${model}`,
    brand,
    model,
    year,
    mileage,
    price,
    marketPrice: 0,
    description: notes,
    location: city || undefined,
    publishedAt: now.toISOString(),
    source: 'Formulaire vendeur',
  } as Listing;
  const deal = createDeal({ kind: 'mandat', listing, analysis: scoreListing(listing), source: 'manuel', now });
  deal.contact = { name, phone: phone || undefined, channel: email ? `formulaire · ${email}` : 'formulaire' };
  deal.events.push({ id: `e-${now.getTime().toString(36)}`, at: now.toISOString(), type: 'note', text: `Demande via le formulaire « Je vends ma voiture » (consentement le ${now.toLocaleString('fr-FR')}).${notes ? ` ${notes}` : ''}` });
  await saveDeal(deal);

  const config = huntConfig();
  if (config.telegramToken && config.telegramChatId) {
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    await sendTelegram({
      token: config.telegramToken,
      chatId: config.telegramChatId,
      text: `🤝 <b>Nouveau vendeur (formulaire mandat)</b>\n${esc(name)} · ${esc(`${brand} ${model}`)} ${year} · ${mileage.toLocaleString('fr-FR')} km · souhaite ${price.toLocaleString('fr-FR')} €${city ? ` · ${esc(city)}` : ''}\nÀ rappeler : il est dans le CRM (Mandats).`,
    }).catch((error: unknown) => console.error('[seller-request] telegram', error));
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
