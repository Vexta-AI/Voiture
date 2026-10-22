import type { createDeal } from '@/backend/utils/crm.js';

/** Deal du CRM (forme produite par backend/utils/crm.js). */
export type Deal = ReturnType<typeof createDeal>;
export type DealKind = Deal['kind'];
export type DealEvent = Deal['events'][number];
