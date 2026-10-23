'use client';

import { useEffect, useState } from 'react';

import { PIPELINES } from '@/backend/config/crm.js';
import { buyerPitch, matchBuyers } from '@/backend/utils/matching.js';
import { Chip } from '@/components/ui/Chip';
import type { Deal, WaitingBuyer } from '@/lib/crm';
import { cn, eur } from '@/lib/format';

import { CopyButton } from './shared';

const EMPTY = { name: '', phone: '', models: '', budgetMax: '', yearMin: '', mileageMax: '', fuel: '', gearbox: '', notes: '' };

/** Voiture du CRM vue comme une annonce, pour le matching (prix de revente = prix affiché, local ou marché). */
function dealAsListing(deal: Deal) {
  const n = deal.numbers;
  return {
    id: deal.vehicle.listingId,
    type: deal.vehicle.type,
    title: deal.vehicle.title,
    brand: '',
    model: '',
    year: deal.vehicle.year,
    mileage: deal.vehicle.mileage,
    price: Number(n.askingPrice ?? 0),
    marketPrice: Number(n.listedPrice ?? n.localPrice ?? n.marketPrice ?? n.salePrice ?? 0),
    publishedAt: deal.createdAt,
  };
}

/** Réseau d'acheteurs : qui cherche quoi, et quelles voitures du CRM leur correspondent. */
export function BuyersView({ deals, onAddBuyerDeal }: { deals: Deal[]; onAddBuyerDeal: (vehicleId: string, contact: { name?: string; phone?: string }) => Promise<Deal | null> }) {
  const [buyers, setBuyers] = useState<WaitingBuyer[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/buyers')
      .then((r) => r.json())
      .then((d) => d.ok && setBuyers(d.buyers))
      .catch(() => setError('Chargement impossible'));
  }, []);

  const vehicles = deals.filter((d) => d.kind !== 'revente' && PIPELINES[d.kind].stages.find((s) => s.id === d.stage)?.phase !== 'closed');

  const add = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch('/api/buyers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone,
        notes: form.notes,
        criteria: { models: form.models, budgetMax: form.budgetMax, yearMin: form.yearMin, mileageMax: form.mileageMax, fuel: form.fuel, gearbox: form.gearbox },
      }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    setSaving(false);
    if (!json.ok) return setError(json.error ?? 'Ajout impossible');
    setBuyers((b) => [json.buyer, ...b]);
    setForm(EMPTY);
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/buyers/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({ ok: false }));
    if (json.ok) setBuyers((b) => b.map((x) => (x.id === id ? json.buyer : x)));
  };

  const remove = async (id: string) => {
    if (!window.confirm('Supprimer cet acheteur ?')) return;
    await fetch(`/api/buyers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setBuyers((b) => b.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-5">
      <div className="card p-4 text-sm text-ink-600">
        <p className="font-semibold text-ink-900">👥 Ton réseau d&apos;acheteurs</p>
        <p className="mt-1">
          Note ici chaque personne qui te dit ce qu&apos;elle cherche : un acheteur qui n&apos;a pas pris ta voiture, un ami, un contact. Quand le radar ou le CRM trouve une voiture qui
          lui correspond, tu le vois sur la carte et dans l&apos;alerte Telegram, avec le message prêt à lui envoyer. Tu achètes une voiture déjà presque vendue.
        </p>
        <p className="mt-2">
          Ton formulaire public à partager (groupes Facebook, annonces, Instagram) : <a className="font-medium text-sky-700 underline dark:text-sky-400" href="/cherche" target="_blank" rel="noreferrer">/cherche</a>. Les
          personnes s&apos;inscrivent elles-mêmes, avec leur consentement.
        </p>
      </div>

      <section className="card space-y-2 p-4">
        <p className="text-sm font-semibold text-ink-900">Ajouter un acheteur</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Nom *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Modèles (ex. clio, 208, polo)" value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })} />
          <input className="input" inputMode="numeric" placeholder="Budget max € *" value={form.budgetMax} onChange={(e) => setForm({ ...form, budgetMax: e.target.value })} />
          <input className="input" inputMode="numeric" placeholder="Année min" value={form.yearMin} onChange={(e) => setForm({ ...form, yearMin: e.target.value })} />
          <input className="input" inputMode="numeric" placeholder="Km max" value={form.mileageMax} onChange={(e) => setForm({ ...form, mileageMax: e.target.value })} />
          <select className="input" value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })}>
            <option value="">Carburant : peu importe</option>
            <option value="essence">Essence</option>
            <option value="diesel">Diesel</option>
            <option value="hybride">Hybride</option>
            <option value="electrique">Électrique</option>
          </select>
          <select className="input" value={form.gearbox} onChange={(e) => setForm({ ...form, gearbox: e.target.value })}>
            <option value="">Boîte : peu importe</option>
            <option value="manuelle">Manuelle</option>
            <option value="auto">Automatique</option>
          </select>
          <input className="input" placeholder="Notes (usage, couleur, délai…)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        <button type="button" className="btn-primary text-xs" disabled={saving || !form.name || !form.budgetMax} onClick={add}>
          + Ajouter au réseau
        </button>
      </section>

      {buyers.length === 0 ? (
        <p className="text-sm text-ink-500">Aucun acheteur pour l&apos;instant.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {buyers.map((b) => {
            const matches = vehicles.filter((d) => matchBuyers(dealAsListing(d), [b]).length > 0);
            const c = b.criteria;
            return (
              <article key={b.id} className={cn('card space-y-2 p-4', !b.active && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">
                      {b.name} {b.phone && <span className="text-xs font-normal text-ink-500">· {b.phone}</span>}
                      {b.email && <span className="text-xs font-normal text-ink-500"> · {b.email}</span>}
                      {b.source === 'formulaire' && (
                        <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-500/10 dark:text-sky-300" title={b.consentAt ? `Consentement le ${new Date(b.consentAt).toLocaleDateString('fr-FR')}` : undefined}>
                          formulaire
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-600">
                      {c.models?.length ? c.models.join(', ') : 'tout modèle'} · budget {eur(c.budgetMax)}
                      {c.yearMin ? ` · ${c.yearMin}+` : ''}
                      {c.mileageMax ? ` · < ${c.mileageMax.toLocaleString('fr-FR')} km` : ''}
                      {c.fuel ? ` · ${c.fuel}` : ''}
                      {c.gearbox ? ` · ${c.gearbox}` : ''}
                    </p>
                    {b.notes && <p className="mt-0.5 text-xs text-ink-400">{b.notes}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="btn-ghost px-2 text-xs" onClick={() => patch(b.id, { active: !b.active })}>
                      {b.active ? 'Pause' : 'Réactiver'}
                    </button>
                    <button type="button" className="btn-ghost px-2 text-xs text-rose-600" onClick={() => remove(b.id)}>
                      ✕
                    </button>
                  </div>
                </div>
                {matches.length === 0 ? (
                  <p className="text-xs text-ink-400">Aucune voiture du CRM ne correspond pour l&apos;instant : tu seras prévenu dans les alertes Telegram.</p>
                ) : (
                  <ul className="space-y-2">
                    {matches.map((d) => (
                      <li key={d.id} className="rounded-lg bg-ink-50 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-ink-900">{d.vehicle.title}</span>
                          <Chip tone="green">{PIPELINES[d.kind].stages.find((s) => s.id === d.stage)?.label}</Chip>
                        </div>
                        <div className="mt-1.5 flex gap-2">
                          <CopyButton text={buyerPitch(dealAsListing(d), b)} label="Copier le message" />
                          <button type="button" className="btn-secondary text-xs" onClick={() => onAddBuyerDeal(d.id, { name: b.name, phone: b.phone })}>
                            Créer la fiche acheteur
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
