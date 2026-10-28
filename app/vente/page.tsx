import type { Metadata } from 'next';

import { SaleBuilder } from './SaleBuilder';

export const metadata: Metadata = { title: 'Vendre une voiture · Pépite Radar' };

export default function VentePage() {
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Vendre une voiture</h1>
        <p className="mt-1 text-sm text-ink-600">
          Ta voiture ou ton stock : prix d&apos;affichage et plancher tirés des annonces comparables du radar (médiane des prix affichés, pas l&apos;Argus), annonce honnête, réponses
          types et papiers.
        </p>
      </header>
      <SaleBuilder />
    </main>
  );
}
