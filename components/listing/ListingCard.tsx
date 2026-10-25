'use client';

import { useState } from 'react';

import { adUrl } from '@/backend/utils/links.js';
import { MandatePanel } from '@/components/mandate/MandatePanel';
import { Chip } from '@/components/ui/Chip';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn, eur, km, signedEur } from '@/lib/format';
import type { ScoredListing } from '@/lib/types';

import { InspectionPanel } from './InspectionPanel';
import { VerifyPanel } from './VerifyPanel';
import { MarginBreakdown } from './MarginBreakdown';

export type MessageKind = 'negotiation' | 'mandate';

const MARGIN_TONE = { PEPITE: 'text-emerald-600 dark:text-emerald-400', SURVEILLER: 'text-amber-600 dark:text-amber-400', REFUSE: 'text-rose-600 dark:text-rose-400' } as const;

export function ListingCard({
  item,
  mode = 'hunt',
  onMessage,
  onOutreach,
  onRemove,
  crm,
  buyers = [],
  inspectable = false,
}: {
  item: ScoredListing;
  mode?: 'hunt' | 'mandate';
  onMessage: (item: ScoredListing, kind: MessageKind) => void;
  /** Message autonome via /api/outreach : fiches PÉPITE, et fiches mandat (J+15). */
  onOutreach?: (item: ScoredListing) => void;
  onRemove?: (id: string) => void;
  /** Ajout au CRM (absent si le CRM n'est pas branché). */
  crm?: { inCrm: boolean; onAdd: (item: ScoredListing, kind: 'achat' | 'mandat') => void };
  /** Acheteurs du réseau qui cherchent cette voiture. */
  buyers?: string[];
  /** Inspection IA des photos disponible (annonce réelle du radar + clé API configurée). */
  inspectable?: boolean;
}) {
  const { listing, analysis } = item;
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState(0);
  const refused = analysis.blacklist.length > 0;
  const canOutreach = analysis.status.key === 'PEPITE' || (mode === 'mandate' && analysis.mandateEligible);
  const f = analysis.finance;
  const url = adUrl(listing);

  const meta = [
    String(listing.year),
    km(listing.mileage),
    listing.engine,
    listing.gearbox,
    listing.type === 'moto' ? listing.licenseCategory : listing.doors ? `${listing.doors} p.` : undefined,
  ].filter(Boolean);

  return (
    <article className={cn('card flex flex-col overflow-hidden', refused && 'opacity-80', analysis.masterclass && 'ring-2 ring-violet-500')}>
      {(!listing.photos || listing.photos.length === 0) && url && (
        <a href={url} target="_blank" rel="noreferrer" className="flex aspect-[16/9] items-center justify-center bg-ink-100 text-sm font-medium text-ink-600 hover:text-ink-900">
          📷 Photos sur l&apos;annonce ↗
        </a>
      )}
      {listing.photos && listing.photos.length > 0 && (
        <a href={url ?? undefined} target="_blank" rel="noreferrer" className="relative block aspect-[16/9] bg-ink-100">
          {/* eslint-disable-next-line @next/next/no-img-element -- photos LeBonCoin externes, pas d'optimisation Next */}
          <img src={listing.photos[photo] ?? listing.photos[0]} alt={listing.title} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          {listing.photos.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">📷 {listing.photos.length}</span>
          )}
        </a>
      )}
      <div className="flex items-start gap-3 p-4 pb-3">
        <ScoreGauge score={analysis.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {analysis.masterclass ? (
              <span className="inline-flex items-center rounded-md bg-violet-600 px-2 py-0.5 text-xs font-bold text-white" title="Marge réelle ≥ 2 × le seuil pépite, aucun signal de risque">
                💎 MASTERCLASS
              </span>
            ) : (
              <StatusBadge status={analysis.status.key} label={analysis.status.label} />
            )}
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
            {buyers.length > 0 && (
              <Chip tone="blue" title={`Acheteurs en attente : ${buyers.join(', ')}`}>
                👥 {buyers.length} acheteur{buyers.length > 1 ? 's' : ''}
              </Chip>
            )}
            {listing.repost && (
              <Chip tone="amber" title={`Même voiture déjà en ligne depuis le ${new Date(listing.repost.firstSeenAt).toLocaleDateString('fr-FR')}`}>
                🔁 Republiée
              </Chip>
            )}
            {listing.priceDrop && (
              <Chip tone="red" title={`Relevé par le radar : ${eur(listing.priceDrop.from)} → ${eur(listing.priceDrop.to)}`}>
                📉 −{eur(listing.priceDrop.amount)}
              </Chip>
            )}
            {analysis.areaType === 'campagne' && (
              <Chip tone="green" title={`${analysis.cityKm} km de ${analysis.nearestCity} : prix de campagne, revente en ville`}>
                🌾 Campagne
              </Chip>
            )}
          </div>
          <h3 className="mt-1.5 truncate text-[15px] font-semibold text-ink-900" title={listing.title}>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                {listing.title} ↗
              </a>
            ) : (
              listing.title
            )}
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
          <dt className="text-[11px] uppercase tracking-wide text-ink-400" title="Médiane des prix affichés des annonces comparables (pas l'Argus)">
            Prix marché
          </dt>
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
              <dt className="text-[11px] uppercase tracking-wide text-ink-400" title="Après remise en état, capital risque, carte grise et rapatriement">
                Marge réelle
              </dt>
              <dd className={cn('tabular text-sm font-bold', MARGIN_TONE[analysis.status.key])}>
                {refused ? '—' : signedEur(f.realNetMargin)}
              </dd>
            </>
          )}
        </div>
      </dl>

      {analysis.local && (
        <div className={cn('flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 px-4 py-2 text-xs', analysis.masterclass ? 'bg-violet-50 dark:bg-violet-500/10' : 'bg-ink-50/60')}>
          <span className="text-ink-600" title={`Médiane de ${analysis.local.comparables} annonces similaires à moins de ${analysis.local.radiusKm} km de ta base`}>
            🏠 Revente chez toi <strong className="tabular text-ink-900">{eur(analysis.local.price)}</strong> ({analysis.local.comparables} annonces &lt; {analysis.local.radiusKm} km
            {analysis.local.daysOnMarket !== null ? `, vente ≈ ${analysis.local.daysOnMarket} j` : ''})
          </span>
          <strong className={cn('tabular', analysis.local.margin > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
            marge {signedEur(analysis.local.margin)}
          </strong>
        </div>
      )}

      {listing.marketStats?.criteria && (
        <div className="space-y-1 border-b border-ink-100 px-4 py-1.5 text-[11px] text-ink-500">
          {listing.marketStats.confidence && (
            <p>
              <span
                className={cn(
                  'mr-1.5 rounded px-1.5 py-0.5 font-semibold',
                  listing.marketStats.confidence.level === 'haute' && 'bg-emerald-600 text-white',
                  listing.marketStats.confidence.level === 'moyenne' && 'bg-amber-500 text-white',
                  listing.marketStats.confidence.level === 'faible' && 'bg-rose-600 text-white',
                )}
                title="Nombre de comparables, dispersion des prix, critères vérifiés, fenêtre serrée ou élargie"
              >
                Fiabilité cote : {listing.marketStats.confidence.level} ({listing.marketStats.confidence.score}/100)
              </span>
              {listing.marketStats.comparables} annonces, prix dispersés à {listing.marketStats.confidence.spreadPct} %
            </p>
          )}
          <p title="Critères des annonces comparables utilisées pour le prix marché">Comparé sur : {listing.marketStats.criteria.join(' · ')}</p>
        </div>
      )}

      {(analysis.market || analysis.quality.owners !== null) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-ink-100 px-4 py-2 text-xs text-ink-600">
          {analysis.market && 'low' in analysis.market && (
            <span title="Fourchette des annonces comparables en ligne (25 % - 75 %)">
              Marché actuel <strong className="tabular text-ink-900">{eur(analysis.market.low)} – {eur(analysis.market.high)}</strong> ({analysis.market.comparables} annonces)
            </span>
          )}
          {analysis.market && 'daysOnMarket' in analysis.market && analysis.market.daysOnMarket !== null && (
            <span className={cn(analysis.market.daysOnMarket >= analysis.prudent.slowDays && 'text-amber-700 dark:text-amber-300')} title="Depuis combien de jours les annonces similaires sont en ligne (médiane)">
              Délai de vente ≈ <strong className="tabular">{analysis.market.daysOnMarket} j</strong>
            </span>
          )}
          {analysis.market?.argus ? (
            <span>
              Argus <strong className="tabular text-ink-900">{eur(analysis.market.argus)}</strong>
            </span>
          ) : null}
          {analysis.quality.owners !== null && (
            <span>
              Propriétaires <strong className="tabular text-ink-900">{analysis.quality.owners}</strong>
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        {analysis.blacklist.map((b) => (
          <div key={b.id} className="rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
            <p className="font-semibold">⛔ {b.label}</p>
            <p className="mt-0.5 text-rose-700 dark:text-rose-300">{b.reason}</p>
            {b.evidence && <p className="mt-1 font-mono text-[11px] text-rose-600 dark:text-rose-400">« {b.evidence} »</p>}
          </div>
        ))}

        {!refused && analysis.priceReasons.reasons.length > 0 && (
          <div className={cn('rounded-lg px-3 py-2 text-xs', analysis.priceReasons.risks.length ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-ink-50')}>
            <p className="mb-1 font-semibold text-ink-900">Pourquoi ce prix ?</p>
            <ul className="space-y-0.5 text-ink-600">
              {(open ? analysis.priceReasons.reasons : analysis.priceReasons.reasons.slice(0, 3)).map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>
        )}

        {!refused && (
          <div
            className={cn(
              'rounded-lg px-3 py-2 text-xs',
              analysis.sellability.level === 'difficile' ? 'bg-rose-50 dark:bg-rose-500/10' : analysis.sellability.level === 'moyenne' ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10',
            )}
          >
            <p className="font-semibold text-ink-900">
              🏷 Revente : {analysis.sellability.level === 'facile' ? 'devrait partir facilement' : analysis.sellability.level === 'moyenne' ? 'à surveiller' : 'risque de traîner'}
            </p>
            <ul className="mt-0.5 space-y-0.5 text-ink-700">
              {analysis.sellability.points.map((p) => (
                <li key={p.label}>
                  {p.tone === 'good' ? '✓' : p.tone === 'warn' ? '⚠' : '•'} {p.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.quality.hits.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {analysis.quality.hits.map((q) => (
              <Chip key={q.id} tone="green" title={q.evidence || undefined}>
                ✓ {q.label}
              </Chip>
            ))}
          </div>
        )}

        {listing.options && listing.options.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {listing.options.slice(0, open ? undefined : 8).map((o) => (
              <span key={o} className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                {o}
              </span>
            ))}
          </div>
        )}

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

        {!refused && listing.marketStats?.confidence?.level === 'faible' && <VerifyPanel listing={listing} analysis={analysis} />}

        {!refused && listing.photos && listing.photos.length > 0 && (
          <InspectionPanel
            listing={listing}
            enabled={inspectable}
            onPhoto={(i) => {
              setPhoto(i);
              setOpen(true);
            }}
          />
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
            {listing.photos && listing.photos.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto">
                {listing.photos.map((p, i) => (
                  <button key={p} type="button" onClick={() => setPhoto(i)} className={cn('h-14 w-20 shrink-0 overflow-hidden rounded-md border', i === photo ? 'border-ink-900' : 'border-ink-200')}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- photos LeBonCoin externes */}
                    <img src={p} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {listing.marketStats?.samples && listing.marketStats.samples.length > 0 && (
              <div className="text-xs">
                <p className="mb-1 font-semibold text-ink-900">Annonces comparées ({listing.marketStats.comparables}) : vérifie toi-même</p>
                <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
                  {listing.marketStats.samples.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className="min-w-0 truncate text-ink-600">
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {c.title} ↗
                          </a>
                        ) : (
                          c.title
                        )}
                        <span className="text-ink-400">
                          {' '}
                          · {c.year} · {km(c.mileage)}
                          {c.location ? ` · ${c.location}` : ''}
                        </span>
                      </span>
                      <strong className="tabular shrink-0 text-ink-900">{eur(c.price)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {listing.description && <p className="whitespace-pre-line rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">{listing.description}</p>}
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
              {open ? 'Masquer le détail' : mode === 'mandate' ? 'Détail du mandat' : 'Détail, photos & description'}
            </button>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              {url && (
                <a className="btn-secondary text-xs" href={url} target="_blank" rel="noreferrer">
                  Voir l’annonce ↗
                </a>
              )}
              {crm && !refused && (
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={crm.inCrm}
                  onClick={() => crm.onAdd(item, mode === 'mandate' ? 'mandat' : 'achat')}
                  title="Suivre ce véhicule dans le CRM : messages, relances, papiers"
                >
                  {crm.inCrm ? '✓ Dans le CRM' : '+ CRM'}
                </button>
              )}
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
