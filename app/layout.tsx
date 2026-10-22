import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Pépite Radar — Veille & scoring achat-revente Auto/Moto',
  description:
    "Veille, scoring et aide à la décision pour l'achat-revente et le mandat de recherche Auto & Moto (3 000 € - 30 000 €), Bordeaux & région.",
};

export const viewport: Viewport = {
  themeColor: '#121621',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
