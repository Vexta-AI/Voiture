const eurFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const numFormatter = new Intl.NumberFormat('fr-FR');

export const eur = (value: number) => eurFormatter.format(Math.round(value));
export const signedEur = (value: number) => `${value > 0 ? '+' : ''}${eur(value)}`;
export const km = (value: number) => `${numFormatter.format(value)} km`;
export const pct = (value: number) => `${Math.round(value * 100)} %`;

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}
