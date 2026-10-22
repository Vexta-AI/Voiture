import { cn } from '@/lib/format';
import type { StatusKey, TabKey } from '@/lib/types';

export type StatusFilter = 'ALL' | StatusKey;
export type SortKey = 'score' | 'margin' | 'days' | 'price' | 'mandate';

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'Tous' },
  { key: 'PEPITE', label: '🔥 Pépites' },
  { key: 'SURVEILLER', label: 'À surveiller' },
  { key: 'REFUSE', label: 'Refusés' },
];

export function FilterBar({
  tab,
  targets,
  selectedTargets,
  onToggleTarget,
  status,
  statusCounts,
  onStatus,
  sort,
  onSort,
  query,
  onQuery,
}: {
  tab: TabKey;
  targets: { id: string; label: string; cursus?: boolean; family?: string }[];
  selectedTargets: string[];
  onToggleTarget: (id: string) => void;
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
    <section className="space-y-3">
      {targets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-ink-500">Cibles</span>
          {targets.map((t) => {
            const on = selectedTargets.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onToggleTarget(t.id)}
                aria-pressed={on}
                title={t.family ?? (t.cursus ? 'Cible cursus (budget intermédiaire)' : undefined)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition',
                  on ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onStatus(o.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                status === o.key ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50',
              )}
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
            <option value="days">Jours en ligne</option>
            <option value="price">Prix croissant</option>
          </select>
        </label>
      </div>
    </section>
  );
}
