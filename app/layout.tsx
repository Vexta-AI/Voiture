import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Pépite Radar — Veille & scoring achat-revente Auto/Moto',
  description:
    "Veille, scoring et aide à la décision pour l'achat-revente et le mandat de recherche Auto & Moto (3 000 € - 30 000 €), Bordeaux & région.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0d13' },
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
  ],
};

/** Applique le thème avant le premier rendu (sombre par défaut) pour éviter tout flash. */
const THEME_SCRIPT = `try{var t=localStorage.getItem('pepite-radar:theme');if(t!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
