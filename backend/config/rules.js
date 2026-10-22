/**
 * RÈGLES MÉTIER — Achat-Revente & Mandat Auto/Moto (Bordeaux & Région)
 *
 * Toutes les valeurs du cursus sont centralisées ici : le moteur de scoring
 * (backend/utils/scoring.js), les générateurs de messages et l'interface
 * lisent exclusivement ce fichier. Modifier une valeur ici = la modifier partout.
 *
 * Les mots-clés sont écrits sous forme NORMALISÉE (minuscules, sans accents,
 * apostrophes droites) : voir backend/utils/text.js.
 */

// ---------------------------------------------------------------------------
// 1. Formule financière
// ---------------------------------------------------------------------------

export const COSTS = {
  /** Frais de remise en état de base : detailing pro 80-90 € + petite méca. */
  RECONDITIONING_BASE: 350,
  /** Capital risque systématique : imprévu ou négo de l'acheteur final. */
  RISK_CAPITAL: 200,
  /** Coût réel d'un detailing pro intérieur/extérieur. */
  DETAILING_REAL_COST: 80,
};

/** Plafond du cumul des options déclencheurs (règle d'or : ne jamais viser le haut du marché). */
export const MAX_TRIGGER_BONUS = 2500;

// ---------------------------------------------------------------------------
// 2. Segments, budgets & seuils de statut
// ---------------------------------------------------------------------------

export const BUDGETS = {
  auto: { min: 3000, max: 30000, label: 'Chasse Auto (3k€ - 30k€)' },
  moto: { min: 5000, max: 18000, label: 'Chasse Moto (5k€ - 18k€)' },
};

/**
 * pepiteThreshold : marge nette au-delà de laquelle l'annonce passe
 * "🔥 PÉPITE POTENTIELLE" (> 1 000 € citadines, > 2 000 € compactes/premium).
 */
export const SEGMENTS = {
  citadine: {
    label: 'Citadine',
    pepiteThreshold: 1000,
    targetNetMargin: [800, 1500],
    budget: [3000, 6000],
  },
  compacte: {
    label: 'Compacte',
    pepiteThreshold: 2000,
    targetNetMargin: [2000, 4000],
    budget: [10000, 25000],
  },
  premium: {
    label: 'Premium',
    pepiteThreshold: 2000,
    targetNetMargin: [2000, 4000],
    budget: [10000, 25000],
  },
  moto: {
    // Non fixé par le cursus : paramètre ajustable.
    label: 'Moto',
    pepiteThreshold: 1500,
    targetNetMargin: [1000, 2500],
    budget: [5000, 18000],
  },
};

/**
 * Classification automatique : motifs comparés au texte "marque modèle" compacté
 * (la version n'est utilisée que pour versionPatterns, ex. Golf GTI = premium).
 */
export const SEGMENT_RULES = [
  {
    segment: 'premium',
    patterns: ['tesla', 'classea', 'aclass', 'audia3', 'audis3', 'serie1', 'golfgti', 'golfr'],
    versionPatterns: ['gti', 'golfr', 'amg'],
  },
  {
    segment: 'citadine',
    patterns: [
      'clio', 'twingo', '208', 'peugeot108', 'polo', 'citroenc3', 'citroenc1', 'corsa', 'yaris', 'aygo',
      'sandero', 'ibiza', 'fiesta', 'hyundaii10', 'hyundaii20', 'micra', 'fabia', 'volkswagenup', 'citigo', 'zoe', 'swift',
    ],
  },
  {
    segment: 'compacte',
    patterns: ['golf', '308', 'megane', 'leon', 'focus', 'octavia', 'astra', 'c4', 'auris', 'corolla', 'i30', 'ceed'],
  },
];

// ---------------------------------------------------------------------------
// 3. Cibles de chasse (filtres des onglets)
// ---------------------------------------------------------------------------

/**
 * brands : marques acceptées (vide = toutes)
 * patterns : comparés au "modèle + version" compacté (sans espaces ni tirets).
 */
export const AUTO_TARGETS = [
  { id: 'clio', label: 'Clio 4/5', brands: ['renault'], patterns: ['clio4', 'clioiv', 'clio5', 'cliov'] },
  { id: 'polo', label: 'Polo', brands: ['volkswagen', 'vw'], patterns: ['polo'] },
  { id: 'golf', label: 'Golf', brands: ['volkswagen', 'vw'], patterns: ['golf'] },
  { id: '208', label: '208', brands: ['peugeot'], patterns: ['208'] },
  { id: 'tesla', label: 'Tesla Shanghai', brands: ['tesla'], patterns: ['model3', 'modely'] },
  { id: 'twingo', label: 'Twingo', brands: ['renault'], patterns: ['twingo'], cursus: true },
  { id: 'classea', label: 'Classe A', brands: ['mercedes', 'mercedesbenz'], patterns: ['classea', 'a180', 'a200', 'a220', 'a250', 'a35'], cursus: true },
  { id: 'a3', label: 'A3 / S3', brands: ['audi'], patterns: ['a3', 's3'], cursus: true },
];

export const MOTO_TARGETS = [
  { id: 'mt07', label: 'MT-07', family: 'Roadster A2', brands: ['yamaha'], patterns: ['mt07'] },
  { id: 'z650', label: 'Z650', family: 'Roadster A2', brands: ['kawasaki'], patterns: ['z650'] },
  { id: 'z800', label: 'Z800e', family: 'Roadster A2', brands: ['kawasaki'], patterns: ['z800'] },
  { id: 'z900', label: 'Z900', family: 'Roadster Full/A2', brands: ['kawasaki'], patterns: ['z900'] },
  { id: 'gs', label: 'BMW GS 1200/1250', family: 'Gros trail', brands: ['bmw'], patterns: ['r1200gs', 'r1250gs', '1200gs', '1250gs', 'gsadventure'] },
];

// ---------------------------------------------------------------------------
// 4. Blacklist mécanique (moteurs poison) — REFUS immédiat, score 0
// ---------------------------------------------------------------------------

export const BLACKLIST = {
  renaultTce: {
    id: 'renault-h5ft',
    label: 'Renault 1.2 TCe H5Ft (2012-2018)',
    reason: "Surconsommation d'huile / casse moteur sur le 1.2 TCe 115/120/130 ch (code H5Ft).",
    brands: ['renault', 'dacia'],
    yearFrom: 2012,
    yearTo: 2018,
  },
  puretech: {
    id: 'psa-puretech',
    label: '1.2 PureTech avant 2023',
    reason:
      "Courroie humide qui se désagrège (crépine bouchée, perte de pression d'huile). Achat uniquement avec facture courroie + crépine < 6 mois ET à -30 % de la cote.",
    brands: ['peugeot', 'citroen', 'ds', 'opel'],
    beforeYear: 2023,
    maxBeltAgeMonths: 6,
    requiredDiscount: 0.3,
  },
  dq200: {
    id: 'vag-dq200',
    label: 'Boîte DSG7 à sec (DQ200)',
    reason: 'Mécatronique fragile autour de 100 000 km : facture de 1 800 € à 2 500 €.',
    brands: ['volkswagen', 'vw', 'audi', 'seat', 'skoda', 'cupra'],
    /** Au-delà de cette cylindrée, la DSG7 est la DQ381 à bain d'huile (hors blacklist). */
    maxDisplacement: 1.6,
  },
};

/** Mots-clés rédhibitoires (regex sur texte normalisé). Négations gérées ("aucun voyant moteur"). */
export const BLACKLIST_KEYWORDS = [
  { id: 'voyant', label: 'Voyant moteur', pattern: /voyants? moteur/ },
  { id: 'boite-hs', label: 'Boîte HS', pattern: /boite( de vitesses?| auto(matique)?)? (hs|morte|a changer|a refaire)/ },
  {
    id: 'sans-ct',
    label: "Vendu dans l'état sans CT",
    pattern: /(vendue? (dans|en) l'?etat.{0,40}sans (ct|controle technique))|(sans (ct|controle technique).{0,40}vendue? (dans|en) l'?etat)/,
  },
  { id: 'contre-visite', label: 'Contre-visite', pattern: /contre[ -]?visite/ },
];

// ---------------------------------------------------------------------------
// 5. Options "déclencheurs" — bonus +500 € à +1 000 € sur la valeur perçue
// ---------------------------------------------------------------------------

export const VALUE_TRIGGERS = {
  auto: [
    { id: 'toit', label: 'Toit ouvrant / panoramique', bonus: 700, keywords: ['toit ouvrant', 'toit panoramique', 'toit pano', 'toit vitre', 'toit en verre', 'toit electrique'] },
    { id: 'amg', label: 'Pack AMG', bonus: 1000, keywords: ['pack amg', 'amg line', 'finition amg', 'kit amg'] },
    { id: 'sline', label: 'S-Line', bonus: 800, keywords: ['s-line', 's line', 'sline'] },
    { id: 'msport', label: 'M-Sport', bonus: 900, keywords: ['m sport', 'm-sport', 'msport', 'pack m'] },
    { id: 'meplat', label: 'Volant à méplat', bonus: 500, keywords: ['volant a meplat', 'volant meplat', 'volant sport a meplat', 'volant mepla'] },
    { id: 'mbux', label: 'Double écran MBUX', bonus: 500, keywords: ['double ecran', 'mbux widescreen', 'widescreen', 'ecrans 10'] },
  ],
  moto: [
    { id: 'valises', label: 'Valises alu / top-case (BMW ou Givi)', bonus: 600, keywords: ['valises alu', 'valise alu', 'valises aluminium', 'valises bmw', 'valises givi', 'top case', 'top-case', 'topcase', 'givi'] },
    { id: 'akrapovic', label: 'Ligne Akrapovic', bonus: 700, keywords: ['akrapovic', 'ligne akra', 'akra'] },
    { id: 'shifter', label: 'Shifter Pro', bonus: 500, keywords: ['shifter pro', 'shift assistant pro', 'quickshifter', 'quick shifter', 'shifter'] },
    { id: 'touring', label: 'Pack Touring', bonus: 600, keywords: ['pack touring', 'pack tour'] },
    { id: 'dynamic', label: 'Pack Dynamic', bonus: 600, keywords: ['pack dynamic', 'pack dynamique'] },
  ],
};

/** Tesla Model 3/Y : versions Shanghai (VIN LRW) avec batterie LFP et processeur AMD Ryzen. */
export const TESLA_RULES = {
  shanghaiVinPrefix: 'LRW',
  shanghai: { id: 'tesla-shanghai', label: 'Tesla Shanghai (VIN LRW)', bonus: 500 },
  lfp: { id: 'tesla-lfp', label: 'Batterie LFP (charge 100 % OK)', bonus: 250, keywords: ['lfp', 'lithium fer phosphate', 'lithium-fer-phosphate'] },
  ryzen: { id: 'tesla-ryzen', label: 'Processeur AMD Ryzen', bonus: 250, keywords: ['ryzen', 'amd'] },
};

/** Bridage A2 : carte grise MTT1 (A2) vs MTT2 (Full). */
export const MOTO_A2 = {
  id: 'a2',
  label: 'Éligible A2 (MTT1 / kit bridage)',
  bonus: 500,
  keywords: ['bridee a2', 'bridage a2', 'version a2', 'permis a2', 'kit bridage', '35kw', '35 kw', 'mtt1', 'bride a2'],
};

// ---------------------------------------------------------------------------
// 6. Leviers de négociation (défauts détectés dans le texte)
// ---------------------------------------------------------------------------

/**
 * discount : baisse de prix à demander au vendeur.
 * realCost : coût réel de remise en état (pièces Autodoc / Allopneus, carrossier, polish).
 */
export const NEGOTIATION_LEVERS = [
  {
    id: 'rayure',
    label: 'Rayure / griffe superficielle',
    discount: 300,
    realCost: 90,
    keywords: ['rayure', 'rayures', 'raye', 'rayee', 'griffe', 'griffes', 'griffure', 'eraflure', 'eraflures', 'petite touche', 'frottement', 'marque de parking'],
    argument: "polish pro à 90 € ou peinture d'élément à 200 € chez le carrossier",
  },
  {
    id: 'carrosserie',
    label: 'Calandre / pare-choc / élément à repeindre',
    discount: 500,
    realCost: 200,
    keywords: ['pare-choc abime', 'pare choc abime', 'pare-choc a repeindre', 'pare choc a repeindre', 'calandre cassee', 'calandre abimee', 'calandre fendue', 'element a repeindre', 'bosse', 'petit choc', 'enfoncement', 'peinture ecaillee', 'vernis'],
    argument: "peinture d'élément à 200 € + dépose/repose chez le carrossier",
  },
  {
    id: 'pneus',
    label: 'Pneus à remplacer (< 20 %)',
    discount: 250,
    realCost: 160,
    keywords: ['pneus a prevoir', 'pneus a changer', 'pneus uses', 'pneus en fin de vie', 'pneumatiques a prevoir', 'pneu a changer', 'pneu a prevoir', 'pneus limites', 'pneus a 20', 'pneus avant a prevoir', 'pneus arriere a prevoir', 'pneu arriere a prevoir'],
    argument: 'train de pneus commandé sur Allopneus, loin des devis concession',
  },
  {
    id: 'plaquettes',
    label: 'Plaquettes / freins à prévoir',
    discount: 150,
    realCost: 60,
    keywords: ['plaquettes a prevoir', 'plaquettes a changer', 'freins a prevoir', 'disques et plaquettes', 'plaquettes usees', 'plaquettes en fin de vie'],
    argument: 'kit plaquettes Autodoc + montage en indépendant',
  },
  {
    id: 'jantes',
    label: 'Jantes rayées / bi-ton frottées',
    discount: 250,
    realCost: 170,
    keywords: ['jante rayee', 'jantes rayees', 'jantes frottees', 'jante frottee', 'jantes abimees', 'jante abimee', 'trottoir'],
    argument: "rénovation chez un spécialiste à 170 € HT (on ne remplace jamais la jante)",
  },
  {
    id: 'entretien',
    label: 'Révision / vidange à prévoir',
    discount: 200,
    realCost: 80,
    keywords: ['revision a prevoir', 'vidange a prevoir', 'entretien a prevoir', 'revision a faire', 'vidange a faire', 'entretien a faire'],
    argument: 'vidange + filtres à 80 € en indépendant',
  },
  {
    id: 'chaine',
    label: 'Kit chaîne à prévoir (moto)',
    discount: 200,
    realCost: 90,
    keywords: ['kit chaine a prevoir', 'kit chaine a changer', 'chaine a prevoir', 'chaine a changer', 'kit chaine use'],
    argument: 'kit chaîne Autodoc à 90 €',
    vehicleType: 'moto',
  },
];

/** Bornes de la remise demandée dans le script de négociation. */
export const NEGOTIATION_RANGE = { min: 500, max: 1000, step: 50 };

// ---------------------------------------------------------------------------
// 7. Dépôt-Vente / Mandat (zéro trésorerie)
// ---------------------------------------------------------------------------

export const MANDATE = {
  /** Annonce "fatiguée" : en ligne depuis plus de 14 jours (ciblage J+15). */
  minDaysOnline: 15,
  exclusivityDays: 30,
  /** Clause de dédit en cas de retrait anticipé (shooting + mise en ligne). */
  withdrawalPenalty: 250,
  /** Commission dépôt-vente — paramètre ajustable (non fixé par le cursus). */
  commission: { rate: 0.06, min: 500 },
  upsells: [
    { id: 'detailing', label: 'Detailing', price: 150, cost: 80 },
    { id: 'entretien', label: 'Entretien', price: 180, cost: 80 },
  ],
  arguments: [
    'Vente plus chère grâce au statut pro',
    'Gestion complète : photos, annonces, appels, essais, paperasse',
    "Zéro avance d'argent pour le propriétaire",
    'Garantie mécanique proposée à l’acheteur',
  ],
};

// ---------------------------------------------------------------------------
// 8. Saisonnalité & liquidité
// ---------------------------------------------------------------------------

export const SEASONALITY = {
  moto: {
    /** Achat en hiver : viser -20 % sur la cote. Revente au printemps. */
    buyMonths: [11, 12, 1, 2],
    sellMonths: [3, 4, 5, 6],
    winterDiscount: 0.2,
  },
};

/** 5 portes : valeur supérieure de 1 000 € à 1 500 € vs 3 portes. */
export const DOORS_RULE = { preferred: 5, valueGap: [1000, 1500] };
