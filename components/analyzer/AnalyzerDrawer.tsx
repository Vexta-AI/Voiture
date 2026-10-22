'use client';

import { useMemo, useState } from 'react';

import { scoreListing } from '@/backend/utils/scoring.js';
import { Chip } from '@/components/ui/Chip';
import { Modal } from '@/components/ui/Modal';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn, eur, signedEur } from '@/lib/format';
import type { Listing, VehicleType } from '@/lib/types';
import { validateListing } from '@/lib/validate';

const EMPTY = {
  type: 'auto' as VehicleType,
  brand: '',
  model: '',
  version: '',
  engine: '',
  gearbox: '',
  year: '',
  mileage: '',
  doors: '5',
  price: '',
  marketPrice: '',
  daysOnline: '0',
  vin: '',
  licenseCategory: '',
  location: '',
  description: '',
};

type FormState = typeof EMPTY;

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function AnalyzerDrawer({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (listing: Listing) => void }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const parsed = useMemo(
    () =>
      validateListing({
        ...form,
        title: [form.brand, form.model, form.version, form.engine].filter(Boolean).join(' '),
        doors: form.type === 'auto' ? form.doors : undefined,
        licenseCategory: form.type === 'moto' ? form.licenseCategory : undefined,
        source: 'Saisie manuelle',
      }),
    [form],
  );
  const analysis = useMemo(() => (parsed.ok ? scoreListing(parsed.listing) : null), [parsed]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.ok) return;
    onAdd({ ...parsed.listing, id: `user-${Date.now().toString(36)}` });
    setForm(EMPTY);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} side title="Analyser une annonce" subtitle="Collez les infos de l’annonce : le scoring se met à jour en direct.">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Type">
            <select className="input" value={form.type} onChange={set('type')}>
              <option value="auto">Auto</option>
              <option value="moto">Moto</option>
            </select>
          </Field>
          <Field label="Marque *">
            <input className="input" value={form.brand} onChange={set('brand')} placeholder="Renault" required />
          </Field>
          <Field label="Modèle *">
            <input className="input" value={form.model} onChange={set('model')} placeholder="Clio 4" required />
          </Field>
          <Field label="Version / finition">
            <input className="input" value={form.version} onChange={set('version')} placeholder="Intens" />
          </Field>
          <Field label="Moteur">
            <input className="input" value={form.engine} onChange={set('engine')} placeholder="1.5 dCi 90" />
          </Field>
          <Field label="Boîte">
            <input className="input" value={form.gearbox} onChange={set('gearbox')} placeholder="Manuelle / DSG7 / EDC" />
          </Field>
          <Field label="Année *">
            <input className="input" inputMode="numeric" value={form.year} onChange={set('year')} placeholder="2017" required />
          </Field>
          <Field label="Kilométrage">
            <input className="input" inputMode="numeric" value={form.mileage} onChange={set('mileage')} placeholder="98000" />
          </Field>
          {form.type === 'auto' ? (
            <Field label="Portes">
              <select className="input" value={form.doors} onChange={set('doors')}>
                <option value="5">5 portes</option>
                <option value="3">3 portes</option>
                <option value="4">4 portes</option>
              </select>
            </Field>
          ) : (
            <Field label="Carte grise">
              <select className="input" value={form.licenseCategory} onChange={set('licenseCategory')}>
                <option value="">Non précisé</option>
                <option value="MTT1">MTT1 (A2)</option>
                <option value="MTT2">MTT2 (Full)</option>
              </select>
            </Field>
          )}
          <Field label="Prix affiché (€) *">
            <input className="input" inputMode="numeric" value={form.price} onChange={set('price')} placeholder="6990" required />
          </Field>
          <Field label="Cote marché pro (€) *">
            <input className="input" inputMode="numeric" value={form.marketPrice} onChange={set('marketPrice')} placeholder="8900" required />
          </Field>
          <Field label="Jours en ligne">
            <input className="input" inputMode="numeric" value={form.daysOnline} onChange={set('daysOnline')} />
          </Field>
          {form.type === 'auto' && (
            <Field label="VIN (Tesla : LRW = Shanghai)" className="col-span-2">
              <input className="input font-mono uppercase" value={form.vin} onChange={set('vin')} placeholder="LRW3E7EK1NC512345" />
            </Field>
          )}
          <Field label="Localisation">
            <input className="input" value={form.location} onChange={set('location')} placeholder="Mérignac (33)" />
          </Field>
        </div>

        <Field label="Texte de l’annonce (détection défauts, options, mots-clés rédhibitoires)">
          <textarea
            className="input min-h-[120px]"
            value={form.description}
            onChange={set('description')}
            placeholder="Collez ici la description complète du vendeur…"
          />
        </Field>

        <section className="card p-4" aria-live="polite">
          {!parsed.ok || !analysis ? (
            <p className="text-sm text-ink-500">Renseignez marque, modèle, année, prix affiché et cote pro pour lancer l’analyse.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <ScoreGauge score={analysis.score} />
                <div>
                  <StatusBadge status={analysis.status.key} label={analysis.status.label} />
                  <p className="mt-1 text-sm text-ink-600">
                    Marge nette <strong className="tabular text-ink-900">{signedEur(analysis.finance.netMargin)}</strong> · négociée{' '}
                    <strong className="tabular text-ink-900">{signedEur(analysis.finance.negotiatedNetMargin)}</strong> · achat max PÉPITE{' '}
                    <strong className="tabular text-ink-900">{eur(analysis.finance.maxBuyPriceForPepite)}</strong>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.blacklist.map((b) => (
                  <Chip key={b.id} tone="red" title={b.reason}>
                    ⛔ {b.label}
                  </Chip>
                ))}
                {analysis.triggers.map((t) => (
                  <Chip key={t.id} tone="green">
                    ★ {t.label} +{t.bonus} €
                  </Chip>
                ))}
                {analysis.levers.map((l) => (
                  <Chip key={l.id} tone="amber">
                    ↓ {l.label} −{l.discount} €
                  </Chip>
                ))}
              </div>
              {analysis.warnings.map((w) => (
                <p key={w} className="text-xs text-amber-800">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setForm(EMPTY)}>
            Effacer
          </button>
          <button type="submit" className="btn-primary" disabled={!parsed.ok}>
            Ajouter au radar
          </button>
        </div>
      </form>
    </Modal>
  );
}
