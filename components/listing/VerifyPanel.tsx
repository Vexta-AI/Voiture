'use client';

import { priceCheckLinks } from '@/backend/utils/links.js';
import { generateQualificationMessage } from '@/backend/utils/messages.js';
import { CopyButton } from '@/components/crm/shared';
import type { Analysis, Listing } from '@/lib/types';

/** Cote peu fiable : liens pour vérifier le prix soi-même et premier message de questions, prêt à copier. */
export function VerifyPanel({ listing, analysis }: { listing: Listing; analysis: Analysis }) {
  const links = priceCheckLinks(listing);
  const message = generateQualificationMessage(listing, analysis);
  return (
    <div className="space-y-2 rounded-lg bg-rose-50 px-3 py-2 text-xs dark:bg-rose-500/10">
      <p className="font-semibold text-ink-900">🔎 Cote peu fiable : vérifie le prix avant toute offre</p>
      <p className="flex flex-wrap gap-x-3 gap-y-1">
        <a className="font-medium text-sky-700 underline dark:text-sky-400" href={links.argus} target="_blank" rel="noreferrer">
          Cote L&apos;argus ↗
        </a>
        <a className="font-medium text-sky-700 underline dark:text-sky-400" href={links.leboncoin} target="_blank" rel="noreferrer">
          Annonces comparables (année ±1, km ±30 %) ↗
        </a>
      </p>
      <details>
        <summary className="cursor-pointer font-medium text-ink-700">Premier message : questions au vendeur</summary>
        <pre className="mt-1.5 whitespace-pre-wrap rounded-md bg-surface p-2 font-sans text-[13px] leading-relaxed text-ink-700">{message.text}</pre>
        <div className="mt-1.5">
          <CopyButton text={message.text} label="Copier le message" />
        </div>
      </details>
    </div>
  );
}
