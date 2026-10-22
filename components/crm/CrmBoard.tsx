'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PIPELINES } from '@/backend/config/crm.js';
import { actionQueue, crmStats, leadHeat, nextAction } from '@/backend/utils/crm.js';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { Deal, DealKind } from '@/lib/crm';
import { cn, eur } from '@/lib/format';

import { ActionCard } from './ActionCard';
import { DealDrawer } from './DealDrawer';
import { HeatBadge, KIND_LABEL } from './shared';

type View = 'todo' | 'pipeline';
type KindFilter = 'all' | DealKind;
export type DealActionBody = Record<string, unknown> & { type: string };

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'hot' | 'money' }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={cn('tabular mt-1 text-xl font-semibold text-ink-900', accent === 'hot' && 'text-rose-600 dark:text-rose-400', accent === 'money' && 'text-emerald-600 dark:text-emerald-400')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-400">{sub}</p>}
    </div>
  );
}

export function CrmBoard({ initialDeals, enabled }: { initialDeals: Deal[]; enabled: boolean }) {
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [view, setView] = useState<View>('todo');
  const [kind, setKind] = useState<KindFilter>('all');
  const [pipelineKind, setPipelineKind] = useState<DealKind>('achat');
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Chaleur et relances dépendent de l'heure : recalcul chaque minute.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const merge = useCallback((updated: Deal[]) => {
    setDeals((prev) => {
      const byId = new Map(prev.map((d) => [d.id, d]));
      for (const d of updated) byId.set(d.id, d);
      return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/crm', { cache: 'no-store' });
      const json = await res.json();
      if (json.ok) setDeals(json.deals);
      else setError(json.error ?? 'Erreur de chargement');
    } catch {
      setError('Erreur réseau');
    } finally {
      setBusy(false);
      setNow(new Date());
    }
  }, []);

  const act = useCallback(
    async (id: string, action: DealActionBody) => {
      setError(null);
      const res = await fetch(`/api/crm/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
      const json = await res.json().catch(() => ({ ok: false, error: `Erreur ${res.status}` }));
      if (!json.ok) {
        setError(json.error ?? 'Action refusée');
        return false;
      }
      merge(json.updated ?? [json.deal]);
      setNow(new Date());
      return true;
    },
    [merge],
  );

  const addBuyer = useCallback(
    async (vehicleId: string, contact: { name?: string; phone?: string }) => {
      const res = await fetch('/api/crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'revente', vehicleId, contact }) });
      const json = await res.json().catch(() => ({ ok: false }));
      if (json.ok) {
        merge([json.deal]);
        return json.deal as Deal;
      }
      setError(json.error ?? 'Ajout impossible');
      return null;
    },
    [merge],
  );

  const remove = useCallback(async (id: string) => {
    await fetch(`/api/crm/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setDeals((prev) => prev.filter((d) => d.id !== id));
    setSelected(null);
  }, []);

  const scoped = useMemo(() => (kind === 'all' ? deals : deals.filter((d) => d.kind === kind)), [deals, kind]);
  const stats = useMemo(() => crmStats(deals, now), [deals, now]);
  const queue = useMemo(() => actionQueue(scoped, now), [scoped, now]);
  const hotQueue = queue.filter((q) => q.heat.level === 'chaud' || q.action.kind === 'repondre');
  const otherQueue = queue.filter((q) => !hotQueue.includes(q));
  const selectedDeal = deals.find((d) => d.id === selected) ?? null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-lg text-surface" aria-label="Retour au radar">
              ◎
            </Link>
            <div>
              <h1 className="text-base font-semibold leading-tight text-ink-900">CRM Pépite Radar</h1>
              <p className="hidden text-xs text-ink-500 sm:block">Le radar remplit, le CRM prépare les messages : tu ne traites que les leads chauds.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <button type="button" className="btn-ghost text-xs" onClick={refresh} disabled={busy}>
              {busy ? '…' : '↻'}
              <span className="hidden sm:inline">Actualiser</span>
            </button>
            <Link href="/" className="btn-secondary whitespace-nowrap text-xs">
              ← Radar
            </Link>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6" role="tablist">
          {(
            [
              ['todo', `À traiter (${queue.length})`],
              ['pipeline', 'Pipeline'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn('shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition', view === key ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800')}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        {!enabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            CRM inactif : branche Vercel Blob (BLOB_READ_WRITE_TOKEN) pour enregistrer tes deals.
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <span>{error}</span>
            <button type="button" className="btn-ghost px-2 text-xs" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Kpi label="🔥 Leads chauds" value={String(stats.hot)} sub="à traiter en premier" accent="hot" />
          <Kpi label="💬 À répondre" value={String(stats.toReply)} sub={`${stats.toContact} à contacter`} />
          <Kpi label="🔁 Relances" value={String(stats.followUps)} sub="messages prêts" />
          <Kpi label="📍 Visites / essais" value={String(stats.visits)} />
          <Kpi label="Stock" value={String(stats.stock)} sub={`${eur(stats.invested)} immobilisés`} />
          <Kpi label="Marge attendue" value={eur(stats.pipeline)} sub={`${stats.leads} leads en cours`} accent="money" />
          <Kpi label="Encaissé ce mois" value={eur(stats.realizedMonth)} sub={`${stats.won} vendus · ${stats.lost} perdus`} accent="money" />
        </section>

        {view === 'todo' ? (
          <>
            <KindFilterBar value={kind} onChange={setKind} deals={deals} />
            {queue.length === 0 ? (
              <div className="card px-6 py-16 text-center">
                <p className="text-sm font-medium text-ink-700">Rien à traiter pour l’instant.</p>
                <p className="mt-1 text-sm text-ink-500">Les pépites du radar arrivent ici automatiquement, avec leur premier message prêt. Ajoute aussi une annonce depuis le radar (bouton « + CRM »).</p>
              </div>
            ) : (
              <div className="space-y-6">
                {hotQueue.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-ink-900">🔥 Clients chauds : ils attendent ta réponse</h2>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {hotQueue.map((q) => (
                        <ActionCard key={`${q.deal.id}-${q.deal.updatedAt}`} deal={q.deal} action={q.action} heat={q.heat} onAct={act} onOpen={() => setSelected(q.deal.id)} />
                      ))}
                    </div>
                  </section>
                )}
                {otherQueue.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-ink-900">À faire : premiers messages, relances, papiers</h2>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {otherQueue.map((q) => (
                        <ActionCard key={`${q.deal.id}-${q.deal.updatedAt}`} deal={q.deal} action={q.action} heat={q.heat} onAct={act} onOpen={() => setSelected(q.deal.id)} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        ) : (
          <PipelineView deals={deals} kind={pipelineKind} onKind={setPipelineKind} now={now} onOpen={setSelected} />
        )}
      </main>

      <DealDrawer
        deal={selectedDeal}
        deals={deals}
        now={now}
        onClose={() => setSelected(null)}
        onAct={act}
        onAddBuyer={addBuyer}
        onOpen={setSelected}
        onDelete={remove}
      />
    </div>
  );
}

function KindFilterBar({ value, onChange, deals }: { value: KindFilter; onChange: (k: KindFilter) => void; deals: Deal[] }) {
  const options: { id: KindFilter; label: string }[] = [
    { id: 'all', label: 'Tout' },
    { id: 'achat', label: 'Achat-revente' },
    { id: 'mandat', label: 'Mandats' },
    { id: 'revente', label: 'Acheteurs' },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn('rounded-full border px-3 py-1 text-xs font-medium transition', value === o.id ? 'border-ink-900 bg-ink-900 text-surface' : 'border-ink-200 bg-surface text-ink-600 hover:border-ink-300')}
        >
          {o.label}
          <span className="tabular ml-1 opacity-60">{o.id === 'all' ? deals.length : deals.filter((d) => d.kind === o.id).length}</span>
        </button>
      ))}
    </div>
  );
}

function PipelineView({ deals, kind, onKind, now, onOpen }: { deals: Deal[]; kind: DealKind; onKind: (k: DealKind) => void; now: Date; onOpen: (id: string) => void }) {
  const stages = PIPELINES[kind].stages;
  const ofKind = deals.filter((d) => d.kind === kind);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(PIPELINES) as DealKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onKind(k)}
            aria-pressed={kind === k}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium transition', kind === k ? 'border-ink-900 bg-ink-900 text-surface' : 'border-ink-200 bg-surface text-ink-600 hover:border-ink-300')}
          >
            {PIPELINES[k].label}
            <span className="tabular ml-1 opacity-60">{deals.filter((d) => d.kind === k).length}</span>
          </button>
        ))}
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {stages.map((stage) => {
          const items = ofKind.filter((d) => d.stage === stage.id);
          return (
            <section key={stage.id} className="w-64 shrink-0 rounded-xl border border-ink-200 bg-ink-50/60 p-2">
              <h3 className="flex items-center justify-between px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                {stage.label}
                <span className="tabular rounded-full bg-ink-100 px-1.5 text-[11px] text-ink-600">{items.length}</span>
              </h3>
              <div className="space-y-2">
                {items.map((deal) => {
                  const heat = leadHeat(deal, now);
                  const action = nextAction(deal, now);
                  return (
                    <button key={deal.id} type="button" onClick={() => onOpen(deal.id)} className="card block w-full p-2.5 text-left transition hover:border-ink-300">
                      <div className="flex items-center justify-between gap-2">
                        <HeatBadge level={heat.level} score={heat.score} />
                        <span className="text-[11px] text-ink-400">{KIND_LABEL[deal.kind]}</span>
                      </div>
                      <p className="mt-1.5 truncate text-sm font-medium text-ink-900">{deal.vehicle.title}</p>
                      <p className="truncate text-xs text-ink-500">{deal.contact.name ?? deal.vehicle.location ?? '—'}</p>
                      <p className={cn('mt-1 text-xs', action.overdue ? 'text-rose-600 dark:text-rose-400' : 'text-ink-600')}>{action.label}</p>
                    </button>
                  );
                })}
                {items.length === 0 && <p className="px-1 py-3 text-center text-xs text-ink-400">—</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
