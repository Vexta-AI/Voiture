import 'server-only';

import type { WaitingBuyer } from './crm';
import { q } from './db';

/** Réseau d'acheteurs dans Neon Postgres : table buyers (id -> acheteur). */

export async function loadBuyer(id: string): Promise<WaitingBuyer | null> {
  return (await q<{ buyer: WaitingBuyer }>(`SELECT buyer FROM buyers WHERE id = $1`, [id]))[0]?.buyer ?? null;
}

export async function saveBuyer(buyer: WaitingBuyer) {
  await q(`INSERT INTO buyers (id, created_at, buyer) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET buyer = excluded.buyer`, [
    buyer.id,
    buyer.createdAt,
    JSON.stringify(buyer),
  ]);
}

export async function deleteBuyer(id: string) {
  await q(`DELETE FROM buyers WHERE id = $1`, [id]);
}

export async function loadBuyers(): Promise<WaitingBuyer[]> {
  return (await q<{ buyer: WaitingBuyer }>(`SELECT buyer FROM buyers ORDER BY created_at DESC`)).map((r) => r.buyer);
}
