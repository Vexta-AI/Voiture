import { NextResponse, type NextRequest } from 'next/server';

/**
 * Protection du dashboard par mot de passe (Basic Auth), active si DASHBOARD_PASSWORD est défini.
 * /api/hunt/* reste ouvert ici : le cron et le webhook Apify y ont leurs propres secrets
 * (CRON_SECRET, INGEST_SECRET).
 */

const REALM = 'Pepite Radar';

/** Comparaison en temps constant (runtime edge : pas de node:crypto). */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function passwordFrom(request: NextRequest) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6));
    return decoded.slice(decoded.indexOf(':') + 1);
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return NextResponse.next();

  const provided = passwordFrom(request);
  if (provided !== null && safeEqual(provided, expected)) return NextResponse.next();

  return new NextResponse('Authentification requise', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

export const config = {
  // /cherche et /api/public/ : formulaire public « Je cherche une voiture » (acheteurs qui laissent leurs critères).
  matcher: ['/((?!api/hunt/|api/public/|cherche|_next/static|_next/image|favicon.ico|icon).*)'],
};
