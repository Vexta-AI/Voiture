import { MANDATE } from '@/backend/config/rules.js';
import { eur } from '@/lib/format';

/** Rappel du cadre contractuel et des marges annexes du dépôt-vente. */
export function MandateRules() {
  return (
    <section className="card grid gap-4 p-4 text-sm md:grid-cols-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Argumentaire</p>
        <ul className="mt-2 space-y-1 text-ink-700">
          {MANDATE.arguments.map((a) => (
            <li key={a}>✓ {a}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Upsells (marges annexes)</p>
        <ul className="mt-2 space-y-1 text-ink-700">
          {MANDATE.upsells.map((u) => (
            <li key={u.id} className="flex justify-between gap-2">
              <span>
                {u.label} facturé {eur(u.price)} <span className="text-ink-400">(coût {eur(u.cost)})</span>
              </span>
              <span className="tabular font-semibold text-emerald-600">+{eur(u.price - u.cost)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Sécurité</p>
        <ul className="mt-2 space-y-1 text-ink-700">
          <li>Exclusivité {MANDATE.exclusivityDays} jours signée</li>
          <li>Clause de dédit {eur(MANDATE.withdrawalPenalty)} si retrait anticipé</li>
          <li>
            Commission {Math.round(MANDATE.commission.rate * 100)} % (min. {eur(MANDATE.commission.min)}) —{' '}
            <span className="text-ink-400">paramètre ajustable</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
