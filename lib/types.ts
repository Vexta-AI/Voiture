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
  /** Carburant (Essence, Diesel, Hybride, Électrique) */
  fuel?: string;
  /** Puissance DIN (ch) */
  powerDin?: number;
  year: number;
  mileage: number;
  price: number;
  marketPrice: number;
  description?: string;
  options?: string[];
  doors?: number;
  /** Marché actuel : fourchette des comparables (25-75 %), nombre, jours en ligne médians */
  marketStats?: {
    low: number;
    high: number;
    comparables: number;
    daysOnMarket: number | null;
    criteria?: string[];
    confidence?: { score: number; level: 'haute' | 'moyenne' | 'faible'; spreadPct: number };
    samples?: { id: string; title: string; price: number; year: number; mileage: number; location: string | null; url: string | null }[];
  };
  /** Revente chez toi : comparables à moins de 100 km (200 km à défaut) de la base */
  localMarket?: { price: number; low: number; high: number; comparables: number; daysOnMarket: number | null; radiusKm: number; criteria?: string[] };
  /** Cote Argus saisie à la main (pas d'accès gratuit à l'Argus officiel) */
  argusPrice?: number;
  /** Baisse de prix relevée par le radar (plus haut prix déjà vu -> prix actuel) */
  priceDrop?: { from: number; to: number; amount: number; since: string };
  /** Annonce republiée : même voiture déjà vue sous une autre annonce */
  repost?: { previousId: string; firstSeenAt: string; previousPrice: number };
  /** Photos de l'annonce (URL) */
  photos?: string[];
  /** Inspection IA des photos (indicative, jamais une expertise) */
  inspection?: Inspection;
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

/** Résultat de l'inspection des photos par Claude (backend/utils/inspection.js). */
export interface Inspection {
  verdict: 'rassurant' | 'a_verifier' | 'suspect';
  summary: string;
  defects: { zone: string; observation: string; severity: 'mineur' | 'moyen' | 'majeur'; photo: number | null }[];
  consistency: { point: string; ok: boolean; observation: string }[];
  odometer: { visible: boolean; reading: number | null; photo: number | null };
  missingPhotos: string[];
  questions: string[];
  listingId: string;
  /** Prix de l'annonce au moment de l'inspection */
  price: number;
  photosAnalysed: number;
  photosTotal: number;
  model: string;
  costUsd: number;
  at: string;
}

export type Analysis = ReturnType<typeof scoreListing>;
export type StatusKey = Analysis['status']['key'];

export interface ScoredListing {
  listing: Listing;
  analysis: Analysis;
}

export type TabKey = 'auto' | 'moto' | 'mandat';
