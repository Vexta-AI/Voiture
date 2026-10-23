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
  suv: {
    label: 'SUV',
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
    // Avant les citadines : "C3 Aircross" est un SUV, pas une C3.
    segment: 'suv',
    patterns: [
      'peugeot2008', 'peugeot3008', 'peugeot5008', 'captur', 'duster', 'tiguan', 'troc', 'tcross', 'qashqai', 'juke',
      'kadjar', 'arkana', 'austral', 'c3aircross', 'c5aircross', 'kona', 'tucson', 'sportage', 'stonic', 'kamiq', 'karoq',
      'ateca', 'arona', 'mokka', 'grandland', 'crossland', 'yariscross', 'chr', 'rav4', 'puma', 'kuga', 'q2', 'q3', 'glaclasse', 'gla',
    ],
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
    patterns: [
      'golf', '308', 'megane', 'leon', 'focus', 'octavia', 'astra', 'c4', 'auris', 'corolla', 'i30', 'ceed',
    ],
  },
];

/** Tranches de budget (filtres du dashboard). */
export const PRICE_BANDS = {
  auto: [
    { id: 'a1', label: '3–6 k€', min: 3000, max: 6000 },
    { id: 'a2', label: '6–10 k€', min: 6000, max: 10000 },
    { id: 'a3', label: '10–20 k€', min: 10000, max: 20000 },
    { id: 'a4', label: '20–30 k€', min: 20000, max: 30000 },
  ],
  moto: [
    { id: 'm1', label: '5–8 k€', min: 5000, max: 8000 },
    { id: 'm2', label: '8–12 k€', min: 8000, max: 12000 },
    { id: 'm3', label: '12–18 k€', min: 12000, max: 18000 },
  ],
};

/**
 * Zones de chasse : la zone prioritaire (rayon autour de la base, Nouvelle-Aquitaine) d'abord,
 * puis la France métropolitaine. Hors zone prioritaire, le rapatriement est déduit de la marge :
 * billet aller + retour par la route (carburant + péages).
 */
export const LOGISTICS = {
  priorityRadiusKm: 200,
  ticketCost: 60,
  perKm: 0.15,
  /** France métropolitaine (Corse incluse) : les DOM-TOM sont exclus. */
  metroBounds: { latMin: 41.2, latMax: 51.2, lngMin: -5.3, lngMax: 9.7 },
};

/**
 * Arbitrage campagne -> ville : loin des grandes villes, la demande est faible et les prix plus bas.
 * On achète à la campagne, on revend à Bordeaux (cote = médiane de tout le marché).
 * Une annonce à plus de minKm de toutes ces villes est « campagne ».
 */
export const RURAL = {
  minKm: 30,
  scoreBonus: 5,
  cities: [
    { name: 'Bordeaux', lat: 44.8378, lng: -0.5792 },
    { name: 'Paris', lat: 48.8566, lng: 2.3522 },
    { name: 'Lyon', lat: 45.764, lng: 4.8357 },
    { name: 'Marseille', lat: 43.2965, lng: 5.3698 },
    { name: 'Toulouse', lat: 43.6047, lng: 1.4442 },
    { name: 'Nice', lat: 43.7102, lng: 7.262 },
    { name: 'Nantes', lat: 47.2184, lng: -1.5536 },
    { name: 'Montpellier', lat: 43.6108, lng: 3.8767 },
    { name: 'Strasbourg', lat: 48.5734, lng: 7.7521 },
    { name: 'Lille', lat: 50.6292, lng: 3.0573 },
    { name: 'Rennes', lat: 48.1173, lng: -1.6778 },
    { name: 'Limoges', lat: 45.8336, lng: 1.2611 },
    { name: 'Poitiers', lat: 46.5802, lng: 0.3404 },
    { name: 'Pau', lat: 43.2951, lng: -0.3708 },
    { name: 'La Rochelle', lat: 46.1603, lng: -1.1511 },
    { name: 'Bayonne', lat: 43.4929, lng: -1.4748 },
    { name: 'Angoulême', lat: 45.6484, lng: 0.1562 },
    { name: 'Périgueux', lat: 45.1846, lng: 0.7214 },
    { name: 'Agen', lat: 44.2033, lng: 0.6163 },
    { name: 'Niort', lat: 46.3237, lng: -0.4588 },
    { name: 'Mont-de-Marsan', lat: 43.8902, lng: -0.4994 },
  ],
};

/**
 * Carte grise à l'achat (Nouvelle-Aquitaine, tarif au 1er mars 2026).
 * status "particulier" : immatriculation à ton nom obligatoire sous un mois, à chaque achat.
 * status "pro" (micro-entreprise + W garage) : simple déclaration d'achat, 0 € -> passer à 'pro' le jour J.
 * Le malus ne concerne que la 1re immatriculation en France (import) : jamais une occasion française.
 */
export const REGISTRATION = {
  status: /** @type {'particulier'|'pro'} */ ('particulier'),
  region: 'Nouvelle-Aquitaine',
  /** Taxe régionale par cheval fiscal. */
  pricePerCv: 58,
  /** Au-delà de 10 ans, la taxe régionale est divisée par deux. */
  oldVehicleYears: 10,
  oldVehicleDiscount: 0.5,
  /** Taxe fixe (11 €) + redevance d'acheminement (2,76 €). */
  fixedFees: 13.76,
  /** Chevaux fiscaux par défaut quand l'annonce ne les donne pas (estimation prudente). */
  defaultCv: { citadine: 5, compacte: 6, suv: 7, premium: 8, moto: 5 },
};

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
  // Volumes et liquidité du marché de l'occasion (top ventes VO France 2025 : Clio, C3, 208, 2008, Sandero, Captur…)
  { id: 'c3', label: 'C3', brands: ['citroen'], patterns: ['c3'], market: true },
  { id: 'sandero', label: 'Sandero', brands: ['dacia'], patterns: ['sandero'], market: true },
  { id: '2008', label: '2008', brands: ['peugeot'], patterns: ['2008'], market: true },
  { id: 'captur', label: 'Captur', brands: ['renault'], patterns: ['captur'], market: true },
  { id: 'yaris', label: 'Yaris', brands: ['toyota'], patterns: ['yaris'], market: true },
  { id: '308', label: '308', brands: ['peugeot'], patterns: ['308'], market: true },
  { id: '3008', label: '3008', brands: ['peugeot'], patterns: ['3008'], market: true },
  { id: 'megane', label: 'Mégane', brands: ['renault'], patterns: ['megane'], market: true },
  { id: 'duster', label: 'Duster', brands: ['dacia'], patterns: ['duster'], market: true },
  { id: 'corsa', label: 'Corsa', brands: ['opel'], patterns: ['corsa'], market: true },
];

export const MOTO_TARGETS = [
  { id: 'mt07', label: 'MT-07', family: 'Roadster A2', brands: ['yamaha'], patterns: ['mt07'] },
  { id: 'z650', label: 'Z650', family: 'Roadster A2', brands: ['kawasaki'], patterns: ['z650'] },
  { id: 'z800', label: 'Z800e', family: 'Roadster A2', brands: ['kawasaki'], patterns: ['z800'] },
  { id: 'z900', label: 'Z900', family: 'Roadster Full/A2', brands: ['kawasaki'], patterns: ['z900'] },
  { id: 'gs', label: 'BMW GS 1200/1250', family: 'Gros trail', brands: ['bmw'], patterns: ['r1200gs', 'r1250gs', '1200gs', '1250gs', 'gsadventure'] },
  // Modèles les plus échangés en occasion (roadsters, trails, maxi-scooters)
  { id: 'mt09', label: 'MT-09 / Tracer 9', family: 'Roadster Full', brands: ['yamaha'], patterns: ['mt09', 'tracer9', 'tracer900'], market: true },
  { id: 'tenere', label: 'Ténéré 700', family: 'Trail', brands: ['yamaha'], patterns: ['tenere700', 'tenere'], market: true },
  { id: 'tmax', label: 'T-Max', family: 'Maxi-scooter', brands: ['yamaha'], patterns: ['tmax'], market: true },
  { id: 'xadv', label: 'X-ADV', family: 'Maxi-scooter', brands: ['honda'], patterns: ['xadv'], market: true },
  { id: 'cb650', label: 'CB650R / F', family: 'Roadster A2', brands: ['honda'], patterns: ['cb650'], market: true },
  { id: 'africatwin', label: 'Africa Twin', family: 'Gros trail', brands: ['honda'], patterns: ['africatwin', 'crf1000', 'crf1100'], market: true },
  { id: 'triumph', label: 'Trident / Street Triple', family: 'Roadster', brands: ['triumph'], patterns: ['trident', 'streettriple'], market: true },
  { id: 'sv650', label: 'SV650', family: 'Roadster A2', brands: ['suzuki'], patterns: ['sv650'], market: true },
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
    /** Boîtes à bain d'huile : jamais refusées, même sur mention "DSG7" (sauf DQ200 explicite). */
    wetPattern: /(dq|dsg) ?-?(381|250|500)|bain d'?huile|embrayage humide|dsg ?6/,
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

/**
 * POURQUOI CE PRIX ? Ce que dit l'annonce sur un prix sous la cote.
 * motivated : vendeur pressé, la bonne affaire est réelle (et la négo facile).
 * risks : le prix bas cache un problème -> jamais de MASTERCLASS, vérifier avant de bouger.
 */
export const PRICE_SIGNALS = {
  motivated: [
    { id: 'urgent', label: 'Vente urgente', pattern: /\burgent|\burgence|a vendre (vite|rapidement)|vente rapide/ },
    { id: 'depart', label: 'Départ / déménagement', pattern: /demenag|depart (a|en|pour) l'?etranger|expatri|mutation|quitte (la france|la region)/ },
    { id: 'besoin', label: "Besoin d'argent", pattern: /besoin d'?argent|raisons? financieres?|cause financiere/ },
    { id: 'vie', label: 'Changement de vie', pattern: /naissance|bebe|agrandissement de la famille|succession|deces|heritage|cause (sante|retraite)|depart en retraite/ },
    { id: 'double', label: 'Nouvelle voiture / doublon', pattern: /nouvelle voiture|achat d'?un(e)? autre|vehicule de fonction|double emploi|(2e|deuxieme|seconde) voiture|ne roule plus|ne sert plus/ },
    { id: 'debattre', label: 'Prix à débattre', pattern: /a debattre|\bnegociable|faire offre|ouvert a la negociation/ },
  ],
  risks: [
    { id: 'accident', label: 'Accident / VGE', pattern: /accidente|\baccident|\bchoc\b|sinistre|redresse|\bvge\b|\bvei\b|\bepave/ },
    { id: 'moteur', label: 'Problème moteur', pattern: /(probleme|souci|bruit|claquement|fumee).{0,30}(moteur|turbo|distribution|injecteur)|joint de culasse|turbo (hs|mort|a changer)|consomme de l'?huile/ },
    { id: 'boite', label: 'Problème boîte / embrayage', pattern: /(probleme|souci|bruit|patine).{0,30}(boite|embrayage)|embrayage (a changer|a faire|hs|qui patine)/ },
    { id: 'panne', label: 'Non roulant / pour pièces', pattern: /non roulante?|pour pieces|pieces detachees|ne demarre (pas|plus)|en panne/ },
    { id: 'papiers', label: 'Papiers pas en règle', pattern: /sans carte grise|sans papiers|carte grise (perdue|a refaire)|\bgagee?\b|pour l'?export|non homologue/ },
    { id: 'ct', label: 'CT à faire / défaillances', pattern: /(ct|controle technique) (a faire|a passer|pas fait|non fait|expire)|defaillances? (majeures?|critiques?)/ },
    { id: 'compteur', label: 'Kilométrage douteux', pattern: /compteur (change|remplace|non d'?origine)|kilometrage (non garanti|incertain|non certifie)/ },
  ],
  /** Kilométrage annuel au-delà duquel un prix bas s'explique (usure). */
  highMileagePerYear: 25000,
  /** Décote vs cote à partir de laquelle on parle d'une vraie affaire. */
  bigGapRate: 0.15,
};

/** 💎 MASTERCLASS : pépite à marge réelle >= 2 x le seuil, sans aucun signal de risque, prix crédible (>= 60 % de la cote). */
export const MASTERCLASS = { marginMultiplier: 2, minPriceRate: 0.6, scoreBonus: 10 };

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

/**
 * Remise demandée dans le script de négociation : ~10 % du prix (la marge se fait à l'achat),
 * +5 % quand l'annonce traîne depuis 15 jours, jamais moins de 800 € ni plus de 2 500 €.
 * Sur les petits prix, plafond à 15 % (20 % pour le plancher) pour rester crédible.
 */
export const NEGOTIATION_RANGE = { min: 800, max: 2500, step: 50, targetRate: 0.1, staleRate: 0.05, maxRate: 0.15, floorMaxRate: 0.2 };

// ---------------------------------------------------------------------------
// 7. Dépôt-Vente / Mandat (zéro trésorerie)
// ---------------------------------------------------------------------------

export const MANDATE = {
  /** Annonce "fatiguée" : en ligne depuis plus de 14 jours (ciblage J+15). */
  minDaysOnline: 15,
  exclusivityDays: 30,
  /** Clause de dédit en cas de retrait anticipé (shooting + mise en ligne). */
  withdrawalPenalty: 250,
  /**
   * Rémunération = plus-value au-dessus du PRIX NET vendeur :
   *   commission = prix de vente pro - prix net garanti au propriétaire.
   * minSpread : plus-value minimale visée (paramètre ajustable, non fixé par le cursus).
   * Si la cote ne laisse pas cette marge au-dessus du prix affiché, le prix net
   * proposé au propriétaire est abaissé d'autant.
   */
  commission: { model: 'spread', minSpread: 500 },
  upsells: [
    { id: 'detailing', label: 'Detailing', price: 150, cost: 80 },
    { id: 'entretien', label: 'Entretien', price: 180, cost: 80 },
  ],
  arguments: [
    'Vente plus chère grâce au statut pro',
    'Zéro gestion des curieux : appels, visites et essais filtrés',
    "Zéro avance d'argent pour le propriétaire",
    'Commission uniquement sur la plus-value au-dessus du prix net',
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
