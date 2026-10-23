'use client';

import { useState } from 'react';

import { PHOTO_CHECKLIST, odometerGap, verdictLabel } from '@/backend/utils/inspection.js';
import { cn } from '@/lib/format';
import type { Inspection, Listing } from '@/lib/types';

const VERDICT_TONE = {
  rassurant: 'bg-emerald-50 dark:bg-emerald-500/10',
  a_verifier: 'bg-amber-50 dark:bg-amber-500/10',
  suspect: 'bg-rose-50 dark:bg-rose-500/10',
} as const;
const SEVERITY_TONE = { mineur: 'text-ink-500', moyen: 'text-amber-700 dark:text-amber-300', majeur: 'text-rose-700 dark:text-rose-300' } as const;

/** Inspection IA des photos : défauts visibles, cohérence, questions au vendeur. Indicatif, jamais une expertise. */
export function InspectionPanel({ listing, enabled, onPhoto }: { listing: Listing; enabled: boolean; onPhoto?: (index: number) => void }) {
  const [inspection, setInspection] = useState<Inspection | undefined>(listing.inspection);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const run = async (force = false) => {
    setLoading(true);
    setError(null);
    const res = await fetch('/api/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: listing.id, force }) }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setLoading(false);
    if (!json?.ok) return setError(json?.error ?? 'Inspection impossible');
    setInspection(json.inspection);
    setOpen(true);
  };

  if (!inspection) {
    return (
      <div className="space-y-2 rounded-lg bg-ink-50 px-3 py-2 text-xs">
        <button type="button" className="font-semibold text-ink-900" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          👀 À regarder sur les photos {open ? '▴' : '▾'}
        </button>
        {open && (
          <ul className="space-y-0.5 text-ink-700">
            {PHOTO_CHECKLIST.map((c) => (
              <li key={c}>☐ {c}</li>
            ))}
          </ul>
        )}
        {enabled && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost px-2 text-xs" disabled={loading} onClick={() => run()}>
              {loading ? 'Analyse des photos… (30 s env.)' : '🔍 Doute ? Faire inspecter par l’IA (quelques centimes)'}
            </button>
            {error && <span className="text-rose-600 dark:text-rose-400">{error}</span>}
          </div>
        )}
      </div>
    );
  }

  const gap = odometerGap(inspection, listing.mileage);
  const photoRef = (n: number | null) =>
    n ? (
      <button type="button" className="ml-1 text-sky-700 underline dark:text-sky-400" onClick={() => onPhoto?.(n - 1)}>
        photo {n}
      </button>
    ) : null;

  return (
    <div className={cn('space-y-2 rounded-lg px-3 py-2 text-xs', VERDICT_TONE[inspection.verdict])}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-ink-700">
          <span className="font-semibold text-ink-900">🔍 Photos (IA) : {verdictLabel(inspection.verdict)}</span> · {inspection.summary}
        </p>
        <button type="button" className="btn-ghost shrink-0 px-2 text-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Masquer' : 'Détail'}
        </button>
      </div>
      {gap !== null && (
        <p className="font-medium text-rose-700 dark:text-rose-300">
          ⚠ Compteur lu sur la photo : {inspection.odometer.reading?.toLocaleString('fr-FR')} km, annonce : {listing.mileage.toLocaleString('fr-FR')} km. À vérifier.
          {photoRef(inspection.odometer.photo)}
        </p>
      )}
      {open && (
        <div className="space-y-2">
          {inspection.defects.length > 0 && (
            <ul className="space-y-0.5">
              {inspection.defects.map((d, i) => (
                <li key={i} className={SEVERITY_TONE[d.severity]}>
                  • <strong>{d.zone}</strong> ({d.severity}) : {d.observation}
                  {photoRef(d.photo)}
                </li>
              ))}
            </ul>
          )}
          {inspection.consistency.length > 0 && (
            <ul className="space-y-0.5 text-ink-600">
              {inspection.consistency.map((c, i) => (
                <li key={i}>
                  {c.ok ? '✓' : '✗'} <strong>{c.point}</strong> : {c.observation}
                </li>
              ))}
            </ul>
          )}
          {inspection.missingPhotos.length > 0 && <p className="text-ink-600">Photos manquantes : {inspection.missingPhotos.join(', ')}</p>}
          {inspection.questions.length > 0 && (
            <div>
              <p className="font-semibold text-ink-900">Questions à poser au vendeur</p>
              <ul className="mt-0.5 space-y-0.5 text-ink-700">
                {inspection.questions.map((q) => (
                  <li key={q}>• {q}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-ink-400">
            Analyse automatique de {inspection.photosAnalysed} photo(s) sur {inspection.photosTotal}, le {new Date(inspection.at).toLocaleDateString('fr-FR')}
            {inspection.price !== listing.price ? ` (prix alors ${inspection.price.toLocaleString('fr-FR')} €)` : ''}. Indicatif : l&apos;IA ne voit que les photos, ça ne remplace ni la visite ni un
            contrôle en garage.
            <button type="button" className="ml-1 underline" disabled={loading} onClick={() => run(true)}>
              {loading ? 'Analyse…' : 'Refaire'}
            </button>
          </p>
          {error && <p className="text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
