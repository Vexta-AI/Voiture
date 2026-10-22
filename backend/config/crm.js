/**
 * RÈGLES DU CRM — pipelines, relances, chaleur des leads, check-lists de papiers.
 *
 * Objectif : le radar remplit le CRM tout seul, le CRM prépare chaque réponse et chaque relance.
 * Toi, tu ne traites que les leads CHAUDS (vendeur d'accord, contre-offre dans tes prix, visite à caler).
 */

/**
 * Trois pipelines :
 *   achat   : tu achètes au vendeur, tu prépares, tu revends (stock)
 *   mandat  : dépôt-vente, le vendeur reste propriétaire, tu touches la plus-value
 *   revente : un acheteur intéressé par un véhicule de ton stock / d'un mandat
 * Étapes "lead" : la chaleur du contact compte. Étapes "stock" : c'est le véhicule qui compte.
 */
export const PIPELINES = {
  achat: {
    label: 'Achat-revente',
    party: 'vendeur',
    stages: [
      { id: 'a_contacter', label: 'À contacter', phase: 'lead' },
      { id: 'contacte', label: 'Contacté', phase: 'lead' },
      { id: 'discussion', label: 'En discussion', phase: 'lead' },
      { id: 'rdv', label: 'Visite / essai', phase: 'lead' },
      { id: 'achete', label: 'Acheté', phase: 'stock' },
      { id: 'preparation', label: 'Préparation', phase: 'stock' },
      { id: 'en_vente', label: 'En vente', phase: 'stock' },
      { id: 'vendu', label: 'Vendu', phase: 'closed', won: true },
      { id: 'perdu', label: 'Perdu', phase: 'closed' },
    ],
  },
  mandat: {
    label: 'Dépôt-vente / Mandat',
    party: 'vendeur',
    stages: [
      { id: 'a_contacter', label: 'À contacter', phase: 'lead' },
      { id: 'contacte', label: 'Contacté', phase: 'lead' },
      { id: 'discussion', label: 'En discussion', phase: 'lead' },
      { id: 'rdv', label: 'RDV signature', phase: 'lead' },
      { id: 'signe', label: 'Mandat signé', phase: 'stock' },
      { id: 'en_vente', label: 'En vente', phase: 'stock' },
      { id: 'vendu', label: 'Vendu', phase: 'closed', won: true },
      { id: 'perdu', label: 'Perdu', phase: 'closed' },
    ],
  },
  revente: {
    label: 'Acheteurs',
    party: 'acheteur',
    stages: [
      { id: 'nouveau', label: 'Nouveau contact', phase: 'lead' },
      { id: 'discussion', label: 'En discussion', phase: 'lead' },
      { id: 'rdv', label: 'Essai prévu', phase: 'lead' },
      { id: 'vendu', label: 'Vendu', phase: 'closed', won: true },
      { id: 'perdu', label: 'Perdu', phase: 'closed' },
    ],
  },
};

/** Relances automatiques : jours de silence après ton dernier message, puis clôture suggérée. */
export const FOLLOW_UP = {
  delaysDays: [2, 5],
  /** Silence total (jours) après lequel on propose de classer le lead en perdu. */
  closeAfterDays: 9,
  /** Visite : rappel la veille. */
  rdvReminderHours: 24,
  /** Carte grise à ton nom : un mois après l'achat (particulier). */
  registrationDeadlineDays: 30,
};

/** Chaleur d'un lead (0-100) : >= hot = 🔥 à traiter en priorité, >= warm = tiède. */
export const HEAT = {
  hot: 70,
  warm: 40,
  byStage: { a_contacter: 10, nouveau: 30, contacte: 20, discussion: 40, rdv: 75 },
  byIntent: { accord: 35, contre_offre_ok: 30, contre_offre_jouable: 10, contre_offre_haute: -10, question: 10, refus: -30, vendu: -100, neutre: 0 },
  /** Réponse reçue il y a moins de 24 h / 72 h / plus de 7 jours. */
  recency: { day: 15, threeDays: 5, stale: -15 },
  /** Le lead attend TA réponse. */
  awaitingYou: 10,
};

/** Motifs de perte (statistiques : où tu perds tes affaires). */
export const LOST_REASONS = ['Déjà vendu', 'Prix trop haut', 'Plus de réponse', 'Mauvais état / vice', 'Papiers pas en règle', 'Trop loin', 'Autre'];

/**
 * Check-lists de papiers par pipeline (cochées dans la fiche).
 * Achat : tout est vérifié AVANT de virer l'argent.
 */
export const DOCUMENTS = {
  achat: [
    { id: 'histovec', label: 'Rapport HistoVec (gages, sinistres, propriétaires)' },
    { id: 'non_gage', label: 'Certificat de non-gage de moins de 15 jours' },
    { id: 'ct', label: 'Contrôle technique de moins de 6 mois (sans contre-visite)' },
    { id: 'carte_grise', label: 'Carte grise barrée « vendu le … à … », datée et signée' },
    { id: 'cession', label: 'Certificat de cession Cerfa 15776, 2 exemplaires signés' },
    { id: 'code_cession', label: 'Code de cession ANTS reçu du vendeur' },
    { id: 'entretien', label: "Carnet d'entretien + factures (courroie si PureTech)" },
    { id: 'cles', label: 'Double des clés' },
    { id: 'immat', label: 'Carte grise à ton nom (ou déclaration d’achat en pro) sous 1 mois' },
  ],
  mandat: [
    { id: 'mandat', label: 'Mandat de dépôt-vente signé (prix net, exclusivité 30 j, dédit)' },
    { id: 'identite', label: "Pièce d'identité du propriétaire" },
    { id: 'carte_grise', label: 'Copie de la carte grise au nom du propriétaire' },
    { id: 'ct', label: 'Contrôle technique de moins de 6 mois' },
    { id: 'non_gage', label: 'Certificat de non-gage' },
    { id: 'rib', label: 'RIB du propriétaire (versement du prix net)' },
    { id: 'entretien', label: "Carnet d'entretien + factures" },
  ],
  revente: [
    { id: 'identite', label: "Pièce d'identité de l'acheteur" },
    { id: 'paiement', label: 'Virement reçu (instantané) AVANT de remettre les clés' },
    { id: 'cession', label: 'Certificat de cession signé en 2 exemplaires' },
    { id: 'carte_grise', label: 'Carte grise barrée et signée remise' },
    { id: 'ct', label: 'CT de moins de 6 mois remis' },
    { id: 'non_gage', label: 'Certificat de non-gage remis' },
    { id: 'declaration', label: 'Cession déclarée sur l’ANTS (sous 15 jours)' },
  ],
};

/** Revente : remise maximale acceptée sur le prix affiché avant de contre-proposer. */
export const RESALE = { maxDiscountRate: 0.05, step: 50 };
