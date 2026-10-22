'use client';

import { useState } from 'react';

import { DOCUMENTS, LOST_REASONS, PIPELINES } from '@/backend/config/crm.js';
import { dealEconomics, leadHeat, listedPriceOf, nextAction } from '@/backend/utils/crm.js';
import { Chip } from '@/components/ui/Chip';
import { Modal } from '@/components/ui/Modal';
import type { Deal } from '@/lib/crm';
import { cn, eur, signedEur } from '@/lib/format';

import { DealNumbers } from './ActionCard';
import type { DealActionBody } from './CrmBoard';
import { CopyButton, HeatBadge, KIND_LABEL, KIND_TONE, dateTime, toLocalInput } from './shared';

type Props = {
  deal: Deal | null;
  deals: Deal[];
  now: Date;
  onClose: () => void;
  onAct: (id: string, action: DealActionBody) => Promise<boolean>;
  onAddBuyer: (vehicleId: string, contact: { name?: string; phone?: string }) => Promise<Deal | null>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
};

export function DealDrawer(props: Props) {
  const { deal, onClose } = props;
  return (
    <Modal open={deal !== null} onClose={onClose} title={deal?.vehicle.title ?? ''} subtitle={deal ? `${KIND_LABEL[deal.kind]} · ${PIPELINES[deal.kind].stages.find((s) => s.id === deal.stage)?.label}` : undefined} side>
      {deal && <DealPanel key={`${deal.id}-${deal.updatedAt}`} {...props} deal={deal} />}
    </Modal>
  );
}

/** Champs chiffrés modifiables selon le pipeline. */
const NUMBER_FIELDS = {
  achat: [
    ['offerPrice', 'Ton offre'],
    ['maxBuyPrice', 'Prix max pépite'],
    ['walkAwayPrice', 'Prix plafond'],
    ['purchasePrice', "Prix d'achat réel"],
    ['registrationCost', 'Carte grise'],
    ['transportCost', 'Rapatriement'],
    ['reconditioning', 'Remise en état'],
    ['extraCosts', 'Autres frais'],
    ['listedPrice', 'Prix affiché revente'],
    ['floorPrice', 'Prix plancher revente'],
    ['soldPrice', 'Prix de vente réel'],
  ],
  mandat: [
    ['ownerNet', 'Prix net vendeur'],
    ['salePrice', 'Prix de vente visé'],
    ['listedPrice', 'Prix affiché'],
    ['floorPrice', 'Prix plancher'],
    ['soldPrice', 'Prix de vente réel'],
  ],
  revente: [
    ['listedPrice', 'Prix affiché'],
    ['floorPrice', 'Prix plancher'],
  ],
} as const;

function DealPanel({ deal, deals, now, onAct, onAddBuyer, onOpen, onDelete }: Props & { deal: Deal }) {
  const [contact, setContact] = useState({ name: deal.contact.name ?? '', phone: deal.contact.phone ?? '', channel: deal.contact.channel ?? 'leboncoin' });
  const [numbers, setNumbers] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(deal.numbers).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])));
  const [stage, setStage] = useState(deal.stage);
  const [stageAmount, setStageAmount] = useState('');
  const [lostReason, setLostReason] = useState(LOST_REASONS[0]);
  const [rdv, setRdv] = useState(toLocalInput(deal.rdvAt));
  const [inbound, setInbound] = useState('');
  const [outbound, setOutbound] = useState('');
  const [note, setNote] = useState('');
  const [buyer, setBuyer] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const heat = leadHeat(deal, now);
  const action = nextAction(deal, now);
  const money = dealEconomics(deal);
  const stages = PIPELINES[deal.kind].stages;
  const docs = DOCUMENTS[deal.kind];
  const buyers = deals.filter((d) => d.vehicleDealId === deal.id);
  const vehicle = deal.vehicleDealId ? deals.find((d) => d.id === deal.vehicleDealId) : null;
  const canHaveBuyers = deal.kind !== 'revente' && ['en_vente', 'signe', 'vendu'].includes(deal.stage);
  const amountHint: Record<string, string> = { achete: "Prix d'achat", signe: 'Prix net', en_vente: 'Prix affiché', vendu: 'Prix de vente' };

  const run = async (body: DealActionBody) => {
    setSaving(true);
    const ok = await onAct(deal.id, body);
    setSaving(false);
    return ok;
  };

  return (
    <div className="space-y-6 pb-8">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <HeatBadge level={heat.level} score={heat.score} />
          <Chip tone={KIND_TONE[deal.kind]}>{KIND_LABEL[deal.kind]}</Chip>
          {deal.vehicle.areaType === 'campagne' && <Chip tone="green">🌾 Campagne</Chip>}
          {deal.vehicle.distanceKm !== null && deal.vehicle.distanceKm !== undefined && <Chip>{deal.vehicle.distanceKm} km</Chip>}
          {deal.vehicle.url && (
            <a className="text-xs font-medium text-sky-700 underline dark:text-sky-400" href={deal.vehicle.url} target="_blank" rel="noreferrer">
              Annonce ↗
            </a>
          )}
        </div>
        <DealNumbers deal={deal} />
        <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm">
          <p className={cn('font-semibold', action.overdue ? 'text-rose-600 dark:text-rose-400' : 'text-ink-900')}>Prochaine étape : {action.label}</p>
          {heat.reasons.length > 0 && <p className="mt-0.5 text-xs text-ink-500">{heat.reasons.join(' · ')}</p>}
          {action.message && (
            <div className="mt-2 space-y-2">
              <pre className="whitespace-pre-wrap rounded-md bg-surface p-2 font-sans text-[13px] leading-relaxed text-ink-700">{action.message}</pre>
              <div className="flex gap-2">
                <CopyButton text={action.message} />
                {['repondre', 'contacter', 'relancer'].includes(action.kind) && (
                  <CopyButton text={action.message} label="Copier + marquer envoyé" primary onCopied={() => run({ type: 'outbound', text: action.message ?? '', ...(action.offer ? { offer: action.offer } : {}) })} />
                )}
              </div>
            </div>
          )}
        </div>
        {vehicle && (
          <button type="button" className="text-xs text-sky-700 underline dark:text-sky-400" onClick={() => onOpen(vehicle.id)}>
            Voir le véhicule ({PIPELINES[vehicle.kind].stages.find((s) => s.id === vehicle.stage)?.label})
          </button>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Messages</h3>
        <textarea className="input min-h-[60px] text-[13px]" placeholder="Colle la réponse reçue : le CRM la lit (accord, contre-offre, question, refus)" value={inbound} onChange={(e) => setInbound(e.target.value)} />
        <button type="button" className="btn-secondary text-xs" disabled={saving || !inbound.trim()} onClick={async () => (await run({ type: 'inbound', text: inbound })) && setInbound('')}>
          Réponse reçue
        </button>
        <textarea className="input min-h-[60px] text-[13px]" placeholder="Message que tu as envoyé (si tu l'as écrit toi-même)" value={outbound} onChange={(e) => setOutbound(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-xs" disabled={saving || !outbound.trim()} onClick={async () => (await run({ type: 'outbound', text: outbound })) && setOutbound('')}>
            Message envoyé
          </button>
          <button type="button" className="btn-ghost text-xs" disabled={saving} onClick={() => run({ type: 'call', text: 'Appel passé' })}>
            📞 Appel passé
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Étape</h3>
        <div className="flex flex-wrap items-end gap-2">
          <select className="input h-9 w-auto py-1" value={stage} onChange={(e) => setStage(e.target.value)}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {amountHint[stage] && <input className="input h-9 w-32 py-1" inputMode="numeric" placeholder={amountHint[stage]} value={stageAmount} onChange={(e) => setStageAmount(e.target.value)} />}
          {stage === 'perdu' && (
            <select className="input h-9 w-auto py-1" value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
              {LOST_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn-primary text-xs"
            disabled={saving || (stage === deal.stage && !stageAmount)}
            onClick={async () => (await run({ type: 'stage', stage, ...(Number(stageAmount) > 0 ? { amount: Number(stageAmount) } : {}), ...(stage === 'perdu' ? { lostReason } : {}) })) && setStageAmount('')}
          >
            Valider
          </button>
        </div>
        <label className="label mt-2" htmlFor="rdv">
          {deal.kind === 'mandat' ? 'RDV signature' : deal.kind === 'revente' ? 'Essai' : 'Visite / essai'}
        </label>
        <div className="flex gap-2">
          <input id="rdv" type="datetime-local" className="input h-9 w-auto py-1" value={rdv} onChange={(e) => setRdv(e.target.value)} />
          <button type="button" className="btn-secondary text-xs" disabled={saving} onClick={() => run({ type: 'update', rdvAt: rdv ? new Date(rdv).toISOString() : null })}>
            Enregistrer
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">{deal.kind === 'revente' ? 'Acheteur' : 'Vendeur'}</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Nom / pseudo" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
          <input className="input" placeholder="Téléphone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          <select className="input" value={contact.channel} onChange={(e) => setContact({ ...contact, channel: e.target.value })}>
            <option value="leboncoin">Messagerie LeBonCoin</option>
            <option value="telephone">Téléphone</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary text-xs" disabled={saving} onClick={() => run({ type: 'update', contact })}>
            Enregistrer le contact
          </button>
          {contact.phone && (
            <a className="btn-ghost text-xs" href={`tel:${contact.phone.replace(/\s/g, '')}`}>
              📞 Appeler
            </a>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Argent</h3>
        {deal.kind !== 'revente' && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <p className="text-xs text-ink-500">Marge attendue</p>
              <p className="tabular font-semibold text-ink-900">{signedEur(money.expected)}</p>
            </div>
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <p className="text-xs text-ink-500">Marge encaissée</p>
              <p className="tabular font-semibold text-emerald-600 dark:text-emerald-400">{money.realized === null ? '—' : signedEur(money.realized)}</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {NUMBER_FIELDS[deal.kind].map(([key, label]) => (
            <label key={key} className="block">
              <span className="label">{label}</span>
              <input className="input h-9 py-1" inputMode="numeric" value={numbers[key] ?? ''} onChange={(e) => setNumbers({ ...numbers, [key]: e.target.value })} />
            </label>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={saving}
          onClick={() =>
            run({
              type: 'update',
              numbers: Object.fromEntries(NUMBER_FIELDS[deal.kind].map(([key]) => [key, numbers[key] === '' || numbers[key] === undefined ? null : Number(String(numbers[key]).replace(/[\s€]/g, ''))])),
            })
          }
        >
          Enregistrer les chiffres
        </button>
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          Papiers ({docs.filter((d) => deal.docs[d.id]).length}/{docs.length})
        </h3>
        {docs.map((d) => (
          <label key={d.id} className="flex items-start gap-2 text-sm text-ink-700">
            <input type="checkbox" className="mt-0.5" checked={Boolean(deal.docs[d.id])} disabled={saving} onChange={(e) => run({ type: 'doc', id: d.id, done: e.target.checked })} />
            <span className={cn(deal.docs[d.id] && 'text-ink-400 line-through')}>{d.label}</span>
          </label>
        ))}
      </section>

      {canHaveBuyers && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Acheteurs ({buyers.length})</h3>
          <p className="text-xs text-ink-500">
            Prix affiché {eur(listedPriceOf(deal))} : chaque acheteur intéressé a sa fiche, ses messages et sa chaleur.
          </p>
          {buyers.map((b) => {
            const h = leadHeat(b, now);
            return (
              <button key={b.id} type="button" onClick={() => onOpen(b.id)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink-200 px-3 py-2 text-left text-sm hover:border-ink-300">
                <span className="truncate">{b.contact.name || 'Acheteur'}</span>
                <span className="flex items-center gap-2">
                  <HeatBadge level={h.level} score={h.score} />
                  <span className="text-xs text-ink-500">{PIPELINES.revente.stages.find((s) => s.id === b.stage)?.label}</span>
                </span>
              </button>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <input className="input h-9 w-40 py-1" placeholder="Nom / pseudo" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
            <input className="input h-9 w-36 py-1" placeholder="Téléphone" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} />
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={saving}
              onClick={async () => {
                const created = await onAddBuyer(deal.id, buyer);
                if (created) {
                  setBuyer({ name: '', phone: '' });
                  onOpen(created.id);
                }
              }}
            >
              + Acheteur
            </button>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Historique</h3>
        <div className="flex gap-2">
          <input className="input h-9 py-1" placeholder="Ajouter une note" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn-secondary text-xs" disabled={saving || !note.trim()} onClick={async () => (await run({ type: 'note', text: note })) && setNote('')}>
            Noter
          </button>
        </div>
        <ol className="space-y-2">
          {[...deal.events].reverse().map((e) => (
            <li key={e.id} className={cn('rounded-lg px-3 py-2 text-sm', e.type === 'in' ? 'bg-rose-50 dark:bg-rose-500/10' : e.type === 'out' ? 'bg-sky-50 dark:bg-sky-500/10' : 'bg-ink-50')}>
              <p className="mb-0.5 text-[11px] text-ink-400">
                {dateTime(e.at)} · {e.type === 'in' ? 'Reçu' : e.type === 'out' ? 'Envoyé' : e.type === 'stage' ? 'Étape' : e.type === 'call' ? 'Appel' : 'Note'}
                {e.intent && ` · ${e.intent.replace('_', ' ')}`}
                {e.amount ? ` · ${eur(e.amount)}` : ''}
              </p>
              <p className="whitespace-pre-wrap text-ink-700">{e.text}</p>
            </li>
          ))}
          <li className="text-[11px] text-ink-400">Créé le {dateTime(deal.createdAt)} ({deal.source === 'radar' ? 'radar automatique' : 'ajout manuel'})</li>
        </ol>
      </section>

      <button
        type="button"
        className="btn-ghost text-xs text-rose-600 dark:text-rose-400"
        onClick={() => {
          if (window.confirm('Supprimer définitivement ce deal ?')) onDelete(deal.id);
        }}
      >
        Supprimer le deal
      </button>
    </div>
  );
}
