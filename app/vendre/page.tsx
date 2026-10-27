import type { Metadata } from 'next';

import { SellerRequestForm } from './SellerRequestForm';

export const metadata: Metadata = {
  title: 'Je vends ma voiture',
  description: 'Vendez votre voiture sans les curieux ni les rendez-vous manqués : on s’occupe de tout.',
};

export default function VendreVoiture() {
  const brand = process.env.PUBLIC_BRAND || 'Achat-revente de véhicules d’occasion';
  const contact = process.env.PUBLIC_CONTACT || '';
  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-10">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{brand}</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink-900">Vous vendez votre voiture ?</h1>
        <p className="mt-2 text-sm text-ink-600">
          Laissez-nous les infos de votre véhicule : on vous rappelle pour une estimation et une proposition (achat ou vente pour votre compte). Pas de curieux, pas de rendez-vous
          manqués, vous fixez le prix net que vous voulez toucher.
        </p>
      </header>
      <SellerRequestForm brand={brand} contact={contact} />
    </main>
  );
}
