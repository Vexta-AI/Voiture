import { SAMPLE_LISTINGS } from '@/backend/data/listings.js';
import { Dashboard } from '@/components/dashboard/Dashboard';
import type { Listing } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return <Dashboard initialListings={SAMPLE_LISTINGS as Listing[]} />;
}
