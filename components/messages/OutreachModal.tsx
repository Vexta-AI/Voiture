'use client';

import { useEffect, useState } from 'react';

import { Chip } from '@/components/ui/Chip';
import { Modal } from '@/components/ui/Modal';
import { cn, eur } from '@/lib/format';
import type { ScoredListing } from '@/lib/types';

type Strategy = 'negotiation' | 'mandate';
interface OutreachMessage {
  strategy: Strategy;
  subject: string;
  body: string;
}
interface OutreachSuccess {
  ok: true;
  strategy: Strategy;
  strategyReason: string;
  negotiation: { offerPrice: number; discount: number } | null;
  mandate: { ownerNet: number; commission: number; totalRevenue: number } | null;
  message: OutreachMessage;
  alternatives: OutreachMessage[];
}
type OutreachResponse = OutreachSuccess | { ok: false; error: string; reason?: string };

const STRATEGY_LABEL: Record<Strategy, string> = { negotiation: 'Achat-revente', mandate: 'Dépôt-vente / Mandat' };

export function OutreachModal({ item, onClose }: { item: ScoredListing | null; onClose: () => void }) {
  return (
    <Modal open={item !== null} onClose={onClose} title="Message autonome" subtitle={item?.listing.title}>
      {item && <OutreachPanel key={item.listing.id} item={item} />}
    </Modal>
  );
}

function OutreachPanel({ item }: { item: ScoredListing }) {
  const [data, setData] = useState<OutreachResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Strategy | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing: item.listing, strategy: 'auto' }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json()) as OutreachResponse;
        if (!res.ok && json.ok !== false) throw new Error(`Erreur ${res.status}`);
        setData(json);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Erreur réseau');
      });
    return () => controller.abort();
  }, [item.listing]);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError('Copie impossible : sélectionnez le texte manuellement.');
    }
  }

  if (error) return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>;
  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-6 w-1/2 animate-pulse rounded bg-ink-100" />
        <div className="h-64 animate-pulse rounded-lg bg-ink-100" />
      </div>
    );
  }
  if (!data.ok) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        Non éligible : {data.reason ?? data.error}
      </p>
    );
  }

  const messages = [data.message, ...data.alternatives];
  const current = messages.find((m) => m.strategy === (selected ?? data.strategy)) ?? data.message;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="blue">Stratégie retenue : {STRATEGY_LABEL[data.strategy]}</Chip>
        {current.strategy === 'negotiation' && data.negotiation && (
          <>
            <Chip tone="green">
              Offre <span className="tabular">{eur(data.negotiation.offerPrice)}</span>
            </Chip>
            <Chip tone="amber">
              Remise <span className="tabular">−{eur(data.negotiation.discount)}</span>
            </Chip>
          </>
        )}
        {current.strategy === 'mandate' && data.mandate && (
          <>
            <Chip>
              Prix net vendeur <span className="tabular">{eur(data.mandate.ownerNet)}</span>
            </Chip>
            <Chip tone="green">
              Revenu <span className="tabular">{eur(data.mandate.totalRevenue)}</span>
            </Chip>
          </>
        )}
      </div>
      <p className="text-xs text-ink-500">{data.strategyReason}</p>

      {messages.length > 1 && (
        <div className="inline-flex rounded-lg border border-ink-200 p-0.5 text-xs" role="tablist">
          {messages.map((m) => (
            <button
              key={m.strategy}
              type="button"
              role="tab"
              aria-selected={m.strategy === current.strategy}
              onClick={() => setSelected(m.strategy)}
              className={cn(
                'rounded-md px-3 py-1 font-medium',
                m.strategy === current.strategy ? 'bg-ink-900 text-surface' : 'text-ink-600 hover:bg-ink-50',
              )}
            >
              {STRATEGY_LABEL[m.strategy]}
              {m.strategy === data.strategy && ' ★'}
            </button>
          ))}
        </div>
      )}

      <div>
        <span className="label">Objet</span>
        <p className="input bg-ink-50 font-medium">{current.subject}</p>
      </div>
      <div>
        <span className="label">Message prêt à envoyer</span>
        <pre className="input max-h-[45vh] overflow-y-auto whitespace-pre-wrap font-sans leading-relaxed">{current.body}</pre>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn-ghost text-xs" onClick={() => setShowJson((v) => !v)} aria-expanded={showJson}>
          {showJson ? 'Masquer' : 'Voir'} le payload JSON (Make.com)
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => copy(`${current.subject}\n\n${current.body}`, 'msg')}>
            {copied === 'msg' ? 'Copié ✓' : 'Copier objet + message'}
          </button>
          <button type="button" className="btn-primary" onClick={() => copy(current.body, 'body')}>
            {copied === 'body' ? 'Copié ✓' : 'Copier le message'}
          </button>
        </div>
      </div>

      {showJson && (
        <div className="relative">
          <pre className="max-h-72 overflow-auto rounded-lg border border-ink-200 bg-ink-50 p-3 font-mono text-[11px] leading-relaxed text-ink-700">
            {JSON.stringify(data, null, 2)}
          </pre>
          <button type="button" className="btn-secondary absolute right-2 top-2 px-2 py-1 text-xs" onClick={() => copy(JSON.stringify(data, null, 2), 'json')}>
            {copied === 'json' ? 'Copié ✓' : 'Copier JSON'}
          </button>
        </div>
      )}
    </div>
  );
}
