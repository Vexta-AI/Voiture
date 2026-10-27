import 'server-only';

import { neon } from '@neondatabase/serverless';

/**
 * Base Neon Postgres (intégration Vercel Marketplace, offre gratuite : 1 Go, 100 CU-heures et 5 Go de transfert
 * par mois et par projet, https://neon.com/pricing). Variable posée par l'intégration : DATABASE_URL.
 */
const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

export const dbEnabled = () => Boolean(url());

let client: ReturnType<typeof neon> | null = null;
let schema: Promise<void> | null = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS runs (run_id text PRIMARY KEY, fetched_at timestamptz NOT NULL, kind text NOT NULL, run jsonb NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS runs_fetched_at ON runs (fetched_at)`,
  `CREATE TABLE IF NOT EXISTS run_meta (run_id text PRIMARY KEY, fetched_at timestamptz NOT NULL, source text NOT NULL, kind text NOT NULL, listings int NOT NULL, with_photos int NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pool (id text PRIMARY KEY, model_key text NOT NULL, fingerprint text, last_seen timestamptz NOT NULL, entry jsonb NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS pool_model_key ON pool (model_key)`,
  `CREATE INDEX IF NOT EXISTS pool_fingerprint ON pool (fingerprint)`,
  `CREATE TABLE IF NOT EXISTS alerts (key text PRIMARY KEY, sent_at timestamptz NOT NULL DEFAULT now(), data jsonb)`,
  `CREATE TABLE IF NOT EXISTS batches (id text PRIMARY KEY, keys jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS claims (batch_id text NOT NULL, key text NOT NULL, PRIMARY KEY (batch_id, key))`,
  `CREATE TABLE IF NOT EXISTS logs (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), entry jsonb NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ondemand (key text PRIMARY KEY, launched_at timestamptz NOT NULL, source jsonb NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inspections (listing_id text PRIMARY KEY, data jsonb NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS spend (month text PRIMARY KEY, usd double precision NOT NULL DEFAULT 0, count int NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS deals (id text PRIMARY KEY, updated_at timestamptz NOT NULL, deal jsonb NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS details (listing_id text PRIMARY KEY, fetched_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS buyers (id text PRIMARY KEY, created_at timestamptz NOT NULL, buyer jsonb NOT NULL)`,
];

/** Requête SQL paramétrée ($1, $2…) ; les tables sont créées au premier appel de chaque instance. */
export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!dbEnabled()) throw new Error('Base Neon non configurée (DATABASE_URL)');
  client ??= neon(url());
  const c = client;
  schema ??= (async () => {
    for (const statement of SCHEMA) await c.query(statement);
  })().catch((error) => {
    schema = null;
    throw error;
  });
  await schema;
  return (await c.query(text, params)) as T[];
}
