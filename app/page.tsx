import { SAMPLE_LISTINGS } from '@/backend/data/listings.js';
import { Dashboard, type RadarInfo } from '@/components/dashboard/Dashboard';
import { loadLiveRadar } from '@/lib/hunt';
import type { Listing } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const live = await loadLiveRadar();
  if (live && (live.listings.length > 0 || live.pending.length > 0)) {
    const radar: RadarInfo = { mode: 'live', lastRun: live.lastRun, poolSize: live.poolSize, unpriced: live.unpriced };
    return <Dashboard initialListings={live.listings} pending={live.pending} radar={radar} />;
  }
  return <Dashboard initialListings={SAMPLE_LISTINGS as Listing[]} radar={{ mode: 'demo', configured: live !== null }} />;
}
