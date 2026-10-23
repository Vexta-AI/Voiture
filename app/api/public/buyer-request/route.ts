import { NextResponse } from 'next/server';

import { sendTelegram } from '@/backend/pipeline/telegram.js';
import { parseBuyerInput } from '@/backend/utils/matching.js';
import { loadBuyers, saveBuyer } from '@/lib/buyers-store';
import type { WaitingBuyer } from '@/lib/crm';
import { crmEnabled } from '@/lib/crm-store';
import { huntConfig } from '@/lib/hunt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Choix métier : plafond d'inscriptions publiques par heure. */
const PUBLIC_LIMITS = { perHour: 20 };

/**
 * POST /api/public/buyer-request — formulaire public « Je cherche une voiture ».
 * La personne laisse elle-même ses critères et ses coordonnées, avec son consentement explicite
 * (RGPD : pas de démarchage sans consentement). Elle rejoint le réseau d'acheteurs.
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
  const parsed = parseBuyerInput(body);
  if (!parsed.ok) return NextResponse.json(parsed, { status: 422 });
  if (!parsed.phone && !parsed.email) return NextResponse.json({ ok: false, error: 'Indiquez un téléphone ou un e-mail pour être recontacté.' }, { status: 422 });

  const now = new Date();
  // Anti-abus : au plus 20 inscriptions par heure via le formulaire (au-delà, c'est un robot ou un spam).
  const existing = await loadBuyers().catch(() => []);
  const lastHour = existing.filter((b) => b.source === 'formulaire' && now.getTime() - new Date(b.createdAt).getTime() < 3_600_000).length;
  if (lastHour >= PUBLIC_LIMITS.perHour) return NextResponse.json({ ok: false, error: 'Trop de demandes, réessayez plus tard.' }, { status: 429 });

  const buyer: WaitingBuyer = {
    id: `b-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: parsed.name,
    phone: parsed.phone,
    email: parsed.email,
    notes: parsed.notes,
    source: 'formulaire',
    consentAt: now.toISOString(),
    // À valider dans le CRM avant d'entrer dans le matching : un faux inscrit ne pollue jamais les alertes.
    active: false,
    createdAt: now.toISOString(),
    criteria: parsed.criteria,
  };
  await saveBuyer(buyer);

  const config = huntConfig();
  if (config.telegramToken && config.telegramChatId) {
    const c = buyer.criteria;
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    await sendTelegram({
      token: config.telegramToken,
      chatId: config.telegramChatId,
      text: `👥 <b>Nouvel acheteur (formulaire)</b> · à valider dans le CRM\n${esc(buyer.name)} · ${esc(c.models?.join(', ') || 'tout modèle')} · budget ${c.budgetMax.toLocaleString('fr-FR')} €`,
    }).catch((error: unknown) => console.error('[buyer-request] telegram', error));
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
