import type { scoreListing } from '@/backend/utils/scoring.js';

export type VehicleType = 'auto' | 'moto';
export type SegmentKey = 'citadine' | 'compacte' | 'suv' | 'premium' | 'moto';

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
  /** Marché actuel : fourchette des comparables (25-75 %), nombre, jours en ligne médians */
  marketStats?: { low: number; high: number; comparables: number; daysOnMarket: number | null };
  /** Cote Argus saisie à la main (pas d'accès gratuit à l'Argus officiel) */
  argusPrice?: number;
  /** Photos de l'annonce (URL) */
  photos?: string[];
  /** Puissance fiscale (CV) : base de la carte grise */
  fiscalHp?: number;
  vin?: string;
  licenseCategory?: 'MTT1' | 'MTT2';
  beltMonthsAgo?: number;
  segment?: SegmentKey;
  publishedAt: string;
  location?: string;
  source?: string;
  url?: string;
  /** Coordonnées GPS et code postal (annonces réelles) */
  lat?: number;
  lng?: number;
  zip?: string;
  /** Distance à la base (km), calculée à l'ingestion */
  distanceKm?: number;
  zone?: 'prioritaire' | 'france';
}

export type Analysis = ReturnType<typeof scoreListing>;
export type StatusKey = Analysis['status']['key'];

export interface ScoredListing {
  listing: Listing;
  analysis: Analysis;
}

export type TabKey = 'auto' | 'moto' | 'mandat';
