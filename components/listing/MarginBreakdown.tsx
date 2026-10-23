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

/** Détail de la formule : Marge Brute - 500 € - 200 € = Marge Nette, puis frais réels = Marge réelle, + scénario négocié. */
export function MarginBreakdown({ analysis }: { analysis: Analysis }) {
  const f = analysis.finance;
  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Au prix affiché</p>
        <Row label="Prix marché" value={eur(f.marketPrice)} hint="médiane des annonces comparables" />
        <Row label="Prix affiché" value={`− ${eur(f.askingPrice)}`} muted />
        <Row label="Marge brute" value={signedEur(f.grossMargin)} strong />
        <Row label="Remise en état" value={`− ${eur(f.reconditioning)}`} muted hint="detailing + petite méca" />
        <Row label="Capital risque" value={`− ${eur(f.riskCapital)}`} muted hint="imprévu / négo acheteur" />
        <div className="mt-1 border-t border-ink-100 pt-1">
          <Row label="Marge nette estimée" value={signedEur(f.netMargin)} strong />
        </div>
        {f.transportCost > 0 && <Row label="Rapatriement" value={`− ${eur(f.transportCost)}`} muted hint={`${analysis.distanceKm} km : billet + route`} />}
        {f.registrationCost > 0 && (
          <Row
            label="Carte grise"
            value={`− ${eur(f.registrationCost)}`}
            muted
            hint={`${f.registration.cv} CV${f.registration.estimatedCv ? ' estimés' : ''}${f.registration.halved ? ', −50 % +10 ans' : ''}`}
          />
        )}
        <Row label="Assurance temporaire" value={`− ${eur(f.ownership.insurance)}`} muted hint={`${f.ownership.holdingDays} j à ~6 €/j, le temps de revendre`} />
        <Row label="Annonce LeBonCoin" value={`− ${eur(f.ownership.adFee)}`} muted hint="79,90 € dès la 3e annonce véhicule de l'année" />
        {f.ownership.visit > 0 && <Row label="Déplacement" value={`− ${eur(f.ownership.visit)}`} muted hint={`aller-retour ${analysis.distanceKm} km`} />}
        <div className="mt-1 border-t border-ink-100 pt-1">
          <Row label="Marge réelle (dans ta poche)" value={signedEur(f.realNetMargin)} strong />
        </div>
        <Row
          label="Marge prudente"
          value={signedEur(analysis.prudent.margin)}
          strong
          hint={`si ton acheteur négocie ~5 % (−${eur(analysis.prudent.buyerDiscount)})${analysis.local ? ', revente chez toi' : ''}`}
        />
        {f.triggersBonus > 0 && (
          <Row label="Potentiel options (hors statut)" value={signedEur(f.triggersBonus)} muted hint="argument de revente" />
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Scénario négocié</p>
        <Row label="Leviers de négo" value={f.leversTotal ? `− ${eur(f.leversTotal)}` : '—'} muted />
        <Row label="Prix d'achat cible" value={eur(f.targetPrice)} />
        <Row label="Coût réel des défauts" value={f.leversRealCost ? `− ${eur(f.leversRealCost)}` : '—'} muted />
        <Row label="Carte grise, assurance, annonce, trajet" value={`− ${eur(f.transportCost + f.registrationCost + f.ownership.total)}`} muted />
        <div className="mt-1 border-t border-ink-100 pt-1">
          <Row label="Marge nette négociée" value={signedEur(f.negotiatedNetMargin)} strong />
        </div>
        <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
          Prix d&apos;achat max pour statut PÉPITE ({analysis.segmentLabel.toLowerCase()} &gt; {eur(analysis.threshold)}) :{' '}
          <strong className="tabular text-ink-900">{eur(f.maxBuyPriceForPepite)}</strong>
          <br />
          Prix plafond (marge réelle à 0, ne jamais dépasser) : <strong className="tabular text-ink-900">{eur(f.walkAwayPrice)}</strong>
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
