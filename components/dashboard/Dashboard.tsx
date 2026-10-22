'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AUTO_TARGETS, BUDGETS, MANDATE, MOTO_TARGETS, PRICE_BANDS, SEGMENTS } from '@/backend/config/rules.js';
import { scoreListings } from '@/backend/utils/scoring.js';
import { AnalyzerDrawer } from '@/components/analyzer/AnalyzerDrawer';
import { ListingCard, type MessageKind } from '@/components/listing/ListingCard';
import { MessageModal } from '@/components/messages/MessageModal';
import { OutreachModal } from '@/components/messages/OutreachModal';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { Listing, ScoredListing, StatusKey, TabKey } from '@/lib/types';

import { FilterBar, type Option, type SortKey, type StatusFilter, type ZoneFilter } from './FilterBar';
import { KpiBar } from './KpiBar';
import { MandateRules } from './MandateRules';
import { TabNav } from './TabNav';

const STORAGE_KEY = 'pepite-radar:user-listings';

export type RadarInfo =
  | { mode: 'live'; lastRun: string | null; poolSize: number; unpriced: number }
  | { mode: 'demo'; configured: boolean };

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: 'auto', label: BUDGETS.auto.label, hint: 'Toutes les voitures de 3 à 30 k€ : Nouvelle-Aquitaine en priorité, puis France entière (rapatriement déduit).' },
  { key: 'moto', label: BUDGETS.moto.label, hint: 'Roadsters, trails et maxi-scooters de 5 à 18 k€ : Nouvelle-Aquitaine en priorité, puis France entière.' },
  { key: 'mandat', label: 'Dépôt-Vente / Mandat (J+15)', hint: 'Annonces de ta zone en ligne depuis plus de 14 jours : sans-stock, zéro trésorerie.' },
];

const SORTERS: Record<SortKey, (a: ScoredListing, b: ScoredListing) => number> = {
  score: (a, b) => b.analysis.score - a.analysis.score,
  margin: (a, b) => b.analysis.finance.realNetMargin - a.analysis.finance.realNetMargin,
  days: (a, b) => b.analysis.daysOnline - a.analysis.daysOnline,
  price: (a, b) => a.listing.price - b.listing.price,
  distance: (a, b) => (a.analysis.distanceKm ?? 0) - (b.analysis.distanceKm ?? 0),
  mandate: (a, b) => (b.analysis.mandate?.totalRevenue ?? 0) - (a.analysis.mandate?.totalRevenue ?? 0),
};

export function Dashboard({ initialListings, radar }: { initialListings: Listing[]; radar: RadarInfo }) {
  const [tab, setTab] = useState<TabKey>('auto');
  const [userListings, setUserListings] = useState<Listing[]>([]);
  // Aucun modèle sélectionné = tous les modèles.
  const [targets, setTargets] = useState<Record<'auto' | 'moto', string[]>>({ auto: [], moto: [] });
  const [zone, setZone] = useState<ZoneFilter>('all');
  const [gamme, setGamme] = useState('all');
  const [band, setBand] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('score');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ item: ScoredListing; kind: MessageKind } | null>(null);
  const [outreach, setOutreach] = useState<ScoredListing | null>(null);
  const [analyzerOpen, setAnalyzerOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  /** Annonces déjà suivies dans le CRM (null = CRM non branché). */
  const [crmIds, setCrmIds] = useState<Set<string> | null>(null);

  // Annonces saisies manuellement : simple confort local, le moteur reste la source de vérité.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUserListings(JSON.parse(raw));
    } catch {
      /* stockage indisponible : on continue sans */
    }
    fetch('/api/crm')
      .then((r) => r.json())
      .then((d) => setCrmIds(d.ok ? new Set((d.deals as { kind: string; vehicle: { listingId: string } }[]).map((x) => `${x.kind}:${x.vehicle.listingId}`)) : null))
      .catch(() => setCrmIds(null));
    fetch('/api/messages')
      .then((r) => r.json())
      .then((d) => setAiEnabled(Boolean(d.aiEnabled)))
      .catch(() => setAiEnabled(false));
  }, []);

  const persist = useCallback((next: Listing[]) => {
    setUserListings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const addToCrm = useCallback(async (item: ScoredListing, kind: 'achat' | 'mandat') => {
    const res = await fetch('/api/crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, listing: item.listing }) });
    const json = await res.json().catch(() => ({ ok: false }));
    if (json.ok) setCrmIds((prev) => new Set([...(prev ?? []), `${kind}:${item.listing.id}`]));
  }, []);

  const scored = useMemo(() => scoreListings([...userListings, ...initialListings]) as ScoredListing[], [userListings, initialListings]);
  const userIds = useMemo(() => new Set(userListings.map((l) => l.id)), [userListings]);

  /** Périmètre de l'onglet (type, budget global, mandat). */
  const scope = useMemo(() => {
    if (tab === 'mandat') return scored.filter((s) => s.analysis.mandateEligible);
    const budget = BUDGETS[tab];
    return scored.filter((s) => s.listing.type === tab && s.listing.price >= budget.min && s.listing.price <= budget.max);
  }, [scored, tab]);

  /** Gamme d'une annonce : segment pour l'auto, famille (roadster, trail…) pour la moto. */
  const gammeOf = useCallback(
    (s: ScoredListing) => {
      if (s.listing.type !== 'moto') return s.analysis.segment;
      const target = MOTO_TARGETS.find((t) => s.analysis.targets.includes(t.id));
      return target?.family ?? 'Autre';
    },
    [],
  );
  // Annonces de démo / saisies à la main : sans GPS, considérées dans la zone prioritaire.
  const zoneOf = (s: ScoredListing) => s.analysis.zone ?? 'prioritaire';

  const countBy = (items: ScoredListing[], key: (s: ScoredListing) => string | null) => {
    const counts = new Map<string, number>();
    for (const s of items) {
      const k = key(s);
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  };

  /** Filtres zone / gamme / budget / modèles (avant statut et recherche). */
  const filtered = useMemo(() => {
    const selected = tab === 'mandat' ? [] : targets[tab];
    return scope.filter(
      (s) =>
        (zone === 'all' || zoneOf(s) === zone) &&
        (gamme === 'all' || gammeOf(s) === gamme) &&
        (band === 'all' || s.analysis.priceBand === band) &&
        (selected.length === 0 || userIds.has(s.listing.id) || s.analysis.targets.some((t: string) => selected.includes(t))),
    );
  }, [scope, zone, gamme, band, targets, tab, userIds, gammeOf]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filtered
      .filter((s) => status === 'ALL' || s.analysis.status.key === status)
      .filter((s) => !q || `${s.listing.title} ${s.listing.location ?? ''}`.toLowerCase().includes(q))
      .sort(SORTERS[tab === 'mandat' && sort === 'score' ? 'mandate' : sort]);
  }, [filtered, status, query, sort, tab]);

  const filterOptions = useMemo(() => {
    const zoneCounts = countBy(scope, zoneOf);
    const zones: Option[] = [
      { id: 'all', label: 'Toutes', count: scope.length },
      { id: 'prioritaire', label: 'Nouvelle-Aquitaine (200 km)', count: zoneCounts.get('prioritaire') ?? 0 },
      { id: 'france', label: 'France entière', count: zoneCounts.get('france') ?? 0 },
    ];
    const gammeCounts = countBy(scope, gammeOf);
    const gammeIds = tab === 'moto' ? [...gammeCounts.keys()].sort() : Object.keys(SEGMENTS).filter((k) => k !== 'moto');
    const gammes: Option[] = [
      { id: 'all', label: 'Toutes', count: scope.length },
      ...gammeIds.map((id) => ({ id, label: SEGMENTS[id as keyof typeof SEGMENTS]?.label ?? id, count: gammeCounts.get(id) ?? 0 })),
    ];
    const bandCounts = countBy(scope, (s) => s.analysis.priceBand);
    const bandList = tab === 'moto' ? PRICE_BANDS.moto : tab === 'auto' ? PRICE_BANDS.auto : [...PRICE_BANDS.auto, ...PRICE_BANDS.moto];
    const bands: Option[] = [{ id: 'all', label: 'Tous', count: scope.length }, ...bandList.map((b) => ({ id: b.id, label: b.label, count: bandCounts.get(b.id) ?? 0 }))];
    return { zones, gammes, bands };
  }, [scope, tab, gammeOf]);

  const counts = useMemo(
    () => ({
      auto: scored.filter((s) => s.listing.type === 'auto' && s.analysis.status.key === 'PEPITE').length,
      moto: scored.filter((s) => s.listing.type === 'moto' && s.analysis.status.key === 'PEPITE').length,
      mandat: scored.filter((s) => s.analysis.mandateEligible).length,
    }),
    [scored],
  );

  const statusCounts = useMemo(() => {
    const c: Record<StatusKey, number> = { PEPITE: 0, SURVEILLER: 0, REFUSE: 0 };
    for (const s of filtered) c[s.analysis.status.key] += 1;
    return c;
  }, [filtered]);

  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-lg text-surface" aria-hidden>
              ◎
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-ink-900">Pépite Radar</h1>
              <p className="hidden text-xs text-ink-500 sm:block">Veille · scoring · décision — Achat-revente & mandat Auto/Moto · Nouvelle-Aquitaine puis France</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Link href="/crm" className="btn-secondary">
              CRM
            </Link>
            <button type="button" className="btn-primary" onClick={() => setAnalyzerOpen(true)}>
              + Analyser<span className="hidden sm:inline"> une annonce</span>
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <TabNav
            tabs={TABS}
            active={tab}
            counts={counts}
            onChange={(t) => {
              setTab(t);
              setStatus('ALL');
              setGamme('all');
              setBand('all');
            }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <RadarBanner radar={radar} />
        <p className="text-sm text-ink-500">{activeTab.hint}</p>

        <KpiBar tab={tab} items={filtered} />

        {tab === 'mandat' && <MandateRules />}

        <FilterBar
          tab={tab}
          zones={filterOptions.zones}
          zone={zone}
          onZone={setZone}
          gammes={filterOptions.gammes}
          gamme={gamme}
          onGamme={setGamme}
          bands={filterOptions.bands}
          band={band}
          onBand={setBand}
          targets={tab === 'mandat' ? [] : tab === 'auto' ? AUTO_TARGETS : MOTO_TARGETS}
          selectedTargets={tab === 'mandat' ? [] : targets[tab]}
          onToggleTarget={(id) => {
            if (tab === 'mandat') return;
            setTargets((prev) => ({
              ...prev,
              [tab]: prev[tab].includes(id) ? prev[tab].filter((x) => x !== id) : [...prev[tab], id],
            }));
          }}
          onClearTargets={() => tab !== 'mandat' && setTargets((prev) => ({ ...prev, [tab]: [] }))}
          status={status}
          statusCounts={statusCounts}
          onStatus={setStatus}
          sort={sort}
          onSort={setSort}
          query={query}
          onQuery={setQuery}
        />

        {visible.length === 0 ? (
          <div className="card px-6 py-16 text-center">
            <p className="text-sm font-medium text-ink-700">Aucune annonce ne correspond aux filtres.</p>
            <p className="mt-1 text-sm text-ink-500">
              {tab === 'mandat'
                ? `Les annonces apparaissent ici après ${MANDATE.minDaysOnline - 1} jours en ligne.`
                : 'Élargissez les cibles ou ajoutez une annonce à analyser.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => (
              <ListingCard
                key={item.listing.id}
                item={item}
                mode={tab === 'mandat' ? 'mandate' : 'hunt'}
                onMessage={(it, kind) => setMessage({ item: it, kind })}
                onOutreach={setOutreach}
                onRemove={userIds.has(item.listing.id) ? (id) => persist(userListings.filter((l) => l.id !== id)) : undefined}
                crm={crmIds ? { inCrm: crmIds.has(`${tab === 'mandat' ? 'mandat' : 'achat'}:${item.listing.id}`), onAdd: addToCrm } : undefined}
              />
            ))}
          </div>
        )}

        <footer className="pt-4 text-center text-xs text-ink-400">
          Marge réelle = Cote pro − Prix affiché − 350 € remise en état − 200 € capital risque − carte grise − rapatriement (hors zone). Règle d’or : viser la moyenne du
          marché, jamais le prix le plus haut.
        </footer>
      </main>

      <MessageModal item={message?.item ?? null} kind={message?.kind ?? 'negotiation'} aiEnabled={aiEnabled} onClose={() => setMessage(null)} />
      <OutreachModal item={outreach} onClose={() => setOutreach(null)} />
      <AnalyzerDrawer open={analyzerOpen} onClose={() => setAnalyzerOpen(false)} onAdd={(l) => persist([l, ...userListings])} />
    </div>
  );
}

function RadarBanner({ radar }: { radar: RadarInfo }) {
  if (radar.mode === 'live') {
    const last = radar.lastRun ? new Date(radar.lastRun).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
        <span className="font-semibold">● Radar en direct (LeBonCoin)</span>
        <span>Dernière collecte : {last}</span>
        <span>{radar.poolSize} annonces en base de comparables</span>
        {radar.unpriced > 0 && <span className="text-ink-500">{radar.unpriced} récentes sans cote (pas assez de comparables)</span>}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-ink-200 bg-surface px-3 py-2 text-xs text-ink-600">
      <span className="font-semibold text-ink-800">Mode démo</span> — annonces fictives.{' '}
      {radar.configured
        ? 'Le radar est branché : les vraies annonces apparaîtront après la première collecte.'
        : 'Branche Apify, Vercel Blob et Telegram pour passer en réel (voir README).'}
    </div>
  );
}
