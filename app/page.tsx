import { SAMPLE_LISTINGS } from '@/backend/data/listings.js';
import { Dashboard, type RadarInfo } from '@/components/dashboard/Dashboard';
import { loadLiveRadar } from '@/lib/hunt';
import { storeEnabled } from '@/lib/store';
import type { Listing } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Annonces fictives seulement si aucun stockage n'est branché : jamais quand le radar est en panne ou vide
  // (on ne mélange pas du faux avec du vrai).
  if (!storeEnabled()) return <Dashboard initialListings={SAMPLE_LISTINGS as Listing[]} radar={{ mode: 'demo', configured: false }} />;
  const live = await loadLiveRadar();
  if (!live) return <Dashboard initialListings={[]} radar={{ mode: 'down' }} />;
  const radar: RadarInfo = { mode: 'live', lastRun: live.lastRun, poolSize: live.poolSize, unpriced: live.unpriced };
  return <Dashboard initialListings={live.listings} pending={live.pending} radar={radar} />;
}
