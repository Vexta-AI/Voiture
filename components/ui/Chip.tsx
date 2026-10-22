import { cn } from '@/lib/format';

const TONES = {
  green: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  red: 'bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
  slate: 'bg-ink-50 text-ink-700 border-ink-200',
  blue: 'bg-sky-50 dark:bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30',
} as const;

export function Chip({
  tone = 'slate',
  children,
  title,
  className,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  );
}
