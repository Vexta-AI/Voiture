/**
 * Outils d'analyse textuelle des annonces.
 * Toutes les comparaisons se font sur du texte normalisé : minuscules,
 * sans accents, apostrophes droites, espaces simples.
 */

/** @param {unknown} value */
export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Version sans espaces ni ponctuation : "MT-07" -> "mt07", "R 1250 GS" -> "r1250gs". */
export function compact(value) {
  return normalize(value).replace(/[^a-z0-9]/g, '');
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Négation dans les ~25 caractères précédant le mot-clé :
 * "aucune rayure", "sans voyant moteur", "pas de contre-visite", "jamais eu de ...".
 */
const NEGATION_BEFORE = /(?:^|[^a-z0-9])(aucune?s?|sans|pas|jamais|ni|zero|rien)\s+(?:[^\s,.;:!?]+\s+){0,2}(?:d')?$/;

/** @param {string} text texte normalisé @param {number} index position du match */
export function isNegated(text, index) {
  const before = text.slice(Math.max(0, index - 25), index);
  return NEGATION_BEFORE.test(before);
}

/**
 * Cherche un mot-clé entier (frontières de mot) non nié.
 * @param {string} text texte normalisé
 * @param {string} keyword mot-clé normalisé
 * @returns {string|null} l'extrait trouvé ou null
 */
export function findKeyword(text, keyword) {
  const re = new RegExp(`(^|[^a-z0-9])(${escapeRegex(keyword)})(?=$|[^a-z0-9])`, 'g');
  let match;
  while ((match = re.exec(text)) !== null) {
    const index = match.index + match[1].length;
    if (!isNegated(text, index)) return excerpt(text, index, keyword.length);
  }
  return null;
}

/** @param {string} text @param {string[]} keywords */
export function findAnyKeyword(text, keywords) {
  for (const keyword of keywords) {
    const hit = findKeyword(text, keyword);
    if (hit) return hit;
  }
  return null;
}

/**
 * Comme findKeyword mais pour une RegExp (non globale).
 * @param {string} text @param {RegExp} pattern
 */
export function findPattern(text, pattern) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match;
  while ((match = re.exec(text)) !== null) {
    if (!isNegated(text, match.index)) return excerpt(text, match.index, match[0].length);
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return null;
}

function excerpt(text, index, length) {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 30);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/** Cylindrée en litres extraite de "1.0 TSI", "1,5 TFSI", "2.0 TDI" ; null si absente. */
export function parseDisplacement(value) {
  const m = normalize(value).match(/(?:^|[^0-9])([0-9])[.,]([0-9])(?=\s*(?:l\b|tsi|tfsi|tdi|tce|dci|hdi|bluehdi|puretech|vti|thp|mpi|sce|fsi|etsi|crdi|d\b|i\b|turbo|\s|$))/);
  return m ? Number(`${m[1]}.${m[2]}`) : null;
}

/** Arrondi au multiple de `step` le plus proche. */
export function roundTo(value, step) {
  return Math.round(value / step) * step;
}

/** @param {number} value @param {number} min @param {number} max */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
