import 'server-only';

import type { Deal } from './crm';
import { dbEnabled, q } from './db';

/** CRM dans Neon Postgres : table deals (id -> deal). Usage solo : le dernier enregistrement gagne. */

export const crmEnabled = () => dbEnabled();

export async function loadDeal(id: string): Promise<Deal | null> {
  return (await q<{ deal: Deal }>(`SELECT deal FROM deals WHERE id = $1`, [id]))[0]?.deal ?? null;
}

export async function saveDeal(deal: Deal) {
  await q(`INSERT INTO deals (id, updated_at, deal) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, deal = excluded.deal`, [
    deal.id,
    deal.updatedAt,
    JSON.stringify(deal),
  ]);
}

/** Crée le deal seulement s'il n'existe pas encore (une annonce = un deal). */
export async function createDealOnce(deal: Deal) {
  const rows = await q(`INSERT INTO deals (id, updated_at, deal) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id`, [deal.id, deal.updatedAt, JSON.stringify(deal)]);
  return rows.length === 1;
}

export async function deleteDeal(id: string) {
  await q(`DELETE FROM deals WHERE id = $1`, [id]);
}

export async function loadDeals(): Promise<Deal[]> {
  return (await q<{ deal: Deal }>(`SELECT deal FROM deals ORDER BY updated_at DESC`)).map((r) => r.deal);
}
