'use client';

import { useState } from 'react';

import { MandatePanel } from '@/components/mandate/MandatePanel';
import { Chip } from '@/components/ui/Chip';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn, eur, km, signedEur } from '@/lib/format';
import type { ScoredListing } from '@/lib/types';

import { MarginBreakdown } from './MarginBreakdown';

export type MessageKind = 'negotiation' | 'mandate';

const MARGIN_TONE = { PEPITE: 'text-emerald-600 dark:text-emerald-400', SURVEILLER: 'text-amber-600 dark:text-amber-400', REFUSE: 'text-rose-600 dark:text-rose-400' } as const;

export function ListingCard({
  item,
  mode = 'hunt',
  onMessage,
  onOutreach,
  onRemove,
}: {
  item: ScoredListing;
  mode?: 'hunt' | 'mandate';
  onMessage: (item: ScoredListing, kind: MessageKind) => void;
  /** Message autonome via /api/outreach : fiches PÉPITE, et fiches mandat (J+15). */
  onOutreach?: (item: ScoredListing) => void;
  onRemove?: (id: string) => void;
}) {
  const { listing, analysis } = item;
  const [open, setOpen] = useState(false);
  const refused = analysis.blacklist.length > 0;
  const canOutreach = analysis.status.key === 'PEPITE' || (mode === 'mandate' && analysis.mandateEligible);
  const f = analysis.finance;

  const meta = [
    String(listing.year),
    km(listing.mileage),
    listing.engine,
    listing.gearbox,
    listing.type === 'moto' ? listing.licenseCategory : listing.doors ? `${listing.doors} p.` : undefined,
  ].filter(Boolean);

  return (
    <article className={cn('card flex flex-col overflow-hidden', refused && 'opacity-80')}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <ScoreGauge score={analysis.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={analysis.status.key} label={analysis.status.label} />
            <Chip>{analysis.segmentLabel}</Chip>
            <Chip tone={analysis.daysOnline >= 15 ? 'blue' : 'slate'} title="Jours en ligne">
              J+{analysis.daysOnline}
            </Chip>
            {analysis.distanceKm !== null && (
              <Chip tone={analysis.zone === 'france' ? 'amber' : 'green'} title={analysis.zone === 'france' ? 'Hors zone prioritaire : rapatriement déduit' : 'Zone prioritaire'}>
                {analysis.zone === 'france' ? '🚚 ' : '📍 '}
                {analysis.distanceKm} km
              </Chip>
            )}
          </div>
          <h3 className="mt-1.5 truncate text-[15px] font-semibold text-ink-900" title={listing.title}>
            {listing.title}
          </h3>
          <p className="truncate text-xs text-ink-500">
            {meta.join(' · ')}
            {listing.location && ` — ${listing.location}`}
          </p>
        </div>
        {onRemove && (
          <button type="button" className="btn-ghost -mr-2 -mt-1 px-2 text-xs" onClick={() => onRemove(listing.id)} title="Retirer du radar">
            ✕
          </button>
        )}
      </div>

      <dl className="grid grid-cols-3 border-y border-ink-100 bg-ink-50/60 text-center">
        <div className="px-2 py-2.5">
          <dt className="text-[11px] uppercase tracking-wide text-ink-400">Prix affiché</dt>
          <dd className="tabular text-sm font-semibold text-ink-900">{eur(listing.price)}</dd>
        </div>
        <div className="border-x border-ink-100 px-2 py-2.5">
          <dt className="text-[11px] uppercase tracking-wide text-ink-400">Cote pro</dt>
          <dd className="tabular text-sm font-semibold text-ink-900">{eur(listing.marketPrice)}</dd>
        </div>
        <div className="px-2 py-2.5">
          {mode === 'mandate' && analysis.mandate ? (
            <>
              <dt className="text-[11px] uppercase tracking-wide text-ink-400">Revenu mandat</dt>
              <dd className="tabular text-sm font-bold text-emerald-600 dark:text-emerald-400">{eur(analysis.mandate.totalRevenue)}</dd>
            </>
          ) : (
            <>
              <dt className="text-[11px] uppercase tracking-wide text-ink-400">Marge nette</dt>
              <dd className={cn('tabular text-sm font-bold', MARGIN_TONE[analysis.status.key])}>
                {refused ? '—' : signedEur(f.transportCost > 0 ? f.netMarginAfterTransport : f.netMargin)}
              </dd>
            </>
          )}
        </div>
      </dl>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        {analysis.blacklist.map((b) => (
          <div key={b.id} className="rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
            <p className="font-semibold">⛔ {b.label}</p>
            <p className="mt-0.5 text-rose-700 dark:text-rose-300">{b.reason}</p>
            {b.evidence && <p className="mt-1 font-mono text-[11px] text-rose-600 dark:text-rose-400">« {b.evidence} »</p>}
          </div>
        ))}

        {(analysis.triggers.length > 0 || analysis.levers.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {analysis.triggers.map((t) => (
              <Chip key={t.id} tone="green" title={t.evidence}>
                ★ {t.label} <span className="tabular">+{t.bonus} €</span>
              </Chip>
            ))}
            {analysis.levers.map((l) => (
              <Chip key={l.id} tone="amber" title={`${l.argument} — « ${l.evidence} »`}>
                ↓ {l.label} <span className="tabular">−{l.discount} €</span>
              </Chip>
            ))}
          </div>
        )}

        {analysis.warnings.length > 0 && (
          <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">
            {analysis.warnings.map((w) => (
              <li key={w} className="flex gap-1.5">
                <span aria-hidden>⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        {open && (
          <div className="space-y-3 border-t border-ink-100 pt-3">
            {mode === 'mandate' ? <MandatePanel analysis={analysis} /> : !refused && <MarginBreakdown analysis={analysis} />}
            {analysis.insights.length > 0 && (
              <ul className="space-y-1 text-xs text-ink-600">
                {analysis.insights.map((i) => (
                  <li key={i} className="flex gap-1.5">
                    <span aria-hidden className="text-ink-400">→</span>
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            )}
            {listing.description && <p className="rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">{listing.description}</p>}
          </div>
        )}

        <div className="mt-auto space-y-2 pt-1">
          {canOutreach && onOutreach && (
            <button type="button" className="btn-primary w-full" onClick={() => onOutreach(item)}>
              ⚡ Générer le message autonome
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost px-2 text-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? 'Masquer le détail' : mode === 'mandate' ? 'Détail du mandat' : 'Détail du calcul'}
            </button>
            <div className="ml-auto flex gap-2">
              {!refused && mode === 'hunt' && (
                <button type="button" className="btn-secondary text-xs" onClick={() => onMessage(item, 'negotiation')}>
                  Script de négo
                </button>
              )}
              {analysis.mandateEligible && (
                <button type="button" className="btn-secondary text-xs" onClick={() => onMessage(item, 'mandate')}>
                  Proposer un mandat
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
