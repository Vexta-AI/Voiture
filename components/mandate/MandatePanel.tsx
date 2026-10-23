import { eur, signedEur } from '@/lib/format';
import type { Analysis } from '@/lib/types';

/** Économie du mandat de dépôt-vente : commission + upsells, zéro trésorerie. */
export function MandatePanel({ analysis }: { analysis: Analysis }) {
  const m = analysis.mandate;
  if (!m) return null;
  return (
    <div className="grid gap-4">
      <div className="space-y-1 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Côté pro</p>
        <div className="flex justify-between">
          <span>Prix de vente visé</span>
          <span className="tabular font-medium">{eur(m.salePrice)}</span>
        </div>
        <div className="flex justify-between">
          <span>
            Commission <span className="text-xs text-ink-400">(plus-value au-dessus du prix net)</span>
          </span>
          <span className="tabular">{eur(m.commission)}</span>
        </div>
        {m.upsells.map((u) => (
          <div key={u.id} className="flex justify-between text-ink-600">
            <span>
              Upsell {u.label} <span className="text-xs text-ink-400">({eur(u.price)} facturé, {eur(u.cost)} réel)</span>
            </span>
            <span className="tabular">{signedEur(u.margin)}</span>
          </div>
        ))}
        {m.socialCharges > 0 && (
          <div className="flex justify-between text-ink-600">
            <span>
              Cotisations micro <span className="text-xs text-ink-400">(21,2 % de ce que tu factures)</span>
            </span>
            <span className="tabular">− {eur(m.socialCharges)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-ink-100 pt-1 font-semibold">
          <span>Revenu net du mandat</span>
          <span className="tabular text-emerald-700 dark:text-emerald-300">{eur(m.totalRevenue)}</span>
        </div>
        <div className="flex justify-between text-ink-500">
          <span>Trésorerie mobilisée</span>
          <span className="tabular">{eur(m.cashRequired)}</span>
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Côté propriétaire</p>
        <div className="flex justify-between">
          <span>Prix net garanti</span>
          <span className="tabular font-medium">{eur(m.ownerNet)}</span>
        </div>
        <div className="flex justify-between text-ink-600">
          <span>vs son annonce</span>
          <span className="tabular">{signedEur(m.ownerGainVsAd)}</span>
        </div>
        <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-600">
          Exclusivité <strong>{m.exclusivityDays} jours</strong> signée · clause de dédit <strong>{eur(m.withdrawalPenalty)}</strong> en cas de
          retrait anticipé (couvre shooting + mise en ligne).
          {m.ownerGainVsAd < 0 && (
            <>
              <br />
              Prix net sous son annonce (plus-value min. {eur(m.minSpread)}) : argumenter sur la vitesse, zéro curieux et la garantie.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
