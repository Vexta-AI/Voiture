import { cn } from '@/lib/format';
import type { StatusKey } from '@/lib/types';

const STYLES: Record<StatusKey, string> = {
  PEPITE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  SURVEILLER: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  REFUSE: 'bg-rose-50 text-rose-700 ring-rose-600/20',
};

export function StatusBadge({ status, label, className }: { status: StatusKey; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset', STYLES[status], className)}>
      {label}
    </span>
  );
}
