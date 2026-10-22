import type { scoreListing } from '@/backend/utils/scoring.js';

export type VehicleType = 'auto' | 'moto';
export type SegmentKey = 'citadine' | 'compacte' | 'premium' | 'moto';

export interface Listing {
  id: string;
  type: VehicleType;
  title: string;
  brand: string;
  model: string;
  version?: string;
  engine?: string;
  engineCode?: string;
  gearbox?: string;
  year: number;
  mileage: number;
  price: number;
  marketPrice: number;
  description?: string;
  options?: string[];
  doors?: number;
  vin?: string;
  licenseCategory?: 'MTT1' | 'MTT2';
  beltMonthsAgo?: number;
  segment?: SegmentKey;
  publishedAt: string;
  location?: string;
  source?: string;
  url?: string;
}

export type Analysis = ReturnType<typeof scoreListing>;
export type StatusKey = Analysis['status']['key'];

export interface ScoredListing {
  listing: Listing;
  analysis: Analysis;
}

export type TabKey = 'auto' | 'moto' | 'mandat';
