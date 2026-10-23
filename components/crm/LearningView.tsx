'use client';

import { learnFromDeals } from '@/backend/utils/learning.js';
import type { Deal } from '@/lib/crm';
import { cn } from '@/lib/format';

/** « Ce que tes deals t'apprennent » : mesures réelles vs hypothèses du radar. */
export function LearningView({ deals }: { deals: Deal[] }) {
  const { measures, byOffer, suggestions, sold, minSample } = learnFromDeals(deals);
  const format = (v: number | null, unit: string) => (v === null ? '—' : unit === '€' ? `${Math.round(v).toLocaleString('fr-FR')} €` : unit === 'j' ? `${v} j` : `${v} %`);
  return (
    <div className="space-y-5">
      <div className="card p-4 text-sm text-ink-600">
        <p className="font-semibold text-ink-900">📈 Ce que tes deals t&apos;apprennent</p>
        <p className="mt-1">
          Le radar part d&apos;hypothèses sourcées. Chaque deal que tu mènes ici produit des chiffres réels (prix obtenus, revente, frais, délais, réponses des vendeurs) que
          personne d&apos;autre n&apos;a. Une mesure devient une proposition de réglage à partir de {minSample} deals. Rien n&apos;est changé sans ton accord.
        </p>
        <p className="mt-1 text-xs text-ink-400">{sold} véhicule(s) vendu(s) pris en compte. Pense à saisir le prix d&apos;achat, les frais réels et le prix de vente dans chaque fiche.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(measures).map(([key, m]) => {
          const reliable = m.value !== null && m.n >= minSample;
          return (
            <div key={key} className="card px-4 py-3">
              <p className="text-xs font-medium text-ink-500">{m.label}</p>
              <p className={cn('tabular mt-1 text-xl font-semibold', reliable ? 'text-ink-900' : 'text-ink-400')}>{format(m.value, m.unit)}</p>
              <p className="mt-0.5 text-xs text-ink-400">
                sur {m.n} deal(s){!reliable && m.n > 0 ? ` · fiable dès ${minSample}` : ''}
                {m.hypothesis !== null ? ` · hypothèse radar : ${format(m.hypothesis, m.unit)}` : ''}
              </p>
            </div>
          );
        })}
      </section>

      {Object.keys(byOffer).length > 0 && (
        <section className="card p-4">
          <p className="mb-2 text-sm font-semibold text-ink-900">Quelle remise fonctionne avec les vendeurs ?</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500">
              <tr>
                <th className="py-1">Remise demandée au 1er message</th>
                <th>Messages</th>
                <th>Réponses</th>
                <th>Visite / accord</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {Object.entries(byOffer).map(([bucket, b]) => (
                <tr key={bucket} className="border-t border-ink-100">
                  <td className="py-1.5">{bucket}</td>
                  <td>{b.sent}</td>
                  <td>{Math.round((b.replied / b.sent) * 100)} %</td>
                  <td>{Math.round((b.won / b.sent) * 100)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card p-4">
        <p className="mb-2 text-sm font-semibold text-ink-900">Propositions de réglage</p>
        {suggestions.length === 0 ? (
          <p className="text-sm text-ink-500">Pas encore assez de deals terminés. Les propositions apparaissent dès {minSample} ventes ou {minSample} messages par niveau d&apos;offre.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-ink-700">
            {suggestions.map((s) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
