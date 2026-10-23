'use client';

import { useState } from 'react';

import type { leadHeat, nextAction } from '@/backend/utils/crm.js';
import { LOST_REASONS } from '@/backend/config/crm.js';
import { adUrl } from '@/backend/utils/links.js';
import { Chip } from '@/components/ui/Chip';
import type { Deal } from '@/lib/crm';
import { cn, eur } from '@/lib/format';

import type { DealActionBody } from './CrmBoard';
import { CopyButton, HeatBadge, KIND_LABEL, KIND_TONE, dateTime } from './shared';

type Action = ReturnType<typeof nextAction>;
type Heat = ReturnType<typeof leadHeat>;

/** Chiffres clés selon le pipeline. */
export function DealNumbers({ deal }: { deal: Deal }) {
  const n = deal.numbers;
  const items: [string, number | null | undefined, string?][] =
    deal.kind === 'achat'
      ? n.purchasePrice
        ? [
            ['Acheté', n.purchasePrice],
            ['En vente', n.listedPrice],
            ['Vendu', n.soldPrice],
          ]
        : [
            ['Affiché', n.askingPrice],
            ['Ton offre', n.offerPrice],
            ['Max pépite', n.maxBuyPrice, 'Au-dessus, la marge passe sous le seuil PÉPITE'],
            ['Plafond', n.walkAwayPrice, 'Ne jamais dépasser : marge réelle à 0'],
          ]
      : deal.kind === 'mandat'
        ? [
            ['Affiché', n.askingPrice],
            ['Net vendeur', n.ownerNet],
            ['Vente visée', n.listedPrice ?? n.salePrice],
          ]
        : [
            ['Prix affiché', n.listedPrice],
            ['Plancher', n.floorPrice, 'En dessous : contre-proposer'],
          ];
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([label, value, title]) => (
          <div key={label} title={title}>
            <dt className="inline text-ink-400">{label} </dt>
            <dd className="tabular inline font-semibold text-ink-900">{eur(Number(value))}</dd>
          </div>
        ))}
    </dl>
  );
}

export function ActionCard({ deal, action, heat, onAct, onOpen }: { deal: Deal; action: Action; heat: Heat; onAct: (id: string, action: DealActionBody) => Promise<boolean>; onOpen: () => void }) {
  const [message, setMessage] = useState(action.message ?? '');
  const [reply, setReply] = useState('');
  const [price, setPrice] = useState(String(action.offer ?? ''));
  const [pending, setPending] = useState(false);
  const lastIn = [...deal.events].reverse().find((e) => e.type === 'in');
  const party = deal.kind === 'revente' ? "l'acheteur" : 'le vendeur';
  const vehicleUrl = adUrl({ ...deal.vehicle, id: deal.vehicle.listingId });

  const run = async (body: DealActionBody) => {
    setPending(true);
    const ok = await onAct(deal.id, body);
    setPending(false);
    return ok;
  };

  const sendLabel = action.kind === 'relancer' ? 'Copier + relance envoyée' : 'Copier + marquer envoyé';
  const canSend = ['repondre', 'contacter', 'relancer', 'visite'].includes(action.kind) && message.trim().length > 0;

  return (
    <article className={cn('card flex min-w-0 flex-col gap-3 p-4', heat.level === 'chaud' && 'border-rose-300 dark:border-rose-500/40')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <HeatBadge level={heat.level} score={heat.score} />
            <Chip tone={KIND_TONE[deal.kind]}>{KIND_LABEL[deal.kind]}</Chip>
            {deal.vehicle.areaType === 'campagne' && <Chip tone="green">🌾 Campagne</Chip>}
            {deal.source === 'radar' && <Chip>Radar</Chip>}
          </div>
          <h3 className="mt-1.5 truncate text-[15px] font-semibold text-ink-900" title={deal.vehicle.title}>
            {vehicleUrl ? (
              <a href={vehicleUrl} target="_blank" rel="noreferrer" className="hover:underline">
                {deal.vehicle.title} ↗
              </a>
            ) : (
              deal.vehicle.title
            )}
          </h3>
          <p className="truncate text-xs text-ink-500">
            {deal.vehicle.year} · {Number(deal.vehicle.mileage).toLocaleString('fr-FR')} km
            {deal.vehicle.location && ` · ${deal.vehicle.location}`}
            {deal.contact.name && ` · ${deal.contact.name}`}
          </p>
        </div>
        <button type="button" className="btn-ghost -mr-2 px-2 text-xs" onClick={onOpen}>
          Fiche →
        </button>
      </div>

      <DealNumbers deal={deal} />

      {heat.reasons.length > 0 && <p className="text-xs text-ink-600">{heat.reasons.join(' · ')}</p>}

      {lastIn && action.kind === 'repondre' && (
        <blockquote className="rounded-lg border-l-4 border-rose-400 bg-ink-50 px-3 py-2 text-sm text-ink-700">
          <span className="mb-0.5 block text-[11px] text-ink-400">{dateTime(lastIn.at)}</span>
          {lastIn.text}
        </blockquote>
      )}

      <p className={cn('text-sm font-semibold', action.overdue ? 'text-rose-600 dark:text-rose-400' : 'text-ink-900')}>
        {action.overdue && '⏰ '}
        {action.label}
      </p>

      {action.message !== undefined && (
        <textarea className="input min-h-[120px] text-[13px] leading-relaxed" value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Message à envoyer" />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canSend && (
          <>
            <CopyButton text={message} />
            <CopyButton
              text={message}
              label={sendLabel}
              primary
              onCopied={() => run({ type: 'outbound', text: message, ...(action.offer && action.kind !== 'visite' ? { offer: action.offer } : {}) })}
            />
          </>
        )}
        {action.kind === 'publier' && (
          <>
            <CopyButton text={message} label="Copier l'annonce" />
            <input className="input h-8 w-28 py-1" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Prix de vente" />
            <button type="button" className="btn-primary text-xs" disabled={pending} onClick={() => run({ type: 'stage', stage: 'en_vente', amount: Number(price) })}>
              Publiée à ce prix
            </button>
          </>
        )}
        {action.kind === 'carte_grise' && (
          <button type="button" className="btn-primary text-xs" disabled={pending} onClick={() => run({ type: 'doc', id: 'immat', done: true })}>
            ✓ Carte grise faite
          </button>
        )}
        {action.kind === 'preparer' && (
          <button type="button" className="btn-primary text-xs" disabled={pending} onClick={() => run({ type: 'stage', stage: deal.stage === 'preparation' ? 'en_vente' : 'preparation' })}>
            {deal.stage === 'preparation' ? 'Prête : mettre en vente' : 'Démarrer la préparation'}
          </button>
        )}
        {action.kind === 'cloturer' && (
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={pending}
            onClick={() => run({ type: 'stage', stage: 'perdu', lostReason: lastIn?.intent === 'vendu' ? LOST_REASONS[0] : 'Plus de réponse' })}
          >
            Classer en perdu
          </button>
        )}
        {action.kind === 'visite' && (
          <button type="button" className="btn-secondary text-xs" onClick={onOpen}>
            Papiers & date
          </button>
        )}
        {vehicleUrl && (
          <a className="btn-secondary text-xs" href={vehicleUrl} target="_blank" rel="noreferrer">
            Ouvrir l’annonce ↗
          </a>
        )}
      </div>

      {['repondre', 'relancer', 'cloturer', 'visite'].includes(action.kind) || deal.stage === 'contacte' || deal.stage === 'discussion' ? (
        <div className="space-y-2 border-t border-ink-100 pt-3">
          <textarea
            className="input min-h-[60px] text-[13px]"
            placeholder={`Colle ici la réponse de ${party} : le CRM la lit et prépare ta réponse`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={pending || !reply.trim()}
            onClick={async () => {
              if (await run({ type: 'inbound', text: reply })) setReply('');
            }}
          >
            Analyser la réponse
          </button>
        </div>
      ) : null}
    </article>
  );
}
