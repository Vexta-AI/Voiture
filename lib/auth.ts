import { timingSafeEqual } from 'node:crypto';

/** Comparaison de secrets en temps constant ; false si l'un des deux est absent. */
export function secretMatches(provided: string | null | undefined, expected: string | undefined) {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** En-tête "Authorization: Bearer <CRON_SECRET>" envoyé par Vercel Cron. */
export function cronAuthorized(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  return secretMatches(header.startsWith('Bearer ') ? header.slice(7) : null, process.env.CRON_SECRET);
}
