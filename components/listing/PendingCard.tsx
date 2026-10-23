'use client';

import { useState } from 'react';

import { Chip } from '@/components/ui/Chip';
import { eur, km } from '@/lib/format';
import type { Listing } from '@/lib/types';

/**
 * Annonce réelle encore sans cote (pas assez de comparables) : le radar cherche ses comparables
 * automatiquement ; en attendant, tu peux saisir ta cote pour la scorer tout de suite.
 */
export function PendingCard({ listing, onPrice }: { listing: Listing; onPrice: (listing: Listing, marketPrice: number) => void }) {
  const [cote, setCote] = useState('');
  const value = Number(cote.replace(/[\s€]/g, ''));
  return (
    <article className="card flex min-w-0 flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="slate">Cote en attente</Chip>
        {listing.distanceKm !== undefined && (
          <Chip tone={listing.zone === 'france' ? 'amber' : 'green'}>
            {listing.zone === 'france' ? '🚚 ' : '📍 '}
            {Math.round(listing.distanceKm)} km
          </Chip>
        )}
      </div>
      <h3 className="truncate text-sm font-semibold text-ink-900" title={listing.title}>
        {listing.title}
      </h3>
      <p className="truncate text-xs text-ink-500">
        {listing.year} · {km(listing.mileage)}
        {listing.location && ` · ${listing.location}`}
      </p>
      <p className="tabular text-sm font-semibold text-ink-900">{eur(listing.price)}</p>
      <form
        className="mt-auto flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value > 0) onPrice(listing, value);
        }}
      >
        <input className="input h-8 w-28 py-1" inputMode="numeric" placeholder="Ta cote €" value={cote} onChange={(e) => setCote(e.target.value)} aria-label="Cote marché" />
        <button type="submit" className="btn-secondary text-xs" disabled={!(value > 0)}>
          Scorer
        </button>
        {listing.url && (
          <a className="btn-ghost ml-auto px-2 text-xs" href={listing.url} target="_blank" rel="noreferrer">
            Annonce ↗
          </a>
        )}
      </form>
    </article>
  );
}
