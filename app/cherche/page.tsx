import type { Metadata } from 'next';

import { BuyerRequestForm } from './BuyerRequestForm';

export const metadata: Metadata = {
  title: 'Je cherche une voiture d’occasion',
  description: 'Dites-nous ce que vous cherchez : nous vous prévenons dès qu’un véhicule correspond.',
};

export default function ChercheVoiture() {
  const brand = process.env.PUBLIC_BRAND || 'Achat-revente de véhicules d’occasion';
  const contact = process.env.PUBLIC_CONTACT || '';
  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-10">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{brand}</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink-900">Vous cherchez une voiture d&apos;occasion ?</h1>
        <p className="mt-2 text-sm text-ink-600">
          Dites-nous le modèle, votre budget et vos critères. Dès qu&apos;un véhicule correspond, préparé et vérifié (contrôle technique de moins de 6 mois, carte grise, non-gage,
          entretien), on vous contacte avant de le mettre en vente.
        </p>
      </header>
      <BuyerRequestForm brand={brand} contact={contact} />
    </main>
  );
}
