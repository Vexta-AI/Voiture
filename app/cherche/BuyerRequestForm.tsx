'use client';

import { useState } from 'react';

const EMPTY = { name: '', phone: '', email: '', models: '', budgetMax: '', yearMin: '', mileageMax: '', fuel: '', gearbox: '', notes: '', website: '' };

export function BuyerRequestForm({ brand, contact }: { brand: string; contact: string }) {
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  if (state === 'done') {
    return (
      <div className="card p-5 text-sm text-ink-700">
        <p className="font-semibold text-ink-900">Merci, c&apos;est noté ✅</p>
        <p className="mt-1">On vous recontacte dès qu&apos;un véhicule correspond à votre recherche.</p>
      </div>
    );
  }

  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('sending');
        setError(null);
        const res = await fetch('/api/public/buyer-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            phone: form.phone,
            email: form.email,
            notes: form.notes,
            website: form.website,
            consent,
            criteria: { models: form.models, budgetMax: form.budgetMax, yearMin: form.yearMin, mileageMax: form.mileageMax, fuel: form.fuel, gearbox: form.gearbox },
          }),
        });
        const json = await res.json().catch(() => ({ ok: false }));
        if (json.ok) setState('done');
        else {
          setState('idle');
          setError(json.error ?? 'Envoi impossible, réessayez.');
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Prénom *</span>
          <input className="input" required value={form.name} onChange={set('name')} />
        </label>
        <label className="block">
          <span className="label">Téléphone</span>
          <input className="input" inputMode="tel" value={form.phone} onChange={set('phone')} />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">E-mail</span>
          <input className="input" type="email" value={form.email} onChange={set('email')} />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Modèle(s) recherché(s)</span>
          <input className="input" placeholder="ex. Clio, 208, Polo" value={form.models} onChange={set('models')} />
        </label>
        <label className="block">
          <span className="label">Budget maximum (€) *</span>
          <input className="input" inputMode="numeric" required value={form.budgetMax} onChange={set('budgetMax')} />
        </label>
        <label className="block">
          <span className="label">Année minimum</span>
          <input className="input" inputMode="numeric" value={form.yearMin} onChange={set('yearMin')} />
        </label>
        <label className="block">
          <span className="label">Kilométrage maximum</span>
          <input className="input" inputMode="numeric" value={form.mileageMax} onChange={set('mileageMax')} />
        </label>
        <label className="block">
          <span className="label">Carburant</span>
          <select className="input" value={form.fuel} onChange={set('fuel')}>
            <option value="">Peu importe</option>
            <option value="essence">Essence</option>
            <option value="diesel">Diesel</option>
            <option value="hybride">Hybride</option>
            <option value="electrique">Électrique</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Boîte</span>
          <select className="input" value={form.gearbox} onChange={set('gearbox')}>
            <option value="">Peu importe</option>
            <option value="manuelle">Manuelle</option>
            <option value="auto">Automatique</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Précisions</span>
          <input className="input" placeholder="couleur, usage, délai…" value={form.notes} onChange={set('notes')} />
        </label>
        {/* Champ invisible anti-robot */}
        <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={set('website')} />
      </div>
      <label className="flex items-start gap-2 text-xs text-ink-600">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>
          J&apos;accepte que {brand} utilise ces informations pour me recontacter au sujet de ma recherche de véhicule. Elles ne sont ni vendues ni partagées, et je peux demander leur
          suppression à tout moment{contact ? ` (${contact})` : ' en répondant à un message reçu'}.
        </span>
      </label>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={state === 'sending' || !consent}>
        {state === 'sending' ? 'Envoi…' : 'Être prévenu quand je trouve ma voiture'}
      </button>
    </form>
  );
}
