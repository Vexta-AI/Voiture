'use client';

import { useState } from 'react';

type Proof = 'facture' | 'etiquette' | 'aucune';
type Item = { label: string; km: string; date: string; proof: Proof };
type Result = {
  ok: boolean;
  error?: string;
  title: string;
  text: string;
  pricing: { market: number; listed: number; floor: number; comparables: number; range: [number, number] } | null;
  replies: { q: string; a: string }[];
  checklist: string[];
  warnings: string[];
  marketCriteria: string[] | null;
};

const eur = (n: number) => `${n.toLocaleString('fr-FR')} €`;

export function SaleBuilder() {
  const [f, setF] = useState({
    brand: 'Renault',
    model: 'Clio 4',
    version: '1.5 dCi 90 eco²',
    year: '2014',
    firstRegistration: '2014-01-16',
    mileage: '98950',
    fuel: 'Diesel',
    gearbox: 'Manuelle',
    fiscalHp: '4',
    co2: '90',
    color: '',
    options: '',
    invoicesSince: 'l’achat (suivi en centre auto)',
    repaint: true,
    repaintReason: 'des rayures (vandalisme)',
    repaintInvoice: true,
    remainingDefects: '',
    ctDate: '',
    location: 'Saint-Médard-en-Jalles (33)',
    reason: '',
    coOwners: '2',
    firm: true,
  });
  const [items, setItems] = useState<Item[]>([
    { label: 'Distribution faite', km: '92000', date: '2024', proof: 'etiquette' },
    { label: 'Révision complète (vidange, filtres)', km: '98950', date: '', proof: 'facture' },
  ]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const input = (k: keyof typeof f, label: string, wide = false) => (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="label">{label}</span>
      <input className="input" value={String(f[k])} onChange={set(k)} />
    </label>
  );

  async function run() {
    setBusy(true);
    const body = {
      ...f,
      year: Number(f.year),
      mileage: Number(f.mileage),
      fiscalHp: Number(f.fiscalHp) || undefined,
      co2: Number(f.co2) || undefined,
      coOwners: Number(f.coOwners) || 1,
      options: f.options.split(',').map((s) => s.trim()).filter(Boolean),
      ctDate: f.ctDate || null,
      maintenance: items.filter((i) => i.label.trim()).map((i) => ({ label: i.label, km: Number(i.km) || null, date: i.date || null, proof: i.proof })),
      bodywork: { repaint: f.repaint, reason: f.repaintReason, invoice: f.repaintInvoice, remainingDefects: f.remainingDefects },
    };
    const res = await fetch('/api/sale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setResult(await res.json().catch(() => ({ ok: false, error: 'Réponse illisible' })));
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <section className="card space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {input('brand', 'Marque')}
          {input('model', 'Modèle')}
          {input('version', 'Moteur / version', true)}
          {input('year', 'Année')}
          {input('firstRegistration', '1re mise en circulation (AAAA-MM-JJ)')}
          {input('mileage', 'Kilométrage')}
          {input('fuel', 'Carburant')}
          {input('gearbox', 'Boîte')}
          {input('fiscalHp', 'CV fiscaux')}
          {input('co2', 'CO₂ g/km (carte grise V.7)')}
          {input('color', 'Couleur')}
          {input('options', 'Équipements (séparés par des virgules)', true)}
          {input('invoicesSince', 'Factures depuis', true)}
          {input('ctDate', 'Date du dernier contrôle technique (AAAA-MM-JJ)')}
          {input('coOwners', 'Titulaires sur la carte grise')}
          {input('location', 'Lieu', true)}
          {input('reason', 'Raison de la vente', true)}
          {input('remainingDefects', 'Défauts restants (sinon vide)', true)}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.firm} onChange={(e) => setF({ ...f, firm: e.target.checked })} /> Prix ferme (pas de négociation)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.repaint} onChange={(e) => setF({ ...f, repaint: e.target.checked })} /> Carrosserie repeinte
        </label>
        {f.repaint && (
          <div className="grid gap-3 sm:grid-cols-2">
            {input('repaintReason', 'Suite à')}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.repaintInvoice} onChange={(e) => setF({ ...f, repaintInvoice: e.target.checked })} /> Facture du carrossier
            </label>
          </div>
        )}
        <div className="space-y-2">
          <p className="label">Entretien</p>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input className="input col-span-5" value={it.label} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input className="input col-span-2" placeholder="km" value={it.km} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, km: e.target.value } : x)))} />
              <input className="input col-span-2" placeholder="date" value={it.date} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
              <select className="input col-span-3" value={it.proof} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, proof: e.target.value as Proof } : x)))}>
                <option value="facture">Facture</option>
                <option value="etiquette">Étiquette seulement</option>
                <option value="aucune">Sans preuve</option>
              </select>
            </div>
          ))}
          <button type="button" className="btn-secondary text-xs" onClick={() => setItems([...items, { label: '', km: '', date: '', proof: 'facture' }])}>
            + Ajouter une ligne
          </button>
        </div>
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={run}>
          {busy ? 'Calcul…' : 'Préparer la vente'}
        </button>
      </section>

      {result && !result.ok && <p className="text-sm text-rose-600">{result.error}</p>}
      {result?.ok && (
        <section className="space-y-4">
          <div className="card p-5">
            <p className="label">Prix (estimés)</p>
            {result.pricing ? (
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                <p>
                  Afficher : <b>{eur(result.pricing.listed)}</b>
                </p>
                <p>
                  Cote marché : <b>{eur(result.pricing.market)}</b> (médiane de {result.pricing.comparables} annonces)
                </p>
                {!f.firm && (
                  <p>
                    Plancher : <b>{eur(result.pricing.floor)}</b>
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-ink-600">Pas assez d&apos;annonces comparables dans le radar : relève 5 à 6 annonces de particuliers similaires.</p>
            )}
            {result.marketCriteria && <p className="mt-2 text-xs text-ink-500">Comparables : {result.marketCriteria.join(' · ')}</p>}
          </div>
          {result.warnings.length > 0 && (
            <div className="card space-y-1 p-5 text-sm">
              {result.warnings.map((w) => (
                <p key={w}>⚠️ {w}</p>
              ))}
            </div>
          )}
          <div className="card p-5">
            <p className="label">Annonce</p>
            <p className="mt-2 font-medium">{result.title}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-700">{result.text}</pre>
            <button type="button" className="btn-secondary mt-3 text-xs" onClick={() => navigator.clipboard?.writeText(`${result.title}\n\n${result.text}`)}>
              Copier
            </button>
          </div>
          <div className="card space-y-3 p-5 text-sm">
            <p className="label">Réponses types</p>
            {result.replies.map((r) => (
              <div key={r.q}>
                <p className="font-medium">{r.q}</p>
                <p className="text-ink-700">{r.a}</p>
              </div>
            ))}
          </div>
          <div className="card p-5 text-sm">
            <p className="label">Papiers et étapes</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {result.checklist.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
