import { cn } from '@/lib/format';
import type { StatusKey, TabKey } from '@/lib/types';

export type StatusFilter = 'ALL' | StatusKey;
export type SortKey = 'score' | 'margin' | 'days' | 'price' | 'distance' | 'mandate';
export type ZoneFilter = 'all' | 'prioritaire' | 'france';

export interface Option {
  id: string;
  label: string;
  count?: number;
}

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'Tous' },
  { key: 'PEPITE', label: '🔥 Pépites' },
  { key: 'SURVEILLER', label: 'À surveiller' },
  { key: 'REFUSE', label: 'Refusés' },
];

/** Groupe de puces à choix unique (« all » = pas de filtre). */
function Segmented({ label, options, value, onChange }: { label: string; options: Option[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-xs font-medium text-ink-500">{label}</span>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition',
            value === o.id ? 'border-ink-900 bg-ink-900 text-surface' : 'border-ink-200 bg-surface text-ink-600 hover:border-ink-300',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular ml-1 opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({
  tab,
  zones,
  zone,
  onZone,
  gammes,
  gamme,
  onGamme,
  bands,
  band,
  onBand,
  targets,
  selectedTargets,
  onToggleTarget,
  onClearTargets,
  status,
  statusCounts,
  onStatus,
  sort,
  onSort,
  query,
  onQuery,
}: {
  tab: TabKey;
  zones: Option[];
  zone: ZoneFilter;
  onZone: (z: ZoneFilter) => void;
  gammes: Option[];
  gamme: string;
  onGamme: (g: string) => void;
  bands: Option[];
  band: string;
  onBand: (b: string) => void;
  targets: { id: string; label: string }[];
  selectedTargets: string[];
  onToggleTarget: (id: string) => void;
  onClearTargets: () => void;
  status: StatusFilter;
  statusCounts: Record<StatusKey, number>;
  onStatus: (s: StatusFilter) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  const total = statusCounts.PEPITE + statusCounts.SURVEILLER + statusCounts.REFUSE;
  return (
    <section className="card space-y-2.5 p-3 sm:p-4">
      <Segmented label="Zone" options={zones} value={zone} onChange={(z) => onZone(z as ZoneFilter)} />
      {gammes.length > 1 && <Segmented label="Gamme" options={gammes} value={gamme} onChange={onGamme} />}
      {bands.length > 1 && <Segmented label="Budget" options={bands} value={band} onChange={onBand} />}

      {targets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-xs font-medium text-ink-500">Modèles</span>
          <button
            type="button"
            onClick={onClearTargets}
            aria-pressed={selectedTargets.length === 0}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              selectedTargets.length === 0 ? 'border-ink-900 bg-ink-900 text-surface' : 'border-ink-200 bg-surface text-ink-600 hover:border-ink-300',
            )}
          >
            Tous
          </button>
          {targets.map((t) => {
            const on = selectedTargets.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onToggleTarget(t.id)}
                aria-pressed={on}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition',
                  on ? 'border-ink-900 bg-ink-900 text-surface' : 'border-ink-200 bg-surface text-ink-600 hover:border-ink-300',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
        <div className="inline-flex flex-wrap rounded-lg border border-ink-200 bg-surface p-0.5">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onStatus(o.key)}
              className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition', status === o.key ? 'bg-ink-900 text-surface' : 'text-ink-600 hover:bg-ink-50')}
            >
              {o.label} <span className="tabular opacity-70">{o.key === 'ALL' ? total : statusCounts[o.key]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Rechercher modèle, ville…"
          className="input h-8 w-full py-1 sm:w-56"
        />
        <label className="ml-auto flex items-center gap-2 text-xs text-ink-500">
          Trier par
          <select value={sort} onChange={(e) => onSort(e.target.value as SortKey)} className="input h-8 w-auto py-1">
            <option value="score">{tab === 'mandat' ? 'Revenu mandat' : 'Score'}</option>
            <option value="margin">Marge nette</option>
            <option value="distance">Distance</option>
            <option value="days">Jours en ligne</option>
            <option value="price">Prix croissant</option>
          </select>
        </label>
      </div>
    </section>
  );
}
