import { cn } from '@/lib/format';

const TONES = {
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-rose-50 text-rose-800 border-rose-200',
  slate: 'bg-ink-50 text-ink-700 border-ink-200',
  blue: 'bg-sky-50 text-sky-800 border-sky-200',
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
