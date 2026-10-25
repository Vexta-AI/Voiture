/**
 * INSPECTION DES PHOTOS PAR IA (Claude, vision).
 *
 * Avant de te déplacer, l'IA regarde les photos et la description d'une pépite comme le ferait un
 * acheteur pro : défauts visibles, cohérence km / usure, compteur lisible, photos manquantes,
 * contradictions entre l'annonce et les photos. Elle sort la liste des questions à poser au vendeur.
 *
 * Ce n'est PAS une expertise : l'IA ne voit que ce que les photos montrent. Elle ne donne aucun
 * chiffrage de réparation (pas de source fiable) et ne modifie ni le score ni la marge (CLAUDE.md).
 */

/** Limites d'usage : l'inspection coûte quelques centimes, on la réserve aux pépites. */
export const INSPECTION = {
  /** Photos envoyées à l'IA par annonce (les premières de l'annonce). Choix métier. */
  maxPhotos: 6,
  /**
   * Inspections automatiques par run de chasse (pépites achat-revente uniquement).
   * 0 = désactivé : tu regardes toi-même avec la check-list, l'IA ne tourne que quand tu cliques.
   * Choix métier (demande de l'utilisateur), réglable par INSPECT_PER_RUN.
   */
  maxPerRun: 0,
  /** Budget mensuel des inspections, en dollars (facturation Anthropic). Choix métier, réglable par INSPECT_BUDGET_USD. */
  monthlyBudgetUsd: 20,
  /**
   * Tarif Claude Opus 5.5 : 4 $ / million de tokens en entrée, 20 $ en sortie.
   * Source : https://platform.claude.com/docs/en/about-claude/pricing
   */
  pricePerMTok: { input: 4, output: 20 },
};

/**
 * Check-list gratuite : ce qu'un acheteur regarde sur les photos avant de se déplacer.
 * Choix métier (points de contrôle courants d'un véhicule d'occasion), sans IA, sans coût.
 */
export const PHOTO_CHECKLIST = [
  'Compteur : km lisible et identique à l’annonce',
  'Tableau de bord : aucun voyant allumé moteur tournant',
  'Carrosserie : même teinte partout, jeux de portes et capot réguliers',
  'Pneus : même marque et usure régulière sur un essieu',
  'Intérieur : usure volant, pommeau et siège conducteur cohérente avec les km',
  'Finition : sellerie, jantes, écran et couleur, est-ce que ça plaira à un acheteur ?',
  'Photos : celles du vrai véhicule (pas constructeur), toutes les faces montrées',
];

export const VERDICTS = /** @type {const} */ (['rassurant', 'a_verifier', 'suspect']);
export const SEVERITIES = /** @type {const} */ (['mineur', 'moyen', 'majeur']);

/** Format de réponse imposé à l'IA (structured outputs). */
export const INSPECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summary', 'defects', 'consistency', 'odometer', 'missingPhotos', 'questions'],
  properties: {
    verdict: { type: 'string', enum: [...VERDICTS] },
    summary: { type: 'string' },
    defects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['zone', 'observation', 'severity', 'photo'],
        properties: {
          zone: { type: 'string' },
          observation: { type: 'string' },
          severity: { type: 'string', enum: [...SEVERITIES] },
          photo: { type: 'integer' },
        },
      },
    },
    consistency: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['point', 'ok', 'observation'],
        properties: {
          point: { type: 'string' },
          ok: { type: 'boolean' },
          observation: { type: 'string' },
        },
      },
    },
    odometer: {
      type: 'object',
      additionalProperties: false,
      required: ['visible', 'reading', 'photo'],
      properties: {
        visible: { type: 'boolean' },
        reading: { type: ['integer', 'null'] },
        photo: { type: ['integer', 'null'] },
      },
    },
    missingPhotos: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
  },
};

export const INSPECTION_SYSTEM = `Tu es un acheteur-revendeur automobile professionnel. Tu inspectes les photos d'une annonce de véhicule d'occasion AVANT de te déplacer.

Règles strictes :
- Décris uniquement ce qui est visible sur les photos ou écrit dans l'annonce. Si une zone n'est pas visible, dis-le (photos manquantes) au lieu de supposer.
- N'invente aucun chiffre : aucun coût de réparation, aucune cote, aucun prix.
- Indique pour chaque défaut le numéro de la photo (1 = première photo envoyée).
- Points à examiner : carrosserie (rayures, bosses, écarts de teinte entre éléments, jeux d'ouverture irréguliers = réparation possible), jantes et pneus, phares, pare-brise, intérieur (usure volant, pommeau, siège conducteur, pédales), voyants allumés au tableau de bord, compteur kilométrique lisible, compartiment moteur (fuites, propreté suspecte), traces d'humidité ou de rouille.
- Cohérence : l'usure visible correspond-elle au kilométrage annoncé ? Le compteur affiché correspond-il au kilométrage annoncé ? La finition, les options et la couleur correspondent-elles à la description ? Les photos semblent-elles être celles du véhicule (même véhicule sur toutes les photos, pas de photos constructeur) ?
- Verdict : "rassurant" si rien d'inquiétant n'est visible et les photos couvrent l'essentiel, "a_verifier" si des points restent à contrôler sur place, "suspect" si un défaut majeur, une incohérence forte ou des photos trompeuses apparaissent.
- Questions : 3 à 6 questions concrètes à poser au vendeur avant la visite, en vouvoiement.
- Tout en français, phrases courtes.`;

/**
 * Texte de l'annonce envoyé avec les photos.
 * @param {import('./scoring.js').Listing} listing
 * @param {number} photoCount
 */
export function inspectionPrompt(listing, photoCount) {
  const lines = [
    `Annonce : ${listing.title}`,
    `Année ${listing.year} · ${Number(listing.mileage).toLocaleString('fr-FR')} km annoncés · ${listing.fuel ?? 'carburant ?'} · boîte ${listing.gearbox ?? '?'}`,
    `Prix affiché : ${Number(listing.price).toLocaleString('fr-FR')} €`,
  ];
  if (listing.options?.length) lines.push(`Options annoncées : ${listing.options.slice(0, 30).join(', ')}`);
  lines.push('', 'Description du vendeur :', (listing.description ?? '(aucune description)').slice(0, 4000));
  lines.push('', `${photoCount} photo(s) ci-dessus, numérotées de 1 à ${photoCount} dans l'ordre.`);
  return lines.join('\n');
}

const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const photoIndex = (v, count) => (Number.isInteger(v) && v >= 1 && v <= count ? v : null);

/**
 * Valide la réponse de l'IA (on ne fait jamais confiance aveuglément au JSON reçu).
 * @param {unknown} raw
 * @param {number} photoCount
 */
export function parseInspection(raw, photoCount) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, any>} */ (raw);
  if (!VERDICTS.includes(o.verdict)) return null;
  const defects = (Array.isArray(o.defects) ? o.defects : [])
    .filter((d) => d && str(d.observation))
    .slice(0, 12)
    .map((d) => ({ zone: str(d.zone, 60), observation: str(d.observation), severity: SEVERITIES.includes(d.severity) ? d.severity : 'moyen', photo: photoIndex(d.photo, photoCount) }));
  const consistency = (Array.isArray(o.consistency) ? o.consistency : [])
    .filter((c) => c && str(c.point))
    .slice(0, 8)
    .map((c) => ({ point: str(c.point, 80), ok: Boolean(c.ok), observation: str(c.observation) }));
  const odo = o.odometer && typeof o.odometer === 'object' ? o.odometer : {};
  const reading = Number.isInteger(odo.reading) && odo.reading >= 0 ? odo.reading : null;
  return {
    verdict: /** @type {typeof VERDICTS[number]} */ (o.verdict),
    summary: str(o.summary, 500),
    defects,
    consistency,
    odometer: { visible: Boolean(odo.visible) && reading !== null, reading, photo: photoIndex(odo.photo, photoCount) },
    missingPhotos: (Array.isArray(o.missingPhotos) ? o.missingPhotos : []).map((m) => str(m, 80)).filter(Boolean).slice(0, 8),
    questions: (Array.isArray(o.questions) ? o.questions : []).map((q) => str(q, 300)).filter(Boolean).slice(0, 8),
  };
}

/**
 * Compteur lu sur photo vs kilométrage annoncé : écart signalé au-delà de 5 % (et 2 000 km). Choix métier.
 * @param {{ odometer: { reading: number | null } }} inspection
 * @param {number} announced
 */
export function odometerGap(inspection, announced) {
  const reading = inspection.odometer.reading;
  if (reading === null || !(announced > 0)) return null;
  const gap = reading - announced;
  return Math.abs(gap) > Math.max(2000, announced * 0.05) ? gap : null;
}

/** Coût estimé d'une inspection (tokens facturés × tarif publié). */
export function inspectionCostUsd(usage) {
  const input = Number(usage?.input_tokens ?? 0) + Number(usage?.cache_creation_input_tokens ?? 0) + Number(usage?.cache_read_input_tokens ?? 0);
  const output = Number(usage?.output_tokens ?? 0);
  return Math.round(((input * INSPECTION.pricePerMTok.input + output * INSPECTION.pricePerMTok.output) / 1_000_000) * 10_000) / 10_000;
}

const VERDICT_LABEL = { rassurant: '✅ rassurant', a_verifier: '🟠 à vérifier', suspect: '🔴 suspect' };
export const verdictLabel = (v) => VERDICT_LABEL[v] ?? v;

/**
 * Une ligne pour l'alerte Telegram.
 * @param {ReturnType<typeof parseInspection> & {}} inspection
 * @param {number} announcedKm
 */
export function inspectionLine(inspection, announcedKm) {
  const major = inspection.defects.filter((d) => d.severity === 'majeur');
  const parts = [`🔍 Photos (IA) : ${verdictLabel(inspection.verdict)}`];
  if (major.length) parts.push(`${major.length} défaut(s) majeur(s) : ${major.slice(0, 2).map((d) => d.observation).join(' ; ')}`);
  else if (inspection.defects.length) parts.push(`${inspection.defects.length} point(s) relevé(s)`);
  const gap = odometerGap(inspection, announcedKm);
  if (gap !== null) parts.push(`compteur photo ${inspection.odometer.reading?.toLocaleString('fr-FR')} km ≠ annonce`);
  return parts.join(' · ');
}
