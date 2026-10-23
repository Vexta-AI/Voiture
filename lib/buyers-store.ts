import 'server-only';

import { BlobNotFoundError, del, get, list, put } from '@vercel/blob';

import type { WaitingBuyer } from './crm';

/** Réseau d'acheteurs dans Vercel Blob (store privé) : crm/buyers/<id>.json. */

const PREFIX = 'crm/buyers/';
const pathOf = (id: string) => `${PREFIX}${id.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;

export async function loadBuyer(id: string): Promise<WaitingBuyer | null> {
  try {
    const result = await get(pathOf(id), { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return (await new Response(result.stream).json()) as WaitingBuyer;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

export async function saveBuyer(buyer: WaitingBuyer) {
  await put(pathOf(buyer.id), JSON.stringify(buyer), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
}

export async function deleteBuyer(id: string) {
  await del(pathOf(id)).catch(() => undefined);
}

export async function loadBuyers(): Promise<WaitingBuyer[]> {
  const paths: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    paths.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const buyers = await Promise.all(
    paths.map(async (p) => {
      const result = await get(p, { access: 'private', useCache: false }).catch(() => null);
      if (!result || result.statusCode !== 200) return null;
      return (await new Response(result.stream).json().catch(() => null)) as WaitingBuyer | null;
    }),
  );
  return buyers.filter((b): b is WaitingBuyer => b !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
