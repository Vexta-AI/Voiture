'use client';

import { useMemo, useState } from 'react';

import { generateMandateMessage, generateNegotiationMessage } from '@/backend/utils/messages.js';
import type { MessageKind } from '@/components/listing/ListingCard';
import { Chip } from '@/components/ui/Chip';
import { Modal } from '@/components/ui/Modal';
import { cn, eur } from '@/lib/format';
import type { ScoredListing } from '@/lib/types';

type Tone = 'courtois' | 'direct';

export function MessageModal({
  item,
  kind,
  aiEnabled,
  onClose,
}: {
  item: ScoredListing | null;
  kind: MessageKind;
  aiEnabled: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={kind === 'mandate' ? 'Proposition de Mandat / Dépôt-Vente' : 'Script de négociation'}
      subtitle={item?.listing.title}
    >
      {/* key : réinitialise l'état (texte édité, ton) à chaque nouvelle annonce */}
      {item && <MessageEditor key={`${item.listing.id}-${kind}`} item={item} kind={kind} aiEnabled={aiEnabled} />}
    </Modal>
  );
}

function MessageEditor({ item, kind, aiEnabled }: { item: ScoredListing; kind: MessageKind; aiEnabled: boolean }) {
  const { listing, analysis } = item;
  const [tone, setTone] = useState<Tone>('courtois');
  const [edited, setEdited] = useState<string | null>(null);
  const [source, setSource] = useState<'template' | 'claude'>('template');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const draft = useMemo(
    () => (kind === 'mandate' ? generateMandateMessage(listing, analysis) : generateNegotiationMessage(listing, analysis, { tone })),
    [kind, listing, analysis, tone],
  );
  const text = edited ?? draft.text;

  async function refine() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing, kind, tone, refine: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setEdited(data.text);
      setSource(data.source);
      if (data.warning) setNotice(data.warning);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice('Copie impossible : sélectionnez le texte manuellement.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {'offer' in draft ? (
          <>
            <Chip tone="slate">
              Affiché <span className="tabular">{eur(listing.price)}</span>
            </Chip>
            <Chip tone="green">
              Offre <span className="tabular">{eur(draft.offer)}</span>
            </Chip>
            <Chip tone="amber">
              Remise demandée <span className="tabular">−{eur(draft.discount)}</span>
            </Chip>
          </>
        ) : (
          <>
            <Chip tone="blue">En ligne depuis {analysis.daysOnline} j</Chip>
            {analysis.mandate && (
              <Chip tone="green">
                Revenu mandat <span className="tabular">{eur(analysis.mandate.totalRevenue)}</span>
              </Chip>
            )}
            <Chip>Trésorerie : 0 €</Chip>
          </>
        )}
        <Chip tone={source === 'claude' ? 'blue' : 'slate'} className="ml-auto">
          {source === 'claude' ? 'Affiné par IA' : 'Template moteur'}
        </Chip>
      </div>

      {kind === 'negotiation' && (
        <div className="inline-flex rounded-lg border border-ink-200 p-0.5 text-xs">
          {(['courtois', 'direct'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTone(t);
                setEdited(null);
                setSource('template');
              }}
              className={cn('rounded-md px-3 py-1 font-medium capitalize', tone === t ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50')}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <textarea
        className="input min-h-[300px] font-sans leading-relaxed"
        value={text}
        onChange={(e) => setEdited(e.target.value)}
        aria-label="Message au vendeur"
      />

      {notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={refine}
          disabled={!aiEnabled || loading}
          title={aiEnabled ? 'Réécriture naturelle par Claude, montants conservés' : 'Configurer ANTHROPIC_API_KEY pour activer'}
        >
          {loading ? 'Affinage…' : '✦ Affiner avec l’IA'}
        </button>
        <div className="flex gap-2">
          {edited !== null && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setEdited(null);
                setSource('template');
              }}
            >
              Réinitialiser
            </button>
          )}
          <button type="button" className="btn-primary" onClick={copy}>
            {copied ? 'Copié ✓' : 'Copier le message'}
          </button>
        </div>
      </div>
    </div>
  );
}
