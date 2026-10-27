'use client';

import { useState } from 'react';

const EMPTY = { name: '', phone: '', email: '', brand: '', model: '', year: '', mileage: '', price: '', city: '', notes: '', website: '' };

export function SellerRequestForm({ brand, contact }: { brand: string; contact: string }) {
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  if (state === 'done') {
    return (
      <div className="card p-5 text-sm text-ink-700">
        <p className="font-semibold text-ink-900">Merci, c&apos;est noté ✅</p>
        <p className="mt-1">On vous rappelle rapidement pour parler de votre véhicule.</p>
      </div>
    );
  }

  const field = (key: keyof typeof EMPTY, label: string, extra: Record<string, unknown> = {}) => (
    <label className={`block ${extra.wide ? 'sm:col-span-2' : ''}`}>
      <span className="label">{label}</span>
      <input className="input" value={form[key]} onChange={set(key)} required={Boolean(extra.required)} inputMode={extra.numeric ? 'numeric' : undefined} placeholder={extra.placeholder as string | undefined} />
    </label>
  );

  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('sending');
        setError(null);
        const res = await fetch('/api/public/seller-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, consent }),
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
        {field('name', 'Prénom *', { required: true })}
        {field('phone', 'Téléphone')}
        {field('email', 'E-mail', { wide: true })}
        {field('brand', 'Marque *', { required: true, placeholder: 'ex. Renault' })}
        {field('model', 'Modèle *', { required: true, placeholder: 'ex. Clio 4 1.5 dCi 90' })}
        {field('year', 'Année *', { required: true, numeric: true })}
        {field('mileage', 'Kilométrage *', { required: true, numeric: true })}
        {field('price', 'Prix net souhaité (€) *', { required: true, numeric: true })}
        {field('city', 'Ville')}
        {field('notes', 'Précisions', { wide: true, placeholder: 'entretien, défauts, options, délai…' })}
        {/* Champ invisible anti-robot */}
        <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={set('website')} />
      </div>
      <label className="flex items-start gap-2 text-xs text-ink-600">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>
          J&apos;accepte que {brand} utilise ces informations pour me recontacter au sujet de la vente de mon véhicule. Elles ne sont ni vendues ni partagées, et je peux demander leur
          suppression à tout moment{contact ? ` (${contact})` : ' en répondant à un message reçu'}.
        </span>
      </label>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={state === 'sending' || !consent}>
        {state === 'sending' ? 'Envoi…' : 'Être rappelé pour vendre ma voiture'}
      </button>
    </form>
  );
}
