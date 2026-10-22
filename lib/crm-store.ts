import 'server-only';

import { BlobNotFoundError, del, get, list, put } from '@vercel/blob';

import type { Deal } from './crm';

/**
 * CRM dans Vercel Blob (store privé) : crm/deals/<id>.json, un fichier par deal, réécrit à chaque action.
 * Usage solo : le dernier enregistrement gagne.
 */

const PREFIX = 'crm/deals/';
const pathOf = (id: string) => `${PREFIX}${id.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;

export const crmEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function loadDeal(id: string): Promise<Deal | null> {
  try {
    const result = await get(pathOf(id), { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return (await new Response(result.stream).json()) as Deal;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

export async function saveDeal(deal: Deal) {
  await put(pathOf(deal.id), JSON.stringify(deal), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
}

/** Crée le deal seulement s'il n'existe pas encore (une annonce = un deal). */
export async function createDealOnce(deal: Deal) {
  try {
    await put(pathOf(deal.id), JSON.stringify(deal), { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' });
    return true;
  } catch (error) {
    if (await loadDeal(deal.id)) return false;
    throw error;
  }
}

export async function deleteDeal(id: string) {
  await del(pathOf(id)).catch(() => undefined);
}

export async function loadDeals(): Promise<Deal[]> {
  const paths: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    paths.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const deals = await Promise.all(
    paths.map(async (p) => {
      const result = await get(p, { access: 'private', useCache: false }).catch(() => null);
      if (!result || result.statusCode !== 200) return null;
      return (await new Response(result.stream).json().catch(() => null)) as Deal | null;
    }),
  );
  return deals.filter((d): d is Deal => d !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
