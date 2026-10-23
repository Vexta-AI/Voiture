import type { createDeal } from '@/backend/utils/crm.js';

/** Deal du CRM (forme produite par backend/utils/crm.js). */
export type Deal = ReturnType<typeof createDeal>;
export type DealKind = Deal['kind'];
export type DealEvent = Deal['events'][number];

/** Acheteur en attente (réseau d'acheteurs), forme de backend/utils/matching.js. */
export interface WaitingBuyer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  channel?: string;
  /** Origine : saisi à la main, ou formulaire public (avec consentement daté). */
  source?: 'manuel' | 'formulaire';
  consentAt?: string;
  active: boolean;
  createdAt: string;
  notes?: string;
  criteria: {
    type?: 'auto' | 'moto';
    models?: string[];
    budgetMax: number;
    budgetMin?: number;
    yearMin?: number;
    mileageMax?: number;
    fuel?: string;
    gearbox?: 'auto' | 'manuelle';
  };
}
