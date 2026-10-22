'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pepite-radar:theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-ghost h-9 w-9 px-0 text-base"
      aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      title={dark ? 'Mode clair' : 'Mode sombre'}
    >
      {dark ? '☀' : '☾'}
    </button>
  );
}
