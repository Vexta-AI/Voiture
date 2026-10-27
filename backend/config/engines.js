/**
 * FICHES MOTEUR — distribution, coût estimé du kit, points faibles, questions vendeur.
 *
 * Origine : recherche sourcée du 27/10/2026 (CLAUDE.md, règle n°1). Chaque valeur garde sa source
 * en commentaire (URL + type : officiel / presse / commercial / forum / encyclopédie).
 *
 * À lire avant usage :
 * - AUCUN carnet constructeur n'a pu être consulté (pages hors ligne ou 403). Tous les intervalles viennent
 *   de sources secondaires : L'argus (presse, média commercial), fiches-auto.fr / autocopilot.fr (sites
 *   éditoriaux commerciaux), idgarages.com (comparateur, prix moyens de devis), ad.fr (réseau de garages,
 *   erreurs avérées sur le type de distribution), forums (dont un tuto L'argus de 2012). Seule exception :
 *   Tesla (manuel et page garantie officiels, lus par extrait).
 * - `intervalKm` / `intervalYears` sont des FOURCHETTES [min, max] entre sources, pas une valeur retenue.
 *   « À valider sur carnet constructeur / VIN » avant tout usage comme seuil dur.
 * - `intervalKm: null` = pas d'intervalle publié trouvé (et non « chaîne à vie »).
 * - `kitCost` = estimation commerciale en € TTC, pose comprise (kit + galets + pompe à eau si entraînée).
 *   À afficher comme « estimation ».
 * - `solid: true` uniquement pour les fiches listées « plutôt solides » par la recherche (type recoupé).
 * - Le premier élément qui correspond gagne : les entrées spécifiques sont placées avant les génériques.
 */

/**
 * @typedef {'essence'|'diesel'|'hybride'|'electrique'|null} EngineFuel
 * @typedef {{ brands: string[], fuel: EngineFuel, yearFrom: number|null, yearTo: number|null, text: RegExp }} EngineMatch
 * @typedef {{
 *   type: 'courroie'|'courroie-humide'|'chaine'|'mixte'|null,
 *   intervalKm: [number, number]|null,
 *   intervalYears: [number, number]|null,
 *   solid: boolean,
 * }} EngineDistribution
 * @typedef {{
 *   id: string,
 *   label: string,
 *   match: EngineMatch[],
 *   distribution: EngineDistribution|null,
 *   kitCost: { min: number, max: number }|null,
 *   weakPoints: string[],
 *   sellerQuestions: string[],
 * }} EngineSheet
 */

const RENAULT = ['renault', 'dacia'];
const PSA = ['peugeot', 'citroen'];
const VW = ['volkswagen', 'vw'];
const AUDI = ['audi'];
const MB = ['mercedes', 'mercedesbenz'];

// Sources récurrentes (rappelées en toutes lettres à côté de chaque valeur) :
// FA_CHAINE_ESS = https://www.fiches-auto.fr/articles-auto/moteurs-essences-base-documentaire/s-1270-moteurs-essence-avec-chaine-de-distribution.php (commercial)
// FA_CHAINE_DIE = https://www.fiches-auto.fr/articles-auto/motorisations-diesels-testees/s-1111-moteurs-diesel-avec-chaine-de-distribution.php (commercial)
// ARGUS_TUTO    = https://www.largus.fr/forum-auto/tutoriels-et-topics-de-reference/tuto-preconisations-changement-courroies-de-distribution/243826.html (forum, tuto utilisateur 2012)
// FA_MOINS_FIAB = https://www.fiches-auto.fr/articles-auto/fiabilite/s-2472-moteurs-essence-les-moins-fiables.php (commercial)

/** @type {EngineSheet[]} */
export const ENGINE_SHEETS = [
  // =========================================================================
  // TESLA
  // =========================================================================
  {
    id: 'tesla-model3-modely',
    label: 'Tesla Model 3 / Model Y (électrique)',
    match: [{ brands: ['tesla'], fuel: null, yearFrom: 2019, yearTo: null, text: /\bmodel ?[3y]\b/ }],
    distribution: null, // sans objet (moteur électrique)
    kitCost: null,
    weakPoints: [
      // Garantie : https://www.tesla.com/es_MX/support/vehicle-warranty (officiel, marché Mexique) + https://www.automobile-propre.com/tesla-model-3-garantie-batterie/ (presse). À valider sur tesla.com/fr_FR.
      'Garantie batterie 8 ans / 160 000 km (propulsion) ou 192 000 km (Grande Autonomie, Performance), 70 % de capacité minimum. À valider sur tesla.com/fr_FR.',
      // Liquide de frein : https://www.tesla.com/ownersmanual/model3/fr_be/GUID-E95DAAD9-646E-4249-9930-B109ED7B1D91.html (officiel, 4 ans) vs https://www.tesla.com/fr_CH/support/maintenance-plans (officiel, 2 ans)
      'Entretien : liquide de frein à contrôler tous les 2 à 4 ans selon les pages Tesla, filtre d\'habitacle tous les 2 ans.',
      // Permutation : https://www.tesla.com/ownersmanual/model3/fr_be/GUID-E95DAAD9-646E-4249-9930-B109ED7B1D91.html (officiel, via extrait)
      'Permutation des pneus tous les 10 000 km ou dès 1,5 mm d\'écart de profondeur.',
    ],
    sellerQuestions: [
      'Quelle autonomie affichée à 100 % aujourd\'hui, comparée à celle d\'origine ?',
      'Quelle version exacte (Propulsion, Grande Autonomie, Performance ; LFP ou non) et quelle date de 1re mise en circulation ?',
      'Avez-vous l\'historique des interventions Tesla (liquide de frein, filtre d\'habitacle) ?',
    ],
  },

  // =========================================================================
  // RENAULT / DACIA (+ Mercedes, Smart)
  // =========================================================================
  {
    id: 'renault-etech-16-hybrid',
    label: '1.6 E-Tech hybride 140/145 et rechargeable 160',
    match: [{ brands: ['renault'], fuel: 'hybride', yearFrom: 2020, yearTo: null, text: /\be-?tech\b|\bfull hybrid\b/ }],
    distribution: {
      type: 'chaine', // FA_CHAINE_ESS (commercial) : « 1.6 E-Tech 140 et 145 ch : chaîne »
      intervalKm: null,
      intervalYears: null,
      solid: false, // la recherche ne juge solides que les points faibles
    },
    kitCost: null,
    weakPoints: [
      // https://www.largus.fr/actualite-automobile/fiabilite-renault-1-6-hybride-des-problemes-de-boite-sur-les-clio-captur-megane-et-arkana-30035505.html (presse)
      'Fuite d\'huile au joint du moteur électrique (prod. 08/2019-02/2024) : perte de traction ou « surchauffe moteur électrique ». OTS Renault si < 7 ans et < 150 000 km.',
      // https://www.largus.fr/actualite-automobile/fiabilite-renault-1-6-e-tech-remplacement-de-la-boite-hybride-pour-eradiquer-un-bruit-30039544.html (presse)
      'Bruit strident au démarrage : remplacement de la boîte hybride.',
      // https://www.largus.fr/actualite-automobile/rappel-renault-1-6-hybride-risque-de-surchauffe-sur-16-374-clio-captur-et-arkana-30036098.html (presse)
      'Rappel 2024 « surchauffe boîte de vitesses » (reprogrammation).',
    ],
    sellerQuestions: [
      'L\'OTS Renault sur la boîte ou le joint du moteur électrique a-t-elle été faite (vérifiable par VIN) ?',
      'Avez-vous déjà eu une perte de traction au démarrage, un bruit strident ou un message de surchauffe ?',
    ],
  },
  {
    id: 'renault-f9q-19dci',
    label: '1.9 dCi 130 (F9Q)',
    match: [
      // années À valider
      { brands: ['renault'], fuel: 'diesel', yearFrom: 2008, yearTo: 2010, text: /\b1[.,]9 ?dci\b|\bf9q\b/ },
    ],
    distribution: {
      type: 'courroie', // ARGUS_TUTO (forum)
      intervalKm: [120000, 160000], // ARGUS_TUTO (forum) : 120 000 km/5 ans ; 130 FAP Mégane III 160 000 km/6 ans
      intervalYears: [5, 6], // ARGUS_TUTO (forum)
      solid: false,
    },
    kitCost: null, // pas de source par moteur
    weakPoints: [], // non recherché (page fiches-auto s-2444 non lue)
    sellerQuestions: ['Avez-vous la facture du kit de distribution (km et date) ?'],
  },
  {
    id: 'renault-r9m-16dci',
    label: '1.6 dCi 130/160/165 (R9M)',
    match: [{ brands: ['renault'], fuel: 'diesel', yearFrom: 2011, yearTo: 2020, text: /\b1[.,]6 ?(energy )?dci\b|\b(energy )?dci ?(130|160|165)\b|\br9m\b/ }],
    distribution: {
      type: 'chaine', // FA_CHAINE_DIE (commercial) : « Renault 1.6 dCi : chaîne »
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2443-fiabilite-du-16-dci.php (commercial)
      '130 ch : turbo à géométrie variable (suralimentation), sonde lambda remplacée tôt.',
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2443-fiabilite-du-16-dci.php (commercial)
      '160/165 ch : EGR encrassée, échangeur EGR et collecteur fissurés, fuites au carter de distribution.',
      // https://www.largus.fr/actualite-automobile/moteurs-1-5-dci-et-1-6-dci-renault-et-dacia-rectifient-les-desagrements-moteur-30039315.html (presse)
      'Rappel NOx 2024 puis correctif depuis janvier 2025 (à-coups).',
    ],
    sellerQuestions: [
      'Le rappel NOx et son correctif de 2025 ont-ils été faits ? Avez-vous des à-coups ?',
      'Le turbo ou la vanne EGR ont-ils déjà été remplacés ?',
    ],
  },
  {
    id: 'renault-k9k-15dci',
    label: '1.5 dCi / 1.5 Blue dCi (K9K)',
    match: [
      { brands: ['renault'], fuel: 'diesel', yearFrom: 2007, yearTo: 2024, text: /\b1[.,]5 ?(blue ?)?dci\b|\bk9k\b|\b(blue ?|energy )?dci ?(65|70|75|85|86|90|95|100|105|106|110|115)\b/ },
      { brands: ['dacia'], fuel: 'diesel', yearFrom: 2010, yearTo: 2024, text: /\b1[.,]5 ?(blue ?)?dci\b|\bk9k\b|\b(blue ?)?dci ?(75|90|95|110|115)\b/ },
      // OM607/OM608 = K9K : https://autocopilot.fr/motorisations/1-5-dci-k9k (commercial), https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-3168-fiabilite-des-180d-180-cdi-mercedes.php (commercial)
      { brands: MB, fuel: 'diesel', yearFrom: 2012, yearTo: 2024, text: /\bom ?60[78]\b|\b1461 ?(cm3?)?\b/ },
      // A/B 180 CDI W176/W246 = 1.5 dCi selon fiches-auto ; la fiche OM651 de la recherche range le B 180 CDI 109 côté 1.8 Mercedes : À valider.
      // A/B 180 d (116 ch) non mappé : 3 moteurs possibles selon fiches-auto.
      { brands: MB, fuel: 'diesel', yearFrom: 2012, yearTo: 2018, text: /\b[ab] ?180 ?cdi\b/ },
    ],
    distribution: {
      type: 'courroie', // FA_CHAINE_DIE (commercial) : « le 1.5 dCi de Renault » cité comme exception à courroie
      // ARGUS_TUTO (forum) : 120 000 km/5 ans à 160 000 km/6 ans ; https://autocopilot.fr/motorisations/1-5-dci-k9k (commercial) : 120 000/6 ans ;
      // ad.fr (commercial) : Clio 4 150 000/6 ans, Captur 160 000/6 ans, Sandero 120 000/6 ans
      intervalKm: [120000, 160000],
      intervalYears: [5, 6],
      solid: true,
    },
    // Estimation : https://autocopilot.fr/motorisations/1-5-dci-k9k (commercial, 480-850 €) ;
    // https://www.idgarages.com/fr-fr/vehicules/dacia/dacia-sandero-courroie-kit-de-distribution (commercial, 464-622 €) ;
    // https://www.idgarages.com/fr-fr/vehicules/renault/renault-clio-iv-courroie-kit-de-distribution (commercial, 575-720 €)
    kitCost: { min: 464, max: 850 },
    weakPoints: [
      // https://www.largus.fr/actualite-automobile/courroie-de-distribution-des-ennuis-a-la-chaine-3823379_p_2.html (presse)
      'Campagne Renault : courroie qui frotte sur la poulie de vilebrequin (prod. 09/2009-02/2011), risque de casse.',
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2441-fiabilite-du-15-dci.php (commercial)
      'Anciennes versions : coussinets de bielle, pompe Delphi (limaille), FAP sur premiers 110 ch. Amélioré à partir de 2015.',
      // https://www.largus.fr/actualite-automobile/renault-dacia-1-5-blue-dci-le-probleme-de-surconsommation-d-huile-solutionne-30023258.html (presse) + https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2442-fiabilite-du-15-blue-dci.php (commercial)
      'Blue dCi 01/2019-04/2020 : surconsommation d\'huile (intervention à la demande) ; défauts AdBlue sur le 115 ch.',
    ],
    sellerQuestions: [
      'Avez-vous la facture du kit de distribution (courroie, galets, pompe à eau) avec km et date ?',
      'Produit entre 2009 et 2011 : la campagne Renault sur la courroie a-t-elle été faite ?',
      'Blue dCi 2019-2020 : consomme-t-il de l\'huile, l\'intervention a-t-elle été faite ? Voyant AdBlue déjà allumé ?',
    ],
  },
  {
    id: 'renault-h5ht-13tce',
    label: '1.3 TCe 100 à 160 (H5Ht) / Mercedes M282',
    match: [
      { brands: RENAULT, fuel: 'essence', yearFrom: 2018, yearTo: null, text: /\b1[.,]3 ?tce\b|\bh5ht\b|\b1332 ?(cm3?)?\b|\btce ?(140|150|155|160)\b|\bmild hybrid (140|160)\b/ },
      // 2018 : TCe 115/130 encore H5Ft sur certaines versions, d'où 2019
      { brands: RENAULT, fuel: 'essence', yearFrom: 2019, yearTo: null, text: /\btce ?(115|130)\b/ },
      // années À valider (liaison W177/W247 ↔ M282 : autocopilot + fiches-auto)
      { brands: MB, fuel: 'essence', yearFrom: 2018, yearTo: null, text: /\bm ?282\b|\b1332 ?(cm3?)?\b|\b[ab] ?(180|200)\b/ },
    ],
    distribution: {
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2906-fiabilite-des-13-tce.php (commercial) + https://autocopilot.fr/motorisations/1-3-tce-h5ht (commercial)
      type: 'chaine',
      intervalKm: null,
      intervalYears: null,
      solid: true,
    },
    kitCost: null,
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2906-fiabilite-des-13-tce.php (commercial)
      'Injection : pilotage calculateur (reprogrammation), alerte « risque casse moteur », injecteurs fragiles.',
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2906-fiabilite-des-13-tce.php (commercial)
      'Fuite d\'huile au carter de distribution, parfois surconsommation ; culasse corrigée vers 2019.',
      // https://autocopilot.fr/motorisations/1-3-tce-h5ht (commercial)
      'Bobines d\'allumage, encrassement EGR/GPF en usage urbain.',
    ],
    sellerQuestions: [
      'Les mises à jour calculateur et rappels ont-ils été faits (VIN) ? Message « risque casse moteur » déjà affiché ?',
      'Y a-t-il des traces d\'huile sur le carter de distribution ? Le moteur consomme-t-il de l\'huile ?',
    ],
  },
  {
    id: 'renault-d4ft-12tce100',
    label: '1.2 TCe 100 Twingo 2 (D4Ft)',
    // années À valider
    match: [{ brands: ['renault'], fuel: 'essence', yearFrom: 2007, yearTo: 2014, text: /\bd4ft\b|\btwingo\b.*\btce ?100\b/ }],
    distribution: { type: null, intervalKm: null, intervalYears: null, solid: false }, // pas de source (ne pas confondre avec H5Ft à chaîne)
    kitCost: null,
    weakPoints: [],
    sellerQuestions: ['Pouvez-vous fournir le carnet d\'entretien avec les interventions sur la distribution ?'],
  },
  {
    id: 'renault-h5ft-12tce',
    label: '1.2 TCe 115/120/125/130 (H5Ft)',
    match: [
      { brands: RENAULT, fuel: 'essence', yearFrom: 2012, yearTo: 2018, text: /\b1[.,]2 ?(energy )?tce\b|\bh5ft\b|\b(energy )?tce ?(115|118|120|125|130)\b/ },
      { brands: ['renault'], fuel: 'essence', yearFrom: 2016, yearTo: 2018, text: /\bmegane\b.*\btce ?100\b/ },
    ],
    distribution: {
      type: 'chaine', // FA_CHAINE_ESS (commercial) ; ad.fr « Captur TCe 120 à courroie » contradictoire, non retenu
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // FA_MOINS_FIAB (commercial)
      '115 à 130 ch : consommation d\'huile démesurée pouvant détruire le moteur (100 ch épargné).',
    ],
    sellerQuestions: [],
  },
  {
    id: 'renault-h4dt-10tce',
    label: '1.0 TCe 90/100 et ECO-G 100 (H4Dt)',
    match: [
      { brands: RENAULT, fuel: null, yearFrom: 2019, yearTo: null, text: /\b1[.,]0 ?tce\b|\bh4d ?4[78]0\b|\beco-?g\b|\btce ?100\b/ },
      { brands: ['renault'], fuel: null, yearFrom: 2019, yearTo: null, text: /\b(clio (5|v)|captur (2|ii))\b.*\btce ?90\b/ },
      { brands: ['renault'], fuel: null, yearFrom: 2020, yearTo: null, text: /\btce ?90\b/ },
      { brands: ['dacia'], fuel: null, yearFrom: 2020, yearTo: null, text: /\bsandero (3|iii)\b.*\btce ?90\b/ },
      { brands: ['dacia'], fuel: null, yearFrom: 2021, yearTo: null, text: /\btce ?90\b/ },
    ],
    distribution: {
      // chaîne DÉDUITE (aucune source explicite) de FA_CHAINE_ESS (commercial) : « TCe de dernière génération sans courroie ». À valider.
      type: 'chaine',
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2501-fiabilite-du-10-tce-dacia-renault-nissan.php (commercial)
      'Wastegate du turbo qui prend du jeu et fait du bruit (plus remplacé en garantie, note technique 71538).',
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2501-fiabilite-du-10-tce-dacia-renault-nissan.php (commercial)
      'ECO-G 100 (GPL) : hésitations après un démarrage à froid.',
    ],
    sellerQuestions: [
      'Entendez-vous un cliquetis ou sifflement métallique côté turbo à l\'accélération ? Intervention turbo déjà faite ?',
      'ECO-G : le moteur hésite-t-il à froid, l\'entretien GPL est-il suivi ?',
    ],
  },
  {
    id: 'renault-h4bt-09tce',
    label: '0.9 TCe 90 (H4Bt)',
    match: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2261-fiabilite-des-09-tce.php (commercial) : Clio 4, Captur 1 2012-2019 ; Sandero 2 2012-2020
      { brands: ['renault'], fuel: 'essence', yearFrom: 2012, yearTo: 2019, text: /\b0[.,]9 ?tce\b|\bh4bt\b|\b898 ?(cm3?)?\b|\b(energy )?tce ?90\b|\btwingo\b.*\btce ?110\b/ },
      { brands: ['dacia'], fuel: 'essence', yearFrom: 2012, yearTo: 2020, text: /\b0[.,]9 ?tce\b|\b898 ?(cm3?)?\b|\btce ?90\b/ },
      // Smart 453 : années À valider
      { brands: ['smart'], fuel: 'essence', yearFrom: 2014, yearTo: 2020, text: /\b0[.,]9\b|\bturbo 90\b|\b90 ?ch\b/ },
    ],
    distribution: {
      // FA_CHAINE_ESS + https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2261-fiabilite-des-09-tce.php (commercial) ; ad.fr « courroie » contradictoire, non retenu
      type: 'chaine',
      intervalKm: null,
      intervalYears: null,
      solid: true,
    },
    kitCost: null, // idGarages affiche un « kit » pour ce moteur à chaîne : incohérent, non retenu
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2261-fiabilite-des-09-tce.php (commercial)
      'Fuites de liquide de refroidissement au boîtier thermostat (risque joint de culasse si ignoré).',
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2261-fiabilite-des-09-tce.php (commercial)
      'Consommation d\'huile, à-coups, sondes lambda peu durables ; chaîne « parfois défaillante ».',
    ],
    sellerQuestions: [
      'Le liquide de refroidissement baisse-t-il ? Le thermostat a-t-il été changé ?',
      'Faut-il rajouter de l\'huile entre les vidanges ? Bruit de chaîne au démarrage à froid ?',
    ],
  },
  {
    id: 'renault-h4d-10sce',
    label: '1.0 SCe 61 à 75 (H4D)',
    match: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2482-fiabilite-du-10-sce.php (commercial)
      { brands: ['renault'], fuel: 'essence', yearFrom: 2014, yearTo: 2025, text: /\b1[.,]0 ?sce\b|\bsce ?(65|70|73|75)\b/ },
      { brands: ['dacia'], fuel: 'essence', yearFrom: 2016, yearTo: 2025, text: /\b1[.,]0 ?sce\b|\bsce ?(65|73|75)\b/ },
      // Smart 453 2014-2021 ; 2014 partagé avec la 451, d'où « 453 » explicite cette année-là
      { brands: ['smart'], fuel: 'essence', yearFrom: 2014, yearTo: 2021, text: /\b453\b/ },
      { brands: ['smart'], fuel: 'essence', yearFrom: 2015, yearTo: 2021, text: /\b(61|71) ?ch\b|\b1[.,]0 (61|71)\b/ },
    ],
    distribution: {
      type: 'chaine', // FA_CHAINE_ESS (commercial) : « 1.0 SCe (atmosphérique) : chaîne »
      intervalKm: null,
      intervalYears: null,
      solid: true,
    },
    kitCost: null,
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2482-fiabilite-du-10-sce.php (commercial)
      'Bilan plutôt favorable ; signalements : capteurs, embrayage, consommation ou fuite d\'huile, batterie.',
    ],
    sellerQuestions: [
      'Le moteur consomme-t-il de l\'huile entre deux vidanges ?',
      'L\'embrayage d\'origine a-t-il déjà été remplacé ?',
    ],
  },
  {
    id: 'renault-d7f-12-8v',
    label: '1.2 8V 58/60 (D7F)',
    // années À valider
    match: [{ brands: ['renault'], fuel: 'essence', yearFrom: 2007, yearTo: 2012, text: /\b1[.,]2 ?8v\b|\bd7f\b|\b1[.,]2 (58|60)\b/ }],
    distribution: {
      type: 'courroie', // ARGUS_TUTO (forum, source unique)
      intervalKm: [120000, 120000], // ARGUS_TUTO (forum)
      intervalYears: [5, 5], // ARGUS_TUTO (forum)
      solid: false,
    },
    kitCost: null, // pas de source (page idGarages Twingo II en 404)
    weakPoints: [],
    sellerQuestions: ['Avez-vous la facture du dernier kit de distribution (date et km) ?'],
  },
  {
    id: 'renault-d4f-12-16v',
    label: '1.2 16V 75 (D4F)',
    match: [
      // années À valider
      { brands: ['renault'], fuel: 'essence', yearFrom: 2007, yearTo: 2019, text: /\b1[.,]2 ?16v\b|\bd4f\b|\b1[.,]2 75\b/ },
      { brands: ['dacia'], fuel: null, yearFrom: 2012, yearTo: 2016, text: /\b1[.,]2 ?16v\b|\bd4f\b|\b1[.,]2 75\b/ },
    ],
    distribution: {
      // https://www.actu-automobile.com/2021/09/29/le-changement-de-courroie-de-distribution-sur-renault-clio/ (commercial, blog) ;
      // https://www.ad.fr/guides/guide-conseil/la-distribution/chaine-ou-courroie-de-distribution-difference-entre-les-deux (commercial)
      type: 'courroie',
      intervalKm: [120000, 120000], // actu-automobile (commercial) ; blog colombien 60-80 000 km non retenu (hors marché FR)
      intervalYears: [5, 5],
      solid: false,
    },
    // Estimation : https://www.idgarages.com/fr-fr/vehicules/dacia/dacia-sandero-courroie-kit-de-distribution (commercial, 420-430 €) ;
    // https://www.idgarages.com/fr-fr/vehicules/renault/renault-clio-iv-courroie-kit-de-distribution (commercial, 523-552 €)
    kitCost: { min: 420, max: 552 },
    weakPoints: [], // pas de source spécifique
    sellerQuestions: [
      'Le kit de distribution a-t-il été changé ? À quel km, en quelle année, avec la pompe à eau ?',
      'Version GPL : installation d\'origine, avec factures d\'entretien du circuit GPL ?',
    ],
  },
  {
    id: 'renault-h4m-16sce',
    label: '1.6 SCe 115 (H4M)',
    // années À valider ; https://shop.rolling.hu/catalog/SCHAEFFLER/dacia-duster-hs-16-sce-115 (commercial)
    match: [{ brands: ['dacia'], fuel: null, yearFrom: 2018, yearTo: 2020, text: /\b1[.,]6 ?sce\b|\bsce ?115\b|\bh4m\b/ }],
    distribution: { type: null, intervalKm: null, intervalYears: null, solid: false }, // aucune source chaîne/courroie
    kitCost: null,
    weakPoints: [],
    sellerQuestions: ['Pouvez-vous montrer le carnet d\'entretien Dacia complet ?'],
  },
  {
    id: 'renault-k4m-16-16v',
    label: '1.6 16V 105/110 (K4M)',
    match: [
      // années À valider
      { brands: ['renault'], fuel: 'essence', yearFrom: 2008, yearTo: 2012, text: /\b1[.,]6 ?16v\b|\bk4m\b|\b1[.,]6 (100|105|110)\b/ },
      // années À valider
      { brands: ['dacia'], fuel: 'essence', yearFrom: 2010, yearTo: 2017, text: /\b1[.,]6 ?16v\b|\bk4m\b|\b1[.,]6 (105|110)\b/ },
    ],
    distribution: {
      type: 'courroie', // ARGUS_TUTO (forum)
      intervalKm: [80000, 120000], // ARGUS_TUTO (forum) : 120 000 km/5 ans ; 1.6i 105 éthanol 80 000 km/6 ans
      intervalYears: [5, 6],
      solid: false,
    },
    // Estimation : https://www.idgarages.com/fr-fr/vehicules/dacia/dacia-sandero-courroie-kit-de-distribution (commercial, Sandero 1.6 16V)
    kitCost: { min: 535, max: 581 },
    weakPoints: [
      // https://carverif.fr/blogs/fiabilite-voitures/fiabilite-renault-clio-1-6-16v (commercial) + https://www.planeterenault.com/forum/post248651.html (forum) — source faible
      'Bobines d\'allumage (à-coups, perte de puissance). Source faible.',
      // https://www.largus.fr/guide-achat/DACIA_p_6.html (presse) — via résumé de recherche, À valider
      'Dacia : action atelier 2015 pour usure prématurée de la courroie d\'accessoires. À valider.',
    ],
    sellerQuestions: [
      'Quand le kit de distribution a-t-il été changé (km, date) ? Et la courroie d\'accessoires ?',
      'Ratés ou à-coups ? Des bobines ont-elles été remplacées ?',
    ],
  },

  // =========================================================================
  // PSA (Peugeot / Citroën ; Opel Corsa F)
  // =========================================================================
  {
    id: 'psa-dv5-15bluehdi',
    label: '1.5 BlueHDi 100/110/130 (DV5)',
    match: [
      { brands: PSA, fuel: 'diesel', yearFrom: 2018, yearTo: null, text: /\b1[.,]5 ?(blue ?)?hdi\b|\bdv5\b|\bbluehdi ?(110|130)\b/ },
      // BlueHDi 100 existe aussi en 1.6 (DV6) jusqu'en 2019
      { brands: PSA, fuel: 'diesel', yearFrom: 2020, yearTo: null, text: /\bbluehdi ?100\b/ },
      { brands: ['opel'], fuel: 'diesel', yearFrom: 2019, yearTo: null, text: /\b1[.,]5 ?(d|diesel)\b/ },
    ],
    distribution: {
      // CONTRADICTION : https://www.fiches-auto.fr/articles-auto/chiffres-fiabilite-diesel/s-2526-fiabilite-15-bluehdi.php (commercial, courroie + chaîne entre AAC)
      // vs https://autocopilot.fr/motorisations/1-5-bluehdi-dv5 (commercial, « courroie humide », 150 000 km, non confirmé). Type et intervalle non retenus.
      type: null,
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: { min: 1300, max: 1900 }, // https://autocopilot.fr/motorisations/1-5-bluehdi-dv5 (commercial, courroie + pompe à huile, source isolée, À valider)
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/chiffres-fiabilite-diesel/s-2526-fiabilite-15-bluehdi.php (commercial)
      'Chaîne entre arbres à cames fragile : rappel pour passage en chaîne 8 mm (opérations NY5, MXL).',
      // https://www.fiches-auto.fr/articles-auto/nouveautes-automobiles/s-4114-rappel-du-15-bluehdi-encore-un-souci-de-distribution-.php (commercial) + https://lesvoitures.fr/rappel-stellantis-bluehdi-dv5/ (commercial)
      'Rappel 2026 : poulie de pompe à eau qui peut désaligner la courroie (prod. 10/2025-02/2026).',
      // https://www.fiches-auto.fr/articles-auto/chiffres-fiabilite-diesel/s-2526-fiabilite-15-bluehdi.php (commercial)
      'AdBlue fréquent sur les 100 et 130 ch.',
    ],
    sellerQuestions: [
      'Le rappel chaîne d\'arbres à cames (passage en 8 mm) a-t-il été fait ? Preuve ou VIN ?',
      'La courroie de distribution a-t-elle été remplacée, à quel kilométrage ?',
      'Le voyant AdBlue s\'est-il déjà allumé ?',
    ],
  },
  {
    id: 'psa-dw10-20hdi',
    label: '2.0 HDi 136-163 / 2.0 BlueHDi 150-180 (DW10)',
    match: [
      { brands: ['peugeot'], fuel: 'diesel', yearFrom: 2007, yearTo: 2024, text: /\b2[.,]0 ?(blue ?)?hdi\b|\bdw10\b|\b(blue)?hdi ?(136|150|163|180)\b/ },
    ],
    distribution: {
      // ARGUS_TUTO (forum) ; FA_CHAINE_DIE (commercial) : HDi PSA à courroie
      type: 'courroie',
      intervalKm: [150000, 240000], // ARGUS_TUTO (forum) : 110 FAP 150 000 km/10 ans ; 120-163 FAP 240 000 km/10 ans. Aucune source pour le BlueHDi.
      intervalYears: [10, 10],
      solid: false,
    },
    kitCost: null, // pas de source par moteur
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2524-fiabilite-20-hdi.php (commercial)
      '2.0 HDi 136 : EGR et FAP encrassés, turbo, volant bimasse. 150 ch : souvent un galet tendeur bruyant.',
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2523-fiabilite-20-bluehdi.php (commercial)
      'BlueHDi 150 : AdBlue. 180 ch : joints de culasse plus fréquents, EGR. Pompe à eau signalée.',
    ],
    sellerQuestions: [
      'Avez-vous la facture de la courroie et de la pompe à eau ?',
      'Voyant AdBlue ou antipollution déjà allumé ? FAP nettoyé ou remplacé (et additif Eolys refait) ?',
    ],
  },
  {
    id: 'psa-dv6-16bluehdi',
    label: '1.6 BlueHDi 75/100/120 (DV6 Euro 6)',
    match: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2525-fiabilite-16-bluehdi.php (commercial)
      { brands: ['peugeot'], fuel: 'diesel', yearFrom: 2013, yearTo: 2019, text: /\b1[.,]6 ?bluehdi\b|\bbluehdi ?(75|100|120)\b/ },
      { brands: ['citroen'], fuel: 'diesel', yearFrom: 2014, yearTo: 2018, text: /\b1[.,]6 ?bluehdi\b|\bbluehdi ?(75|100)\b/ },
    ],
    distribution: {
      type: 'courroie', // https://autocopilot.fr/motorisations/1-6-hdi (commercial, famille DV6)
      intervalKm: null, // aucune source spécifique au BlueHDi
      intervalYears: null,
      solid: false,
    },
    kitCost: { min: 400, max: 700 }, // https://autocopilot.fr/motorisations/1-6-hdi (commercial, famille DV6)
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2525-fiabilite-16-bluehdi.php (commercial)
      'Système AdBlue (réservoir, injecteur, capteur) : 1er poste de pannes. 100 ch jugé très fiable hors AdBlue.',
    ],
    sellerQuestions: [
      'Voyant AdBlue ou « défaut antipollution » déjà allumé ? Réservoir ou pompe AdBlue remplacés ?',
      'Avez-vous la facture de la distribution ou l\'historique d\'entretien complet ?',
    ],
  },
  {
    id: 'psa-dv6-16hdi',
    label: '1.6 HDi / e-HDi 90-115 (DV6)',
    match: [
      { brands: ['peugeot'], fuel: 'diesel', yearFrom: 2004, yearTo: 2015, text: /\b1[.,]6 ?e?-?hdi\b|\be-?hdi ?(90|92|110|112|114|115)\b|\bdv6/ },
      { brands: ['citroen'], fuel: 'diesel', yearFrom: 2009, yearTo: 2016, text: /\b1[.,]6 ?e?-?hdi\b|\be-?hdi ?(90|92|110|112|115)\b|\bdv6/ },
    ],
    distribution: {
      // FA_CHAINE_DIE (commercial) : courroie (+ chaîne entre AAC sur les 16 soupapes)
      type: 'courroie',
      // https://autocopilot.fr/motorisations/1-6-hdi (commercial) : 120 000 km/8 ans ; ARGUS_TUTO (forum) : 160 000 ou 240 000 km/10 ans selon version
      intervalKm: [120000, 240000],
      intervalYears: [8, 10],
      solid: true,
    },
    // Estimation : https://autocopilot.fr/motorisations/1-6-hdi (commercial, 400-700 €) ;
    // https://www.idgarages.com/fr-fr/vehicules/peugeot/peugeot-308-courroie-kit-de-distribution (commercial, 480-555 €)
    kitCost: { min: 400, max: 700 },
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/chiffres-fiabilite-diesel/s-2522-fiabilite-16-hdi.php (commercial) + https://autocopilot.fr/motorisations/1-6-hdi (commercial)
      'Joints d\'injecteurs qui fuient : calamine dans l\'huile, crépine bouchée, turbo détruit.',
      // https://www.largus.fr/actualite-automobile/courroie-de-distribution-des-ennuis-a-la-chaine-3823379_p_2.html (presse, 2014)
      'Courroie fragile sur 112/115 ch (DV6C) produits 10/2010-09/2011 : prise en charge étendue 10 ans / 240 000 km.',
      // https://www.fiches-auto.fr/articles-auto/chiffres-fiabilite-diesel/s-2522-fiabilite-16-hdi.php (commercial)
      '110 ch : volant bimasse, EGR encrassée, galet tendeur bruyant.',
    ],
    sellerQuestions: [
      'Facture de la courroie (km et date) ? Pour un 112/115 ch de 2010-2011, la campagne PSA a-t-elle été faite ?',
      'Les joints d\'injecteurs ont-ils été changés ? Odeur de gasoil ou claquement côté injecteurs ?',
      'Le turbo a-t-il été remplacé ? Si oui, crépine et circuit d\'huile nettoyés ?',
    ],
  },
  {
    id: 'psa-dv4-14hdi',
    label: '1.4 HDi 68/70 (DV4)',
    match: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2447-fiabilite-du-14-hdi.php (commercial)
      { brands: ['peugeot'], fuel: 'diesel', yearFrom: 2001, yearTo: 2019, text: /\b1[.,]4 ?hdi\b|\bhdi ?(68|70)\b|\bdv4/ },
      { brands: ['citroen'], fuel: 'diesel', yearFrom: 2009, yearTo: 2016, text: /\b1[.,]4 ?hdi\b|\bhdi ?(68|70)\b|\bdv4/ },
    ],
    distribution: {
      type: 'courroie', // FA_CHAINE_DIE (commercial)
      intervalKm: [240000, 240000], // ARGUS_TUTO (forum, seule source chiffrée) : très long, À valider absolument
      intervalYears: [10, 10],
      solid: false,
    },
    kitCost: { min: 507, max: 651 }, // https://www.idgarages.com/fr-fr/vehicules/peugeot/peugeot-207-courroie-kit-de-distribution (commercial, 207 1.4 HDi 70)
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2447-fiabilite-du-14-hdi.php (commercial)
      'Injecteurs et joints sur les premières années (époque 207), réglé à partir de la 208.',
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2447-fiabilite-du-14-hdi.php (commercial)
      'Vanne EGR : blocage possible en usage urbain.',
    ],
    sellerQuestions: [
      'La courroie a-t-elle déjà été changée ? Au-delà de 10 ans, elle est à faire même à faible km.',
      'Injecteurs ou joints remplacés ? Odeur de gasoil ou claquement au ralenti ?',
    ],
  },
  {
    id: 'psa-ep-vti-thp',
    label: '1.4 / 1.6 VTi et 1.6 THP (EP « Prince »)',
    match: [{ brands: PSA, fuel: 'essence', yearFrom: null, yearTo: null, text: /\b1[.,][46] ?(16v )?vti\b|\bthp\b|\bvti ?(95|120)\b|\b1[.,]6 ?puretech\b/ }],
    distribution: {
      type: 'chaine', // FA_CHAINE_ESS (commercial) : VTi/THP 1.4 et 1.6 à chaîne, problèmes de chaîne sur le 1.6
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // FA_MOINS_FIAB (commercial)
      '1.6 THP : tendeur de chaîne défaillant, fuites d\'huile, refroidissement.',
      // FA_MOINS_FIAB (commercial)
      '1.4 et 1.6 VTi : pompe à eau et consommation d\'huile.',
    ],
    sellerQuestions: [],
  },
  {
    id: 'psa-eb-puretech-136-chaine',
    label: '1.2 PureTech 136 à chaîne (2023+)',
    match: [{ brands: [...PSA, 'opel'], fuel: null, yearFrom: 2023, yearTo: null, text: /\bpuretech ?136\b/ }],
    distribution: {
      type: 'chaine', // FA_CHAINE_ESS (commercial) : chaîne sur le 1.2 PureTech 136 à partir de 2023
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [],
    sellerQuestions: [],
  },
  {
    id: 'psa-eb-puretech-12',
    label: '1.0 / 1.2 VTi et PureTech 68 à 130 (EB), avant 2023',
    match: [
      { brands: PSA, fuel: 'essence', yearFrom: null, yearTo: 2022, text: /\bpuretech\b|\b1[.,][02] ?vti\b|\beb[02]/ },
      // Corsa F (2019+) : années du tableau de correspondance de la recherche
      { brands: ['opel'], fuel: 'essence', yearFrom: 2019, yearTo: 2022, text: /\bpuretech\b|\b1[.,]2 (turbo )?(75|100|130)\b/ },
    ],
    distribution: {
      type: 'courroie-humide', // FA_CHAINE_ESS (commercial) : courroie en bain d'huile avant 2023
      // https://blog.piecesetpneus.com/?p=164887 (commercial, source isolée) : 180 000 km/10 ans à l'origine, puis 100 000 km/6 ans
      intervalKm: [100000, 180000],
      intervalYears: [6, 10],
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // FA_MOINS_FIAB (commercial)
      'Courroie attaquée chimiquement qui se désagrège dans le circuit d\'huile (110 et 130 ch).',
    ],
    sellerQuestions: [],
  },
  {
    id: 'psa-tu-essence',
    label: '1.1 / 1.4 / 1.6 16V essence (TU)',
    match: [
      { brands: ['peugeot'], fuel: 'essence', yearFrom: 1998, yearTo: 2012, text: /\b1[.,]1\b|\b1[.,]4 ?(i|16v)\b|\b1[.,]4 (75|90)\b|\b1[.,]6 ?16v\b|\b1[.,]4 gpl\b/ },
      // À valider
      { brands: ['citroen'], fuel: 'essence', yearFrom: 2009, yearTo: 2013, text: /\b1[.,]1 ?i?\b|\b1[.,]4 ?i? ?73\b|\b1[.,]4i\b/ },
    ],
    distribution: {
      type: 'courroie', // ARGUS_TUTO (forum)
      // ARGUS_TUTO (forum) 120 000 km/5 ans ; https://www.ad.fr/guides/guide-conseil/distribution/courroie-de-distribution-206-quand-la-changer-et-a-quel-prix (commercial) 120 000/10 ans ;
      // https://www.ad.fr/guides/guide-conseil/distribution/courroie-de-distribution-207-quand-la-changer-et-a-quel-prix (commercial) 150 000/7 ans ;
      // https://www.forum-peugeot.com/Forum/threads/courroie-de-distribution-206-80000-ou-120000-kms.42328/latest (forum) usage intensif 80 000/5 ans
      intervalKm: [80000, 150000],
      intervalYears: [5, 10],
      solid: false,
    },
    kitCost: { min: 362, max: 434 }, // https://www.idgarages.com/fr-fr/vehicules/peugeot/peugeot-207-courroie-kit-de-distribution (commercial, 207 1.4i)
    weakPoints: [],
    sellerQuestions: [
      'Quand la courroie a-t-elle été changée (km, année) ? Au-delà de 5 à 10 ans sans facture, à prévoir.',
      'Version GPL : installation homologuée, avec factures d\'entretien ?',
    ],
  },

  // =========================================================================
  // VOLKSWAGEN / AUDI
  // =========================================================================
  {
    id: 'vag-ea211-tsi-mpi',
    label: '1.0 MPI / 1.0-1.5 TSI (EA211)',
    match: [
      // Frontière EA111 → EA211 en 2012-2013 : FA_CHAINE_ESS (commercial). Golf 7 = EA211 dès 2012.
      { brands: VW, fuel: 'essence', yearFrom: 2012, yearTo: null, text: /\b1[.,][05] ?(e?tsi|mpi)\b|\betsi\b|\bmpi ?(60|65|75|80)\b|\btsi ?(95|115)\b|\bgolf (7|vii)\b.*\b1[.,][24] ?tsi\b/ },
      { brands: VW, fuel: 'essence', yearFrom: 2013, yearTo: null, text: /\b1[.,][24] ?tsi\b/ },
      { brands: AUDI, fuel: 'essence', yearFrom: 2012, yearTo: 2020, text: /\b1[.,][05] ?tfsi\b|\b(30|35) tfsi\b|\ba3 8v\b.*\b1[.,][24] ?tfsi\b/ },
      { brands: AUDI, fuel: 'essence', yearFrom: 2013, yearTo: 2020, text: /\b1[.,][24] ?tfsi\b/ },
    ],
    distribution: {
      // https://autocopilot.fr/motorisations/1-4-tfsi-ea211 (commercial) + https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-3087-fiabilite-du-10-tsi-25-30-tfsi.php (commercial)
      type: 'courroie',
      // autocopilot (commercial) 120 000 km/6 ans ; https://forum-auto.matmut.fr/forum/VOLKSWAGEN/T-CROSS/CHANGEMENT-COURROIE-DE-DISTRIBUTION/5620236/592238 (forum) contrôle vers 210 000 km ;
      // https://www.autocentrum.pl/publikacje/porady/encyklopedia-silnikow-volkswagen-1-4-tsi-ea211-benzynowy/ (commercial, Pologne) 210 000 km, mécaniciens 5 ans
      intervalKm: [120000, 210000],
      intervalYears: [5, 6],
      solid: true,
    },
    // Estimation : https://autocopilot.fr/motorisations/1-4-tfsi-ea211 (commercial, 350-650 €) ;
    // https://www.idgarages.com/fr-fr/vehicules/volkswagen/volkswagen-golf-7-courroie-kit-de-distribution (commercial, 673-773 €)
    kitCost: { min: 350, max: 773 },
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-3087-fiabilite-du-10-tsi-25-30-tfsi.php (commercial)
      '1.0 TSI : consommation d\'huile (110/115 ch) ; pompe d\'injection et injecteurs sur le 95 ch.',
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2288-fiabilite-des-12-tsi-tfsi.php (commercial)
      '1.2 TSI 2014-2015 : rappel pour vis de levée variable qui se desserre (fuite d\'huile, casse).',
      // https://autocopilot.fr/motorisations/1-4-tfsi-ea211 (commercial) + https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-2829-fiabilite-15-tsi-ecotsi-tsi-evo.php (commercial)
      '1.4 TSI ACT : vibrations 1 600-2 000 tr/min, actionneurs ACT ; 1.5 TSI : consommation d\'huile.',
    ],
    sellerQuestions: [
      'Courroie et pompe à eau remplacées ? Sinon, la voiture a-t-elle plus de 6 ans ou 120 000 km ?',
      'Appoint d\'huile entre deux vidanges ? 1.2 TSI 2014-2015 : rappel vis de levée variable fait ?',
      '1.4 TSI ACT : des vibrations vers 1 600-2 000 tr/min ?',
    ],
  },
  {
    id: 'vag-ea111-tsi',
    label: '1.2 / 1.4 TSI-TFSI (EA111), avant 2013',
    match: [
      { brands: VW, fuel: 'essence', yearFrom: 2008, yearTo: 2013, text: /\b1[.,][24] ?tsi\b/ },
      { brands: AUDI, fuel: 'essence', yearFrom: 2007, yearTo: 2012, text: /\b1[.,][24] ?tfsi\b/ },
    ],
    distribution: {
      type: 'chaine', // FA_CHAINE_ESS (commercial) : 1.2 et 1.4 TSI à chaîne jusqu'en 2013
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // FA_MOINS_FIAB (commercial)
      '1.2 TSI 85/105 : tendeur de chaîne qui se détend, risque de casse de chaîne.',
      // FA_MOINS_FIAB (commercial)
      '1.4 TSI 122/140/160 : soucis de distribution jusqu\'en 2012, turbo fragile.',
    ],
    sellerQuestions: [],
  },
  {
    id: 'vag-ea888-tfsi',
    label: '1.8 TFSI / 2.0 TSI-TFSI (EA888)',
    match: [
      { brands: [...VW, ...AUDI], fuel: 'essence', yearFrom: null, yearTo: null, text: /\b(1[.,]8|2[.,]0) ?t?f?si\b|\bgolf\b.*\bgti\b|\bs3\b/ },
    ],
    distribution: {
      // FA_CHAINE_ESS (commercial) : chaîne ou courroie selon marque et année, « généralement chaîne après 2008 » → contradictoire, type non retenu
      type: null,
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // FA_MOINS_FIAB (commercial)
      '1.8 TFSI 1res versions : chaîne, segments, consommation d\'huile, pompe à eau. 2.0 TSI avant 2009 : tendeur de chaîne.',
      // FA_CHAINE_ESS (commercial)
      'Chaîne revue à partir de 2013.',
    ],
    sellerQuestions: ['La chaîne ou le tendeur ont-ils été remplacés (facture) ? Consommation d\'huile aux 1 000 km ?'],
  },
  {
    id: 'vag-ea111-12-12v',
    label: '1.2 60/70 3 cylindres (EA111)',
    // codes et années : https://www.ebay.de/itm/357119250890 (commercial), À valider
    match: [{ brands: VW, fuel: 'essence', yearFrom: 2009, yearTo: 2014, text: /\b1[.,]2 ?12v\b|\bcgp[ab]\b|\b1[.,]2 (60|70)\b/ }],
    distribution: {
      type: 'chaine', // FA_CHAINE_ESS (commercial) : le 1.2 sans « TSI » avait aussi une chaîne
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [],
    sellerQuestions: ['Bruit de chaîne au démarrage à froid ? La chaîne a-t-elle déjà été remplacée ?'],
  },
  {
    id: 'vag-16-mpi',
    label: '1.6 102 essence atmosphérique',
    match: [
      // années : tableau de correspondance de la recherche (A3 8P 2003-2012, Golf 6 2008-2012, À valider)
      { brands: AUDI, fuel: 'essence', yearFrom: 2003, yearTo: 2012, text: /\b1[.,]6 (mpi )?(100|102)\b/ },
      { brands: VW, fuel: 'essence', yearFrom: 2008, yearTo: 2012, text: /\b1[.,]6 (mpi )?102\b/ },
    ],
    // type seulement déduit d'un prix de kit idGarages (base jugée peu fiable pour le type) → non retenu
    distribution: { type: null, intervalKm: null, intervalYears: null, solid: false },
    kitCost: { min: 438, max: 457 }, // https://www.idgarages.com/fr-fr/vehicules/audi/audi-a3-courroie-kit-de-distribution (commercial, A3 1.6 100 ch)
    weakPoints: [],
    sellerQuestions: ['Avez-vous la facture du dernier kit de distribution ?'],
  },
  {
    id: 'vag-20tdi-cr',
    label: '2.0 TDI common rail 110-200 (EA189 / EA288)',
    match: [
      { brands: VW, fuel: 'diesel', yearFrom: 2008, yearTo: null, text: /\b2[.,]0 ?tdi\b|\btdi ?(136|140|143|150|170|184|200)\b|\bgtd\b/ },
      { brands: AUDI, fuel: 'diesel', yearFrom: 2008, yearTo: 2020, text: /\b2[.,]0 ?tdi\b|\btdi ?(136|140|143|150|170|184)\b/ },
    ],
    distribution: {
      // https://autocopilot.fr/motorisations/2-0-tdi-ea288 (commercial) ; FA_CHAINE_DIE (commercial) : TDI à courroie
      type: 'courroie',
      // autocopilot EA288 (commercial) 120 000 km/5 ans ; https://www.ad.fr/guides/guide-conseil/distribution/courroie-de-distribution-golf-7-quand-la-changer-et-a-quel-prix (commercial) 210 000 km/7 ans ;
      // https://mecazen.fr/carnet-entretien-auto/volkswagen/golf-7-break/probleme-de-courroie-distribution (commercial) 210 000 km/14 ans ; ARGUS_TUTO (forum) 2.0 TDI 140 180 000 km
      intervalKm: [120000, 210000],
      intervalYears: [5, 14],
      solid: true,
    },
    // Estimation : https://www.idgarages.com/fr-fr/vehicules/audi/audi-a3-courroie-kit-de-distribution (commercial, 659-833 €) ;
    // https://www.idgarages.com/fr-fr/vehicules/volkswagen/volkswagen-golf-7-courroie-kit-de-distribution (commercial, 815-867 €) ;
    // https://autocopilot.fr/motorisations/2-0-tdi-ea288 (commercial, 900-1 800 €)
    kitCost: { min: 659, max: 1800 },
    weakPoints: [
      // https://autocopilot.fr/motorisations/2-0-tdi-ea189 (commercial)
      'EA189 : rappel Dieselgate à vérifier ; pompe HP CP4 souvent défaillante après 150 000 km.',
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2438-fiabilite-du-20-tdi.php (commercial)
      '170 ch : limaille de pompe ; 150 ch : consommation d\'huile, perte de liquide ; 184 ch : pompe à eau.',
      // https://autocopilot.fr/motorisations/2-0-tdi-ea288 (commercial)
      'EA288 : capteur NOx, module AdBlue, CP4 (code P0087).',
    ],
    sellerQuestions: [
      'EA189 (2008-2015) : mise à jour Dieselgate faite ? Avez-vous la preuve ?',
      'Facture de la courroie et de la pompe à eau ? Le liquide de refroidissement baisse-t-il ?',
      'Le voyant AdBlue ou moteur s\'est-il allumé récemment ?',
    ],
  },
  {
    id: 'vag-16tdi-cr',
    label: '1.6 TDI common rail 75 à 120 (EA189 / EA288)',
    match: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2439-fiabilite-du-16-tdi.php (commercial) + https://autocopilot.fr/motorisations/1-6-tdi-cr (commercial)
      { brands: VW, fuel: 'diesel', yearFrom: 2009, yearTo: 2021, text: /\b1[.,]6 ?tdi\b|\btdi ?(75|80|90|95|105|110|115|116)\b/ },
      { brands: AUDI, fuel: 'diesel', yearFrom: 2009, yearTo: 2020, text: /\b1[.,]6 ?tdi\b|\btdi ?(105|110|116)\b/ },
    ],
    distribution: {
      type: 'courroie', // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2439-fiabilite-du-16-tdi.php (commercial) : courroie sur toutes les générations
      // Valeurs citées mais non retenues par la recherche : 210 000 km avec 7 ou 14 ans (ad.fr, mecazen, commercial). À valider.
      intervalKm: null,
      intervalYears: null,
      solid: true,
    },
    kitCost: null, // une seule donnée idGarages (694 €), insuffisant pour une fourchette
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2439-fiabilite-du-16-tdi.php (commercial)
      'Injecteurs très fragiles, EGR et refroidisseur EGR, FAP colmaté.',
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2439-fiabilite-du-16-tdi.php (commercial)
      'Pompe à eau qui fuit souvent, ce qui peut avancer le changement de courroie.',
      // https://autocopilot.fr/motorisations/1-6-tdi-cr (commercial)
      'EA189 2009-2014 : Dieselgate, vérifier le rappel.',
    ],
    sellerQuestions: [
      'La mise à jour Dieselgate (EA189) a-t-elle été faite ? Justificatif ?',
      'Courroie et pompe à eau changées ? Fuites de liquide de refroidissement ?',
      'Injecteurs testés ou remplacés ? À-coups ou démarrage difficile à chaud ?',
    ],
  },
  {
    id: 'vag-12tdi',
    label: '1.2 TDI 75 3 cylindres',
    // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2437-fiabilite-du-12-tdi.php (commercial) ; fin de production À valider
    match: [{ brands: VW, fuel: 'diesel', yearFrom: 2009, yearTo: 2014, text: /\b1[.,]2 ?tdi\b/ }],
    distribution: {
      type: 'courroie', // FA_CHAINE_DIE (commercial) : règle « TDI à courroie » qui ne cite pas explicitement le 1.2, À valider
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2437-fiabilite-du-12-tdi.php (commercial)
      'Vanne EGR qui s\'encrasse et se bloque, FAP colmaté, fuites de pompe à eau.',
    ],
    sellerQuestions: [
      'Vanne EGR ou FAP nettoyés ou remplacés ? Usage surtout urbain ?',
      'Avez-vous la facture de la distribution ?',
    ],
  },
  {
    id: 'vag-19tdi-pd',
    label: '1.9 TDI 105 (injecteur-pompe)',
    // fin de commercialisation À valider
    match: [{ brands: AUDI, fuel: 'diesel', yearFrom: 2003, yearTo: 2010, text: /\b1[.,]9 ?tdi\b/ }],
    distribution: {
      type: 'courroie', // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2436-fiabilite-des-19-tdi.php (commercial)
      // fiches-auto (commercial) ~90 000 km/5 ans ; ARGUS_TUTO (forum) 90 000-120 000 km selon version
      intervalKm: [90000, 120000],
      intervalYears: [5, 5],
      solid: true,
    },
    kitCost: { min: 540, max: 563 }, // https://www.idgarages.com/fr-fr/vehicules/audi/audi-a3-courroie-kit-de-distribution (commercial, A3 1.9 TDI 105)
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-2436-fiabilite-des-19-tdi.php (commercial)
      '105 ch : coussinets de bielle, volant bimasse ; débitmètre, sondes, turbo, EGR.',
    ],
    sellerQuestions: [
      'Facture du dernier kit de distribution (moins de 90 000 km et moins de 5 ans) ?',
      'Bruit de cognement (bielles) ? Embrayage et volant moteur refaits ?',
    ],
  },

  // =========================================================================
  // TOYOTA
  // =========================================================================
  {
    id: 'toyota-hsd-15-hybrid',
    label: 'Yaris hybride 1.5 (HSD 100h / Hybrid 116h)',
    match: [
      // https://autocopilot.fr/motorisations/toyota-hsd-hybrid (commercial) : Yaris III 2012-2019, Yaris IV 2020+
      { brands: ['toyota'], fuel: 'hybride', yearFrom: 2012, yearTo: 2019, text: /^(?=.*\byaris\b)(?=.*\b(hybride?|hsd|100h)\b)/ },
      { brands: ['toyota'], fuel: 'hybride', yearFrom: 2020, yearTo: null, text: /^(?=.*\byaris\b)(?=.*\b(hybride?|hsd|116h|130h)\b)/ },
    ],
    distribution: {
      // FA_CHAINE_ESS (commercial) : « tous les blocs hybrides » à chaîne ; https://autocopilot.fr/motorisations/toyota-hsd-hybrid (commercial)
      type: 'chaine',
      intervalKm: null,
      intervalYears: null,
      solid: true,
    },
    kitCost: null,
    weakPoints: [
      // https://autocopilot.fr/motorisations/toyota-hsd-hybrid (commercial)
      'Vieillissement de la batterie HV NiMH (200 000-300 000 km), pompe à eau électrique, onduleur (rare).',
      // https://autocopilot.fr/motorisations/toyota-hsd-hybrid (commercial)
      'Disques arrière corrodés sur voitures peu roulées.',
      // https://autocopilot.fr/motorisations/toyota-hsd-hybrid (commercial) — À valider sur toyota.fr
      'Garantie batterie 8 ans / 160 000 km sur modèles récents (selon site commercial, À valider).',
    ],
    sellerQuestions: [
      'Avez-vous un bilan de santé de la batterie hybride ? Entretien fait dans le réseau Toyota ?',
      'Le message « Check Hybrid System » s\'est-il déjà affiché ?',
    ],
  },
  {
    id: 'toyota-1nd-14d4d',
    label: '1.4 D-4D 90 (1ND)',
    // Wikipedia ne cite que la Yaris XP10 : À valider
    match: [{ brands: ['toyota'], fuel: 'diesel', yearFrom: 2005, yearTo: 2017, text: /\b1[.,]4 ?d-?4d\b|\bd-?4d ?90\b|\b1nd\b/ }],
    distribution: {
      // CONTRADICTION : https://en.wikipedia.org/wiki/Toyota_ND_engine (encyclopédie, chaîne)
      // vs https://www.goodmecano.com/reparation-automobile-par-marque/toyota/yaris/remplacement-kit-distribution-27 (commercial, « kit distribution »)
      type: null,
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [],
    sellerQuestions: ['Le carnet mentionne-t-il un remplacement de distribution ?'],
  },
  {
    id: 'toyota-13-vvti',
    label: '1.3 / 1.33 VVT-i',
    match: [{ brands: ['toyota'], fuel: 'essence', yearFrom: 2005, yearTo: 2017, text: /\b1[.,]33?\b|\b(2sz|1nr)\b/ }],
    distribution: {
      type: 'chaine', // FA_CHAINE_ESS (commercial) : Toyota 1.3 (Yaris) à chaîne
      intervalKm: null,
      intervalYears: null,
      solid: true,
    },
    kitCost: null,
    weakPoints: [],
    sellerQuestions: ['Pouvez-vous montrer le carnet d\'entretien (vidanges régulières) ?'],
  },
  {
    id: 'toyota-1kr-10vvti',
    label: '1.0 VVT-i 68 à 72 (1KR)',
    match: [{ brands: ['toyota'], fuel: 'essence', yearFrom: 2005, yearTo: null, text: /\b1[.,]0\b|\b1kr\b|\b998 ?(cm3?)?\b/ }],
    distribution: {
      type: 'chaine', // FA_CHAINE_ESS (commercial) : Toyota 1.0 (Aygo/IQ) à chaîne
      intervalKm: null,
      intervalYears: null,
      solid: true,
    },
    kitCost: null,
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-essence/s-3025-fiabilite-10-vti-10-vvt-i-peugeot-citroen-toyota.php (commercial ; page sur 107/C1, Yaris non citée)
      'Consommation d\'huile (casse si pas d\'appoint), pompe à eau fragile, embrayage qui s\'use vite.',
    ],
    sellerQuestions: [
      'Faut-il rajouter de l\'huile entre les vidanges, et combien ?',
      'La pompe à eau ou l\'embrayage ont-ils déjà été changés ?',
    ],
  },

  // =========================================================================
  // MERCEDES (OM607/OM608 → renault-k9k-15dci ; M282 → renault-h5ht-13tce)
  // =========================================================================
  {
    id: 'mb-om654',
    label: 'Mercedes 2.0 d (OM654)',
    // https://autocopilot.fr/motorisations/om654 (commercial)
    match: [{ brands: MB, fuel: 'diesel', yearFrom: 2019, yearTo: null, text: /\b[ab] ?(200|220) ?d\b|\bom ?654\b|\b1950 ?(cm3?)?\b/ }],
    distribution: {
      type: 'chaine', // https://autocopilot.fr/motorisations/om654 (commercial) : chaîne côté volant moteur
      intervalKm: null,
      intervalYears: null,
      solid: true,
    },
    // Intervention curative chaîne (dépose moteur) 2 500-7 000 € selon https://autocopilot.fr/motorisations/om654 (commercial) : pas un entretien périodique, non mis en kitCost
    kitCost: null,
    weakPoints: [
      // https://www.largus.fr/actualite-automobile/fiabilite-mercedes-20-diesel-om654-usure-des-culbuteurs-10556402.html (presse) + autocopilot (commercial)
      'Usure des culbuteurs à rouleau (ralenti instable, « tac-tac »).',
      // https://autocopilot.fr/motorisations/om654 (commercial)
      'Capteurs NOx, pompe AdBlue, FAP en usage urbain.',
    ],
    sellerQuestions: [
      '« Tac-tac » à chaud ou ralenti instable ? Culbuteurs remplacés ?',
      'Le voyant AdBlue ou moteur s\'est-il allumé ?',
    ],
  },
  {
    id: 'mb-om651',
    label: 'Mercedes 1.8 / 2.1 CDI (OM651)',
    // https://autocopilot.fr/motorisations/mercedes-om651 (commercial)
    match: [{ brands: MB, fuel: 'diesel', yearFrom: 2012, yearTo: 2018, text: /\b[ab] ?(200|220) ?(cdi|d)\b|\bom ?651\b|\b(2143|1796) ?(cm3?)?\b/ }],
    distribution: {
      type: 'chaine', // FA_CHAINE_DIE (commercial) + https://autocopilot.fr/motorisations/mercedes-om651 (commercial)
      intervalKm: null, // autocopilot : durée de vie typique 250 000-400 000 km après 2014, pas un intervalle constructeur
      intervalYears: null,
      solid: true,
    },
    // Remplacement curatif de chaîne 2 000-3 500 € selon https://autocopilot.fr/motorisations/mercedes-om651 (commercial) : pas un entretien périodique, non mis en kitCost
    kitCost: null,
    weakPoints: [
      // https://autocopilot.fr/motorisations/mercedes-om651 (commercial)
      'Allongement de chaîne (2008-2013) : cliquetis au ralenti à froid.',
      // https://autocopilot.fr/motorisations/mercedes-om651 (commercial)
      'Injecteurs piézo Delphi qui grippent.',
    ],
    sellerQuestions: [
      'Cliquetis au démarrage à froid ? Chaîne ou tendeurs remplacés ?',
      'Rappels injecteurs faits (VIN) ? Vidanges tous les 15 000 km au plus ?',
    ],
  },
  {
    id: 'mb-m270',
    label: 'Mercedes 1.6 essence 122/156 (M270)',
    match: [
      // puissances et années À valider
      { brands: MB, fuel: 'essence', yearFrom: 2012, yearTo: 2018, text: /\bm ?270\b|\b1595 ?(cm3?)?\b|\b[ab] ?(180|200)\b.*\b(122|156)\b/ },
      // 2018 laissé à la M282 (renault-h5ht-13tce) faute de puissance dans l'annonce
      { brands: MB, fuel: 'essence', yearFrom: 2012, yearTo: 2017, text: /\b[ab] ?(180|200)\b/ },
    ],
    distribution: {
      // https://www.forum-mercedes.com/topic-101758-distribution-w176-classe-a.html (forum) + FA_CHAINE_ESS (commercial) ; ad.fr « A 200 à courroie » non retenu
      type: 'chaine',
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // https://forums.mbclub.co.uk/threads/m274-engine.302726/post-3426715 (forum anglophone, À valider)
      'Claquement à froid des actionneurs d\'arbre à cames vers 100 000 km (pièces modifiées en 2014). À valider.',
    ],
    sellerQuestions: [
      'Claquement quelques secondes au démarrage à froid ?',
      'Boîte 7G-DCT : vidange faite, à-coups ?',
    ],
  },

  // =========================================================================
  // OPEL (Corsa F : PureTech et DV5, voir PSA)
  // =========================================================================
  {
    id: 'opel-13cdti',
    label: '1.3 CDTI 75/90/95',
    // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-3996-fiabilite-du-moteur-13-cdti-opel.php (commercial)
    match: [{ brands: ['opel'], fuel: 'diesel', yearFrom: 2006, yearTo: 2019, text: /\b1[.,]3 ?cdti\b|\bcdti ?(75|90|95)\b/ }],
    distribution: {
      type: 'chaine', // FA_CHAINE_DIE (commercial) + fiches-auto s-3996 (commercial)
      intervalKm: null,
      intervalYears: null,
      solid: true,
    },
    kitCost: null,
    weakPoints: [
      // https://www.fiches-auto.fr/articles-auto/fiabilite-moteurs-diesel/s-3996-fiabilite-du-moteur-13-cdti-opel.php (commercial)
      'Chaîne : bruits, tendeurs fatigués, ruptures (surtout 75 et 90 ch ; 95 ch mieux maîtrisé).',
      // https://autocopilot.fr/motorisations/1-3-multijet-fiat (commercial)
      'Turbo, FAP et EGR en usage urbain.',
    ],
    sellerQuestions: [
      'La chaîne a-t-elle été remplacée ? Bruit de chaîne au démarrage ?',
      'Le turbo ou le FAP ont-ils déjà été changés ?',
    ],
  },
  {
    id: 'opel-17cdti',
    label: '1.7 CDTI (Isuzu)',
    match: [{ brands: ['opel'], fuel: 'diesel', yearFrom: null, yearTo: null, text: /\b1[.,]7 ?cdti\b/ }],
    distribution: {
      type: 'courroie', // ARGUS_TUTO (forum, source unique)
      intervalKm: [100000, 100000], // ARGUS_TUTO (forum) : valeur de la version « 1.7 CDTI 100 » ; 125/130 Corsa D À valider
      intervalYears: [10, 10],
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // https://www.largus.fr/actualite-automobile/courroie-de-distribution-des-ennuis-a-la-chaine-3823379_p_2.html (presse)
      'Casses de courroie signalées jusqu\'en décembre 2004.',
    ],
    sellerQuestions: ['Avez-vous la facture de la distribution ?'],
  },
  {
    id: 'opel-10-turbo',
    label: '1.0 Turbo 90/115 3 cylindres',
    match: [{ brands: ['opel'], fuel: 'essence', yearFrom: 2014, yearTo: 2019, text: /\b1[.,]0 ?(ecotec )?turbo\b|\bb10xf[tl]\b|\b1[.,]0 (90|115)\b/ }],
    distribution: { type: null, intervalKm: null, intervalYears: null, solid: false }, // pas de source fiable (catalogues d'outillage seulement)
    kitCost: null,
    weakPoints: [],
    sellerQuestions: ['Pouvez-vous fournir le carnet d\'entretien Opel complet ?'],
  },
  {
    id: 'opel-twinport-essence',
    label: '1.0 / 1.2 / 1.4 essence atmosphérique (Twinport / Ecotec)',
    match: [{ brands: ['opel'], fuel: 'essence', yearFrom: 2006, yearTo: 2019, text: /\btwinport\b|\b1[.,][024]\b(?! ?turbo)/ }],
    distribution: {
      type: 'chaine', // FA_CHAINE_ESS (commercial) : Opel 1.0 et 1.2 (2005-2015) et 1.4 90/140 à chaîne
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // FA_CHAINE_ESS (commercial)
      '1.0 : nombreux problèmes de tendeur de chaîne.',
    ],
    sellerQuestions: ['Bruit de chaîne au démarrage à froid ? Chaîne ou tendeur changés ?'],
  },

  // =========================================================================
  // SMART (453 : moteurs Renault, voir renault-h4d-10sce et renault-h4bt-09tce)
  // =========================================================================
  {
    id: 'smart-451-10',
    label: 'Smart fortwo 451 1.0 (3B21)',
    // années À valider
    match: [{ brands: ['smart'], fuel: 'essence', yearFrom: 2007, yearTo: 2014, text: /\bmhd\b|\b451\b|\b1[.,]0 ?(61|71|84)?\b|\b(61|71|84) ?ch\b|\bbrabus\b|\b3b21\b/ }],
    distribution: {
      // FA_CHAINE_ESS (commercial) + https://www.ad.fr/guides/guide-conseil/distribution/courroie-de-distribution-smart-fortwo (commercial)
      type: 'chaine',
      intervalKm: null,
      intervalYears: null,
      solid: false,
    },
    kitCost: null,
    weakPoints: [
      // https://carverif.fr/blogs/fiabilite-voitures/fiabilite-smart-fortwo-1-0-71ch (commercial, site peu fiable)
      'Boîte robotisée Softouch (embrayage) ; arrêts moteur intempestifs sur premières MHD. Source faible.',
    ],
    sellerQuestions: [
      'Embrayage ou actionneur de boîte remplacés ? Passages de rapport francs ?',
      'MHD : le moteur cale-t-il ou peine-t-il à redémarrer en Stop & Start ?',
    ],
  },
];
