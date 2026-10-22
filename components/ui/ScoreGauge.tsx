import { cn } from '@/lib/format';

/** Jauge circulaire 0-100. */
export function ScoreGauge({ score, size = 52 }: { score: number; size?: number }) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color = score >= 65 ? 'text-emerald-500' : score >= 35 ? 'text-amber-500' : score > 0 ? 'text-rose-400' : 'text-ink-300';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Score ${score} sur 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-ink-100" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('transition-[stroke-dashoffset] duration-500', color)}
        />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink-900">{score}</span>
    </div>
  );
}
