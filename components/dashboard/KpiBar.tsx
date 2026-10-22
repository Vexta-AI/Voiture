import { eur } from '@/lib/format';
import type { ScoredListing, TabKey } from '@/lib/types';

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={`tabular mt-1 text-xl font-semibold ${accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-400">{sub}</p>}
    </div>
  );
}

export function KpiBar({ tab, items }: { tab: TabKey; items: ScoredListing[] }) {
  if (tab === 'mandat') {
    const revenue = items.reduce((sum, s) => sum + (s.analysis.mandate?.totalRevenue ?? 0), 0);
    const upsells = items.reduce((sum, s) => sum + (s.analysis.mandate?.upsellMargin ?? 0), 0);
    const avgDays = items.length ? Math.round(items.reduce((sum, s) => sum + s.analysis.daysOnline, 0) / items.length) : 0;
    return (
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Vendeurs fatigués (J+15)" value={String(items.length)} sub={`${avgDays} jours en ligne en moyenne`} />
        <Kpi label="Revenu mandats potentiel" value={eur(revenue)} sub="plus-values + upsells" accent />
        <Kpi label="Dont upsells" value={eur(upsells)} sub="detailing +70 € · entretien +100 €" />
        <Kpi label="Trésorerie mobilisée" value={eur(0)} sub="sans-stock, zéro avance" />
      </section>
    );
  }

  const pepites = items.filter((s) => s.analysis.status.key === 'PEPITE');
  const watch = items.filter((s) => s.analysis.status.key === 'SURVEILLER');
  const refused = items.filter((s) => s.analysis.blacklist.length > 0);
  const potential = pepites.reduce((sum, s) => sum + s.analysis.finance.realNetMargin, 0);
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Annonces scannées" value={String(items.length)} sub={`${watch.length} à surveiller`} />
      <Kpi label="🔥 Pépites potentielles" value={String(pepites.length)} sub="au-dessus du seuil de marge" accent />
      <Kpi label="Marge réelle cumulée (pépites)" value={eur(potential)} sub="carte grise déduite, avant négo" accent />
      <Kpi label="Blacklist évitée" value={String(refused.length)} sub="moteurs poison & mots-clés" />
    </section>
  );
}
