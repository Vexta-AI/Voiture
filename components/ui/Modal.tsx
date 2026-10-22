'use client';

import { useEffect } from 'react';

import { cn } from '@/lib/format';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  side = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Affichage en panneau latéral (drawer) plutôt qu'en modale centrée. */
  side?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fermer" className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          'relative flex max-h-full w-full flex-col bg-surface shadow-2xl',
          side ? 'ml-auto h-full max-w-2xl' : 'm-auto max-h-[90vh] max-w-2xl rounded-2xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost -mr-2 -mt-1 px-2" aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
