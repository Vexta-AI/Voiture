import { NextResponse } from 'next/server';

import { SAMPLE_LISTINGS } from '@/backend/data/listings.js';
import { scoreListings } from '@/backend/utils/scoring.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/listings?type=auto|moto&status=PEPITE|SURVEILLER|REFUSE&minDays=15
 * Retourne les annonces scorées, triées par score.
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = params.get('type');
  const status = params.get('status');
  const minDays = Number(params.get('minDays') ?? 0);

  const results = scoreListings(SAMPLE_LISTINGS).filter(
    ({ listing, analysis }) =>
      (!type || listing.type === type) && (!status || analysis.status.key === status) && analysis.daysOnline >= minDays,
  );

  return NextResponse.json({ count: results.length, results });
}
