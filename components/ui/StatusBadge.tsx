import { cn } from '@/lib/format';
import type { StatusKey } from '@/lib/types';

const STYLES: Record<StatusKey, string> = {
  PEPITE: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-600/20 dark:ring-emerald-400/30',
  SURVEILLER: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-600/20 dark:ring-amber-400/30',
  REFUSE: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-600/20 dark:ring-rose-400/30',
};

export function StatusBadge({ status, label, className }: { status: StatusKey; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset', STYLES[status], className)}>
      {label}
    </span>
  );
}
