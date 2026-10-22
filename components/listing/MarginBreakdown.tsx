import { cn, eur, signedEur } from '@/lib/format';
import type { Analysis } from '@/lib/types';

function Row({ label, value, strong, muted, hint }: { label: string; value: string; strong?: boolean; muted?: boolean; hint?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1 text-sm', muted && 'text-ink-500', strong && 'font-semibold text-ink-900')}>
      <span>
        {label}
        {hint && <span className="ml-1 text-xs text-ink-400">({hint})</span>}
      </span>
      <span className="tabular">{value}</span>
    </div>
  );
}

/** Détail de la formule : Marge Brute - 350 € - 200 € = Marge Nette, + scénario négocié. */
export function MarginBreakdown({ analysis }: { analysis: Analysis }) {
  const f = analysis.finance;
  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Au prix affiché</p>
        <Row label="Cote marché pro" value={eur(f.marketPrice)} />
        <Row label="Prix affiché" value={`− ${eur(f.askingPrice)}`} muted />
        <Row label="Marge brute" value={signedEur(f.grossMargin)} strong />
        <Row label="Remise en état" value={`− ${eur(f.reconditioning)}`} muted hint="detailing + petite méca" />
        <Row label="Capital risque" value={`− ${eur(f.riskCapital)}`} muted hint="imprévu / négo acheteur" />
        <div className="mt-1 border-t border-ink-100 pt-1">
          <Row label="Marge nette estimée" value={signedEur(f.netMargin)} strong />
        </div>
        {f.transportCost > 0 && (
          <>
            <Row label="Rapatriement" value={`− ${eur(f.transportCost)}`} muted hint={`${analysis.distanceKm} km : billet + route`} />
            <Row label="Marge nette après rapatriement" value={signedEur(f.netMarginAfterTransport)} strong />
          </>
        )}
        {f.triggersBonus > 0 && (
          <Row label="Potentiel options (hors statut)" value={signedEur(f.triggersBonus)} muted hint="argument de revente" />
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Scénario négocié</p>
        <Row label="Leviers de négo" value={f.leversTotal ? `− ${eur(f.leversTotal)}` : '—'} muted />
        <Row label="Prix d'achat cible" value={eur(f.targetPrice)} />
        <Row label="Coût réel des défauts" value={f.leversRealCost ? `− ${eur(f.leversRealCost)}` : '—'} muted />
        {f.transportCost > 0 && <Row label="Rapatriement" value={`− ${eur(f.transportCost)}`} muted />}
        <div className="mt-1 border-t border-ink-100 pt-1">
          <Row label="Marge nette négociée" value={signedEur(f.negotiatedNetMargin)} strong />
        </div>
        <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
          Prix d&apos;achat max pour statut PÉPITE ({analysis.segmentLabel.toLowerCase()} &gt; {eur(analysis.threshold)}) :{' '}
          <strong className="tabular text-ink-900">{eur(f.maxBuyPriceForPepite)}</strong>
          {analysis.puretechCondition && (
            <>
              <br />
              Plafond PureTech (-30 % cote) : <strong className="tabular text-ink-900">{eur(analysis.puretechCondition.maxBuyPrice)}</strong>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
