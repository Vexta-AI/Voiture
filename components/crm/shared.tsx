'use client';

import { useState } from 'react';

import { cn } from '@/lib/format';

export const KIND_LABEL = { achat: 'Achat', mandat: 'Mandat', revente: 'Acheteur' } as const;
export const KIND_TONE = { achat: 'blue', mandat: 'green', revente: 'amber' } as const;

const HEAT_STYLE = {
  chaud: 'bg-rose-600 text-white',
  tiede: 'bg-amber-500 text-white',
  froid: 'bg-ink-200 text-ink-700',
  stock: 'bg-sky-600 text-white',
  clos: 'bg-ink-100 text-ink-500',
} as const;
const HEAT_LABEL = { chaud: '🔥 Chaud', tiede: 'Tiède', froid: 'Froid', stock: 'Stock', clos: 'Clos' } as const;

export function HeatBadge({ level, score }: { level: keyof typeof HEAT_STYLE; score?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold', HEAT_STYLE[level])}>
      {HEAT_LABEL[level]}
      {score !== undefined && (level === 'chaud' || level === 'tiede' || level === 'froid') && <span className="tabular opacity-80">{score}</span>}
    </span>
  );
}

/** Bouton "Copier" avec retour visuel. */
export function CopyButton({ text, label = 'Copier', primary, onCopied }: { text: string; label?: string; primary?: boolean; onCopied?: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cn(primary ? 'btn-primary' : 'btn-secondary', 'text-xs')}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* presse-papiers indisponible : le texte reste sélectionnable */
        }
        setDone(true);
        onCopied?.();
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? '✓ Copié' : label}
    </button>
  );
}

export const dateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** Valeur datetime-local (heure locale) depuis un ISO. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
