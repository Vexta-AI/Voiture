import { cn } from '@/lib/format';
import type { TabKey } from '@/lib/types';

export function TabNav({
  tabs,
  active,
  counts,
  onChange,
}: {
  tabs: { key: TabKey; label: string }[];
  active: TabKey;
  counts: Record<TabKey, number>;
  onChange: (tab: TabKey) => void;
}) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
      {tabs.map((t) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition',
              selected ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800',
            )}
          >
            {t.label}
            <span
              className={cn('tabular rounded-full px-1.5 py-0.5 text-[11px] font-semibold', selected ? 'bg-ink-900 text-surface' : 'bg-ink-100 text-ink-600')}
              title={t.key === 'mandat' ? 'Annonces ciblables en mandat' : 'Pépites potentielles'}
            >
              {counts[t.key]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
