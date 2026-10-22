import 'server-only';

import { createDeal } from '@/backend/utils/crm.js';
import { generateMandateMessage, generateNegotiationMessage } from '@/backend/utils/messages.js';
import { scoreListing } from '@/backend/utils/scoring.js';

import type { Deal } from './crm';
import type { Listing } from './types';

/**
 * Deal achat ou mandat prêt à l'emploi : scoring, premier message (négo ~10 % ou mandat) et offre de départ.
 */
export function dealFromListing(kind: 'achat' | 'mandat', listing: Listing, source: 'radar' | 'manuel', now = new Date()): Deal {
  const analysis = scoreListing(listing, { now });
  if (kind === 'mandat') {
    const m = generateMandateMessage(listing, analysis);
    return createDeal({ kind, listing, analysis, message: { subject: m.subject, body: m.text }, source, now });
  }
  const n = generateNegotiationMessage(listing, analysis, { tone: 'direct' });
  return createDeal({ kind, listing, analysis, message: { subject: n.subject, body: n.text }, offerPrice: n.offer, source, now });
}
