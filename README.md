# Pépite Radar

Veille, scoring et aide à la décision pour l'**achat-revente** et le **mandat de dépôt-vente** Auto & Moto, segment **1 500 € – 30 000 €**, Bordeaux & région.

Next.js 15 (App Router) · Tailwind CSS · moteur de scoring en JS pur · prêt pour Vercel.

## Démarrage

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # tests du moteur de scoring (node:test)
npm run build      # build de production
```

Déploiement Vercel : importer le repo, aucun réglage requis. Variables optionnelles (voir `.env.example`) :

| Variable | Rôle |
|---|---|
| `APIFY_TOKEN` | token Apify : collecte des annonces LeBonCoin |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | alertes PÉPITE / Mandat avec message prêt à copier |
| `CRON_SECRET` / `INGEST_SECRET` | secrets du cron et du webhook Apify (générés à la création du projet) |
| `DATABASE_URL` | base Neon Postgres (posée par l'intégration Neon du Vercel Marketplace, offre gratuite : 1 Go, 100 CU-heures et 5 Go de transfert par mois, [neon.com/pricing](https://neon.com/pricing)). Vercel Blob n'est plus utilisé : son offre gratuite (2 000 opérations « avancées » par mois, [Vercel](https://vercel.com/docs/vercel-blob/usage-and-pricing)) a été dépassée le 26/10/2026 et bloque le stockage 30 jours |
| `HUNT_TYPES` (`auto` ou `auto,moto`), `HUNT_AREA`, `HUNT_MAX_ITEMS`, `HUNT_MARKET_MAX_ITEMS`, `APIFY_MAX_CHARGE_USD`, `HUNT_SOURCES` | réglages de la chasse (optionnels) |
| `DASHBOARD_PASSWORD` | protège tout le site par mot de passe (identifiant libre) ; `/api/hunt/*` garde ses propres secrets. **Obligatoire en production** : sans lui, le site répond 503 plutôt que d'être ouvert |
| `ANTHROPIC_API_KEY` | active « Affiner avec l'IA » dans l'éditeur de messages |
| `OUTREACH_API_KEY` | clé exigée (en-tête `x-api-key`) pour pousser un payload vers Make |
| `MAKE_WEBHOOK_URL` | URL du webhook Make.com qui reçoit les payloads `dispatch` |

Interface : mode sombre par défaut (bascule clair/sombre mémorisée), responsive mobile et desktop.

## Architecture

```
backend/
  config/rules.js        ← TOUTES les valeurs métier (blacklist, options, leviers, coûts, seuils, mandat)
  utils/scoring.js       ← moteur de scoring & calcul de marge (fonction pure)
  utils/messages.js      ← générateur de scripts : négociation & proposition de mandat
  utils/outreach.js      ← choix de stratégie + payload JSON autonome (Make.com)
  config/sources.js      ← recherches LeBonCoin (fresh / stale / comparables) et garde-fous de coût
  pipeline/              ← chasse automatique : normalisation Apify, cote par comparables, alertes Telegram
  utils/text.js          ← normalisation du texte, détection de mots-clés avec gestion des négations
  utils/scoring.test.js  ← tests des règles
  data/listings.js       ← annonces de démo (une par règle)
app/
  page.tsx               ← dashboard (3 onglets)
  api/listings           ← GET  annonces scorées (?type=auto|moto&status=PEPITE&minDays=15)
  api/score              ← POST une annonce ou un tableau → analyse (point d'entrée scraper / n8n)
  api/messages           ← POST génère le script, affinage optionnel par Claude
  api/outreach           ← POST message autonome pour une PÉPITE / un mandat J+15 (Make.com)
  api/hunt/start         ← GET cron du matin : lance les recherches Apify (+ hebdo le lundi, + résumé CRM)
  api/hunt/extra         ← GET crons du midi et du soir : annonces fraîches seulement
  api/hunt/ingest        ← POST webhook Apify de fin de run : cote, scoring, alertes
components/
  dashboard/             ← onglets, KPIs, filtres, règles mandat
  listing/               ← fiche annonce, détail du calcul de marge
  mandate/               ← économie du mandat (commission + upsells)
  messages/              ← modale de génération des messages
  analyzer/              ← formulaire « Analyser une annonce » avec scoring en direct
lib/                     ← types, validation des entrées, formatage
```

Une seule source de vérité : modifier une valeur dans `backend/config/rules.js` la modifie partout (moteur, UI, messages).

## Règles du moteur

**Formule financière**

| Ligne | Valeur |
|---|---|
| Marge brute | Cote marché pro (prix plancher de revente) − prix affiché |
| Remise en état | − 500 € (detailing + petite méca ; relevé de 350 € d'après les négociants, voir Sources) |
| Capital risque | − 200 € systématiques |
| **Marge nette** | Marge brute − 700 € |
| Cotisations micro | − 12,3 % du prix de revente (sur le CA, statut `micro`) |
| Assurance temporaire | − ~6 €/jour pendant le délai de vente du marché (30 à 90 jours) |
| Annonce LeBonCoin | − 80 € (2 annonces véhicule gratuites par an, puis 79,90 €) |
| Déplacement | − aller-retour à 0,15 €/km dans ta zone (hors zone : rapatriement) |
| Rapatriement | − 60 € + 0,15 €/km hors zone prioritaire (200 km) |
| Carte grise | − chevaux fiscaux × 58 € (Nouvelle-Aquitaine, mars 2026), ÷ 2 au-delà de 10 ans, + 13,76 € ; 0 € en pro (`REGISTRATION.status = 'pro'` dans `rules.js`) |
| **Marge réelle** | Marge nette − rapatriement − carte grise : **base du statut PÉPITE** |

Chevaux fiscaux : lus dans l'annonce (`fiscalHp`), sinon estimés par segment (citadine 5 CV, compacte 6, SUV 7, premium 8, moto 5). Le malus ne s'applique qu'à la première immatriculation en France (import) : jamais à une occasion française.

**Campagne → ville** : une annonce à plus de 30 km de toute grande ville (Bordeaux, Paris, Lyon… et les préfectures de Nouvelle-Aquitaine) reçoit le badge 🌾 Campagne et +5 points de score : moins d'acheteurs sur place, prix plus bas, revente à Bordeaux.

Le bonus des options déclencheurs n'entre **jamais** dans la marge ni dans le statut : il est affiché à part comme « potentiel options » (argument de revente). Un **scénario négocié** est calculé en parallèle : prix cible = prix affiché − leviers de négo, puis déduction du coût réel des défauts.

**Statuts**

- 🔥 **PÉPITE POTENTIELLE** : marge réelle > 1 000 € (citadines) ou > 2 000 € (compactes / premium) ; > 1 500 € en moto (paramètre ajustable)
- **A SURVEILLER** : marge positive au prix affiché ou après négociation
- **REFUSE** : blacklist, ou aucune marge même négociée

**Blacklist (score 0)**

- Renault 1.2 TCe H5Ft 2012-2018
- 1.2 PureTech avant 2023 sans facture courroie + crépine < 6 mois. Avec facture : achat plafonné à −30 % de la cote
- DSG7 à sec DQ200 (VAG ≤ 1.6 L, ou code DQ200 explicite). Une boîte à bain d'huile mentionnée (DQ381, « DSG381 », DQ250, DQ500, DSG6) n'est jamais refusée
- Mots-clés : « voyant moteur », « boîte HS », « vendu dans l'état sans CT », « contre-visite ». Les négations (« aucun voyant moteur ») sont ignorées

**Options déclencheurs (potentiel de valeur, plafonné à 2 500 €, influence le score mais pas la marge)**

- Auto : toit ouvrant / panoramique, Pack AMG, S-Line, M-Sport, volant à méplat, double écran MBUX ; Tesla Shanghai (VIN `LRW`) + LFP + Ryzen
- Moto : valises alu / top-case BMW ou Givi, ligne Akrapovic, Shifter Pro, Pack Touring / Dynamic, éligibilité A2 (MTT1 ou kit bridage)

**Leviers de négociation** : rayure −300 € (polish 90 €), carrosserie / calandre −500 €, pneus −250 €, plaquettes −150 €, jantes −250 € (rénovation 170 € HT), révision −200 €, kit chaîne moto −200 €. Le script demande **~10 % du prix** (ou la somme des leviers si elle est plus forte), +5 % quand l'annonce a 15 jours ou plus, entre 800 € et 2 500 € (plafond 15 % du prix sur les petits budgets). Le **prix plafond** (marge réelle à 0) n'est jamais dépassé.

**Mandat J+15** : annonces en ligne depuis plus de 14 jours, hors blacklist. Le propriétaire touche un **prix net garanti** ; la commission est la **plus-value au-dessus de ce prix net** (prix de vente pro = cote − prix net). Si la cote ne laisse pas au moins 500 € de plus-value (paramètre ajustable), le prix net proposé est abaissé d'autant. Upsells : detailing (150 € facturés pour 80 € de coût) et entretien (180 € pour 80 €). Exclusivité 30 jours, dédit de 250 €.

## Brancher des annonces réelles

`POST /api/score` accepte une annonce ou un tableau (200 max) :

```json
{
  "type": "auto",
  "brand": "Renault", "model": "Clio 4", "engine": "1.5 dCi 90", "gearbox": "Manuelle",
  "year": 2017, "mileage": 98000, "doors": 5,
  "price": 6990, "marketPrice": 8900,
  "daysOnline": 6,
  "description": "Petite rayure sur la portière, pneus avant à prévoir."
}
```

Champs moto : `licenseCategory` (`MTT1` / `MTT2`). Tesla : `vin`. PureTech : `beltMonthsAgo` (sinon lu dans le texte).

## Chasse automatique (Vercel + Apify + Telegram)

```
Cron Vercel (7 h) → /api/hunt/start → runs Apify (LeBonCoin, proxy résidentiel FR, plafond de coût par run)
Apify (fin de run) → /api/hunt/ingest → relit le run chez Apify → normalise → cote par comparables
  → scoring → outreach → alerte Telegram (anti-doublon) → stockage Neon Postgres (stock compact par annonce) → dashboard en direct
```

- **Modèles** : le radar scanne tous les véhicules de la zone dans le budget ; les modèles ciblés (top ventes VO : Clio, C3, 208, 2008, Sandero, Captur, Yaris, 308, 3008, Mégane, Duster, Corsa, Polo, Golf, Tesla, Classe A, A3 ; motos : MT-07/09, Z650/800/900, GS, Ténéré 700, T-Max, X-ADV, CB650, Africa Twin, Triumph, SV650) ont en plus des recherches de comparables pour fiabiliser la cote. Ajoutés à la demande de l'utilisateur (modèles revendus par les pros qu'il suit) : 206, 207, Classe B, Smart.
- **Zones** : *prioritaire* = 200 km autour de la base (44.901, -0.740, Nouvelle-Aquitaine), puis *France* métropolitaine (DOM-TOM exclus). Chaque annonce est replacée par ses coordonnées GPS. Hors zone prioritaire, le rapatriement (60 € + 0,15 €/km) est déduit de la marge avant de parler de pépite, et le mandat est exclu. Modifiable avec `HUNT_AREA=lat,lng,rayonKm`.
- **Gammes et budgets** : citadine / compacte / SUV / premium (motos : roadster, trail, maxi-scooter…), tranches 3–6, 6–10, 10–20, 20–30 k€. Filtres du dashboard : zone, gamme, budget, modèles, statut, tri par distance.
- **Recherches** : `fresh` 3 fois par jour, matin, midi et soir (crons à 5 h, 11 h et 17 h UTC, soit 6 h, 12 h et 18 h à Paris en hiver ; précision ± 59 min sur le plan Hobby, qui limite chaque cron à une exécution par jour, [Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing)), zone prioritaire puis France entière (dernières annonces, alertes PÉPITE, zone prioritaire en tête) ; chaque lundi, `stale` (annonces les plus anciennes, cibles Mandat J+15) et `market` (recherches larges par modèle, pour la cote).
- **Cote** : médiane des annonces comparables (même modèle, ±1 an et ±35 % de km, puis ±2 ans et ±60 %), 4 comparables minimum, 10 % d'extrêmes retirés au-delà de 10. Pas assez de comparables = pas de cote = pas d'alerte : aucune marge n'est inventée.
- **File d'attente** : le plan gratuit Apify limite à 5 runs simultanés. Le cron lance 4 recherches (`APIFY_MAX_CONCURRENT`), puis chaque run terminé lance la suivante du lot. Un verrou en base (clé unique) empêche de lancer deux fois la même recherche.
- **Alertes** : 10 max par run, triées par score. Une annonce déjà signalée ne l'est plus, sauf baisse de prix.
- **Sécurité** : le cron exige `CRON_SECRET`, le webhook exige `INGEST_SECRET`, et seul l'id du run est lu dans le webhook (les annonces sont relues chez Apify avec notre token).
- **Dashboard privé** : `DASHBOARD_PASSWORD` protège tout le site (y compris l'URL de production courte, que la protection Vercel ne couvre pas). La protection Vercel (connexion à ton compte) reste active sur les autres URLs `*.vercel.app`. Le webhook Apify la traverse grâce au jeton « Protection Bypass for Automation » (variable `VERCEL_AUTOMATION_BYPASS_SECRET`, fournie par Vercel). Pour appeler `/api/outreach` depuis un outil externe, ajoute l'en-tête `x-vercel-protection-bypass: <ce jeton>`.
- **Envoi au vendeur** : manuel, depuis Telegram. LeBonCoin n'a pas d'API de messagerie et bannit les envois automatisés.
- **Fréquence** : le plan Vercel Hobby limite les crons à 1 par jour. Pour plus de passages, passe en Pro et change `schedule` dans `vercel.json` (ex. `0 6-21/2 * * *`), ou appelle `/api/hunt/start` depuis un planificateur externe avec l'en-tête `Authorization: Bearer <CRON_SECRET>`.
- **Coût** : réglages par défaut ≈ 3 000 annonces/mois en quotidien + ≈ 5 000 en hebdo (36 recherches de comparables), soit environ 12 à 23 $/mois au tarif affiché du scraper (1,50 à 2,91 $ / 1 000), plus la bande passante du proxy résidentiel. Le plan gratuit Apify (5 $ de crédit/mois) suffit pour tester ; au-delà, compter le plan Starter. Baisse `HUNT_MAX_ITEMS` / `HUNT_MARKET_MAX_ITEMS` pour réduire. Vérifie le prix en vigueur sur la page du scraper `bovi/leboncoin-listings`.

**Tes propres recherches** : fais ta recherche sur leboncoin.fr (zone, prix, tri « plus récentes »), copie l'URL, puis renseigne `HUNT_SOURCES` :

```json
[
  { "key": "fresh-auto", "kind": "fresh", "type": "auto", "input": { "searchUrl": "https://www.leboncoin.fr/recherche?category=2&..." } },
  { "key": "stale-auto", "kind": "stale", "type": "auto", "input": { "searchUrl": "https://www.leboncoin.fr/recherche?category=2&...&order=asc" } }
]
```

**Comparables à la demande** : une annonce fraîche sans assez de comparables déclenche une recherche de son modèle sur toute la France (2 par run, `HUNT_ONDEMAND_PER_RUN`, chaque modèle au plus tous les 14 jours). À l'arrivée des comparables, les annonces de ce modèle sont recotées et alertées. En attendant, le dashboard les affiche dans « Annonces réelles sans cote », avec un champ pour saisir ta cote et scorer tout de suite.

**Lancement manuel** (ex. pour tester) : `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/hunt/start` (ajoute `?weekly=1` pour lancer aussi annonces anciennes + comparables, indispensable au tout premier lancement).

## CRM (`/crm`)

Le radar remplit le CRM tout seul : chaque PÉPITE ou cible mandat alertée devient un **deal** avec son premier message prêt. Le bouton **+ CRM** d'une fiche ajoute une annonce à la main. Tu ne traites que les **leads chauds**.

- **3 pipelines** : achat-revente (À contacter → Contacté → En discussion → Visite → Acheté → Préparation → En vente → Vendu), mandat (… → RDV signature → Mandat signé → En vente → Vendu) et acheteurs (une fiche par acheteur intéressé par un véhicule en vente ; « vendu » sur l'acheteur vend le véhicule).
- **Lecture des réponses** : colle la réponse du vendeur ou de l'acheteur. Le CRM reconnaît accord, contre-offre (montant extrait et comparé à tes prix max / plafond / plancher), question, refus, « déjà vendu ».
- **Chaleur 0-100** : étape + intention + fraîcheur de la réponse + « attend ta réponse » + visite imminente. ≥ 70 = 🔥 chaud, en tête de « À traiter ».
- **Prochaine action + message prêt** : réponse adaptée (accord → visite et virement instantané ; contre-offre jouable → on coupe la poire en deux sans dépasser le plafond ; trop haute → on tient l'offre), relances à J+2 et J+5, clôture proposée après 9 jours de silence, rappel la veille d'une visite, carte grise à faire sous un mois, préparation, annonce de revente rédigée.
- **Papiers** : check-lists achat (HistoVec, non-gage, CT < 6 mois, carte grise barrée, cession Cerfa 15776, code de cession, carnet, double des clés, immatriculation), mandat et revente.
- **Argent** : marge attendue, prix d'achat et frais réels, marge encaissée, stock immobilisé, encaissé du mois.
- **Résumé Telegram** chaque matin avec la chasse : leads chauds, réponses, relances, visites.

Stockage : Neon Postgres (table `deals`). API : `GET/POST /api/crm`, `PATCH/DELETE /api/crm/:id` (protégées par le mot de passe du dashboard). L'envoi reste un copier-coller : LeBonCoin n'a pas d'API de messagerie et bannit les envois automatisés.

## Réseau d'acheteurs (`/crm` → 👥 Acheteurs)

Chaque personne qui te dit ce qu'elle cherche (modèles, budget max, année min, km max, carburant, boîte) est enregistrée (`crm/buyers/`, API `GET/POST /api/buyers`, `PATCH/DELETE /api/buyers/:id`). Le matching (`backend/utils/matching.js`) compare son budget au **prix de revente** (revente chez toi, sinon prix marché). Les correspondances apparaissent :
- sur les cartes du radar (« 👥 N acheteurs ») ;
- dans les alertes Telegram (« Acheteur(s) prêt(s) ») ;
- dans l'onglet Acheteurs, sur les voitures du CRM, avec le message prêt et la création de la fiche acheteur en un clic.

**Formulaire public `/cherche`** (sans mot de passe) : les acheteurs laissent eux-mêmes leurs critères et leurs coordonnées, avec une case de consentement obligatoire (date enregistrée). Chaque inscription arrive **en pause** : tu la valides (✓ Valider) avant qu'elle entre dans le matching et les alertes, et le formulaire refuse plus de 20 inscriptions par heure (anti-spam, choix métier). Tu reçois une notification Telegram. Variables optionnelles : `PUBLIC_BRAND` (ton nom commercial, affiché comme responsable) et `PUBLIC_CONTACT` (e-mail ou téléphone pour les demandes de suppression). On ne collecte jamais de coordonnées sur des forums ou des réseaux sociaux : la CNIL exige le consentement avant tout démarchage ([CNIL](https://www.cnil.fr/fr/la-reutilisation-des-donnees-publiquement-accessibles-en-ligne-des-fins-de-demarchage-commercial)).

**Annonces republiées** : un vendeur qui supprime et remet son annonce pour paraître récente est repéré grâce à l'empreinte du véhicule (même modèle, même année, km à 2 000 près, même code postal). Le temps en ligne repart de la première annonce, ce qui compte pour le levier de négociation et le mandat J+15, et la carte affiche « 🔁 Republiée ».

## Apprentissage (`/crm` → 📈 Apprentissage)

Chaque deal mené dans le CRM mesure la réalité, à comparer aux hypothèses du radar :
- négo de tes acheteurs (prix affiché → encaissé) ;
- remise obtenue des vendeurs (affiché → acheté) ;
- revente réelle vs prix marché du radar ;
- remise en état réelle ;
- délai de vente réel ;
- taux de réponse des vendeurs ;
- écart marge encaissée / marge prévue ;
- réussite par niveau d'offre (moins de 8 %, 8-12 %, 12 % et plus).

À partir de 3 deals, une mesure devient une **proposition de réglage**, jamais appliquée sans ton accord (`backend/utils/learning.js`). Ces chiffres n'existent que dans ton CRM : c'est l'avantage que personne ne peut copier.

## Vendabilité : la voiture partira-t-elle vite ?

À modèle égal, la finition, les options et la couleur font qu'une voiture se revend en une semaine ou traîne des mois. Exemple : une Golf mal finie (intérieur, jantes) qui ne part pas, ou une CLA qui se vend mal sans toit ouvrant. Chaque carte et chaque alerte affichent **🏷 Revente** (facile, à surveiller, risque de traîner) avec les raisons :
- **niveau de finition** lu dans le titre : entrée de gamme, intermédiaire ou haute ;
- **options recherchées** : toit ouvrant ou panoramique, packs AMG, S-Line, M-Sport… ;
- **couleur** ;
- **annonce qui traîne** : en ligne bien plus longtemps que les annonces comparables.

La **concurrence à la revente** compte les annonces du même modèle, aussi récentes et moins kilométrées, déjà affichées sous ton futur prix de revente : ce sont elles que ton acheteur verra à côté de ta voiture (liens sur la carte).

Le prix marché compare désormais des voitures **du même niveau de finition** quand il est connu, pour qu'une Trendline ne soit plus cotée au prix d'une Carat. La vendabilité ne change ni la marge ni le score. La check-list photos ajoute « finition : sellerie, jantes, écran, couleur ».

## Pépites à vérifier (cote peu fiable)

Une pépite dont la cote est **faible** (peu de comparables, prix dispersés) ne reçoit jamais d'offre automatique. Elle déclenche une alerte Telegram **🔎 PÉPITE À VÉRIFIER** (3 par run au maximum, choix métier) et une fiche CRM. Chacune contient :
- les liens pour vérifier le prix soi-même : [cote L'argus](https://www.largus.fr/cote-auto.html) (site commercial, gratuit) et annonces LeBonCoin comparables (année ±1, km ±30 %, les moins chères d'abord) ;
- la check-list photos ;
- un **premier message de questions** prêt à copier : lien HistoVec ([officiel, gratuit](https://histovec.interieur.gouv.fr)), propriétaires, factures, distribution, contrôle technique, frais connus, raison de la vente. Les points que l'annonce mentionne déjà sont sautés.

La même aide apparaît sur la carte du site. Une fois la cote vérifiée, saisis-la sur la carte : la marge et le message d'offre sont recalculés. `POST /api/hunt/verify` (secret du cron) envoie les alertes « à vérifier » des annonces déjà relevées, sans lancer de recherche Apify.

## Photos : check-list et inspection IA

Chaque pépite affiche une **check-list gratuite** de ce qu'il faut regarder sur les photos avant de se déplacer : compteur, voyants, teinte des éléments, pneus, usure de l'intérieur, vraies photos du véhicule. Elle figure aussi dans l'alerte Telegram.

En cas de doute, le bouton **🔍 Faire inspecter par l'IA** envoie à Claude (vision) les 6 premières photos et la description. Il ne tourne que quand tu cliques : l'inspection automatique est désactivée par défaut (`INSPECT_PER_RUN=0`). L'IA renvoie :
- un verdict : rassurant, à vérifier ou suspect ;
- les défauts visibles avec leur numéro de photo ;
- la cohérence entre l'usure, le kilométrage et la description ;
- le compteur lu sur la photo, signalé s'il s'écarte de l'annonce ;
- les photos manquantes ;
- les questions à poser au vendeur, reprises dans la fiche CRM.

L'IA ne donne **aucun chiffrage de réparation** et ne change ni le score ni la marge. C'est indicatif : elle ne voit que les photos, la visite et le contrôle en garage restent obligatoires.

À configurer dans Vercel :
- `ANTHROPIC_API_KEY` (obligatoire) ;
- `INSPECT_BUDGET_USD` : plafond mensuel, 20 $ par défaut ;
- `INSPECT_PER_RUN` : inspections automatiques par run, 0 par défaut.

Chaque inspection est gardée : rouvrir la carte ne coûte rien, seul « Refaire » relance l'IA.

## Sources & hypothèses (rien d'inventé)

Chaque chiffre du radar est soit **sourcé**, soit **un choix métier signalé comme tel**. Aucune base de données publique ne donne de cote pro gratuite : le « prix marché » du radar est la **médiane des prix affichés** d'annonces comparables collectées, pas l'Argus ni un prix de vente réel.

| Paramètre | Valeur radar | Ce que disent les pros / la statistique | Statut |
|---|---|---|---|
| Prix marché | médiane des annonces comparables (≥ 4) : même modèle et variante, **même carburant, même boîte, puissance ±15-25 %**, année ±1-2, km proches, **annonces accidentées / en panne écartées** ; critères affichés sur chaque carte | Méthode des négociants : comparer les annonces similaires ([Debard Automobiles](https://www.debardautomobiles.com/actualites/blog/comment-un-negociant-auto-fixe-le-prix-dun-vehicule-doccasion)) | Prix **affichés**, pas de vente |
| Fiabilité de la cote | haute ≥ 70, moyenne ≥ 45 ; faible si prix dispersés à plus de 35 % : **jamais d'alerte sur une cote faible**, MASTERCLASS seulement en haute | Choix métier (nombre de comparables, dispersion, critères vérifiés) ; les annonces comparées sont listées avec leur lien pour vérification | Choix métier |
| Négo de ton acheteur à la revente | −5 % dans la « marge prudente » | 3 à 8 % de négo intégrée aux annonces ([Joinsteer](https://www.joinsteer.com/car/guide/negocier-prix-occasion), [Caroom](https://www.caroom.fr/guide/occasion/achat/prix)) | Sourcé (guides, pas d'étude officielle) |
| Remise demandée au vendeur | ~10 %, +5 % à J+15, 800-2 500 € ; la « marge négociée » est calculée sur cette offre exacte | 5-10 % réaliste, jusqu'à 15 % si réparations ou annonce de plus d'un mois ([Joinsteer](https://www.joinsteer.com/car/guide/negocier-prix-occasion), [Caradisiac](https://www.caradisiac.com/Achat-d-une-voiture-d-occasion-vos-armes-pour-negocier-92992.htm)) | Sourcé |
| Remise en état | 500 € (relevé de 350 €) ; **350 € sous 5 000 €** (petits budgets, validé par l'utilisateur le 26/10/2026 : sa 206 achetée 4 000 €, revendue 5 000 €) | Négociant : ~600 € + 120 € de préparation sur une 9 900 € ([Debard](https://www.debardautomobiles.com/actualites/blog/comment-un-negociant-auto-fixe-le-prix-dun-vehicule-doccasion)) ; factures finales souvent 50-100 % au-dessus du devis ([Autocopilot](https://autocopilot.fr/guides/rentabilite-achat-revente-voiture)) | Sourcé (prudent sans être pessimiste) |
| Assurance temporaire | ~6 €/jour, 30 à 90 jours | ~158-210 € les 30 jours ([Assurland](https://www.assurland.com/assurance-auto/formule/temporaire/), [Assurance en direct](https://www.assuranceendirect.com/tarification-assurance-auto-temporaire.html)) ; obligatoire pour rouler dès l'achat, possible sur le VIN avec la carte grise barrée et la cession ([Groupama](https://www.groupama.fr/assurance-auto/conseils/carte-grise-assurance/)) | Sourcé (devis à faire selon ton profil) |
| Annonce de revente | 80 € | Particulier : 2 annonces véhicule gratuites par an, puis 79,90 € l'annonce ([Presse-citron](https://www.presse-citron.net/vendre-sa-voiture-sur-leboncoin-devient-payant-etes-vous-concerne/), [Clubic](https://www.clubic.com/actualite-562317-ni-vu-ni-connu-leboncoin-vous-fait-payer-plus-cher-vos-annonces-auto.html)) | Sourcé, à vérifier sur le site LeBonCoin |
| Budget de chasse auto | 1 500 € à 30 000 € (relevé de 3 000 € le 26/10/2026) | Guide de l'utilisateur : citadines de 1 500 € à 8 000 € | Choix métier validé |
| Capital risque | 200 € | Choix métier (imprévus) | Choix métier |
| Marge moyenne de la profession | — | ~500 € HT/véhicule de marge brute d'activité VO ([L'argus, baromètre](https://www.largus.fr/pros/actualite-automobile/barometre-occasion-la-profession-dans-l-escalier-de-la-baisse-des-prix-30029937.html)) | Repère : tes seuils pépite (1 000 / 2 000 € réels) visent 2 à 4× la moyenne |
| Délai de vente « marché lent » | > 90 j (> 145 j en électrique) | ~90-95 j sur leboncoin en thermique, ~145 j en électrique ([L'argus 2025](https://www.largus.fr/pros/actualite-automobile/voitures-d-occasion-les-prix-ne-baissent-plus-depuis-le-mois-de-septembre-30045002.html)) | Sourcé |
| Gros rouleur | > 25 000 km/an | Moyenne française 11 600 km/an en 2024 ([SDES](https://www.statistiques.developpement-durable.gouv.fr/397-millions-de-voitures-en-circulation-en-france-au-1er-janvier-2025)) | Seuil ≈ 2× la moyenne |
| Carte grise | 58 €/CV Nouvelle-Aquitaine, ÷ 2 après 10 ans, + 13,76 € | Tarif au 1er mars 2026 ([Cartegriseminute](https://www.cartegriseminute.fr/nouveau-prix-cheval-fiscal-nouvelle-aquitaine-2026.php)) | Sourcé ; CV estimés si absents (signalé « estimés ») |
| Malus | non appliqué | Uniquement à la 1re immatriculation en France (import) ([Journal de l'Auto](https://journalauto.com/industrie/malus-pour-les-voitures-doccasion-seuls-les-modeles-importes-sont-concernes/)) | Sourcé |
| Cotisations micro-entreprise | 12,3 % du prix de revente (achat-revente, prix local pour la revente chez toi) ; 21,2 % de la commission + upsells (mandat) ; déduites aussi dans le CRM | Taux 2026 sur le **chiffre d'affaires** encaissé ([economie.gouv.fr](https://www.economie.gouv.fr/entreprises/micro-entreprise-auto-entreprise-charges-sociales)) | Sourcé ; `BUSINESS.status` dans `rules.js`, **actuellement `particulier`** (choix de l'utilisateur : marges sans cotisations en attendant la déclaration, à repasser en `micro` ensuite) |
| TVA en pro | non déduite | Franchise en base : 85 000 € de CA en vente de marchandises en 2026 ([Legifiscal](https://www.legifiscal.fr/actualites-fiscales/4436-nouveaux-seuils-micro-entreprises-annee-2026.html)) ; au-delà, TVA sur la marge (art. 297 A du CGI) | À valider avec un comptable avant de passer pro |
| Bonus campagne, points forts, MASTERCLASS | +5 / +2 par point / ×2 seuil | Choix métier pour trier (ne changent jamais la marge) | Choix métier |
| Vendabilité : finition | entrée de gamme ⚠, intermédiaire ✓, haute ✓ (surcoût pas toujours récupéré) ; comparables limités au même niveau de finition quand il est connu | « Les modèles d'entrée de gamme seront souvent plus compliqués à revendre à bon prix », « les variantes intermédiaires se retrouvent généralement mieux placées » ([L'argus, 2023](https://www.largus.fr/actualite-automobile/quelles-voitures-francaises-a-essence-decotent-le-plus-30030557.html)) ; liste des finitions par marque = nomenclature constructeur | Sourcé (principe) ; correspondance finition → niveau = choix métier, à compléter |
| Vendabilité : couleur | noir, gris, blanc ✓ ; rose, jaune, violet, personnalisée ⚠ (aucun montant) | Couleurs les plus vendues et couleurs qui peuvent faire baisser le prix ([Capcar, 2019](https://www.capcar.fr/blog/la-couleur-a-t-elle-une-influence-sur-la-valeur-de-votre-voiture-doccasion), site commercial) ; aucune étude française récente chiffrée | Signal seulement |
| Vendabilité : annonce qui traîne | en ligne > 1,5 × la médiane des comparables (et ≥ 15 j) | Expérience de l'utilisateur (Golf mal finie, CLA sans toit ouvrant) | Choix métier |
| Concurrence à la revente | 3 annonces ou plus, même modèle et finition, aussi récentes, moins kilométrées, affichées sous ton prix de revente ⚠ ; recherches LeBonCoin sans plancher de km | Guide de l'utilisateur : « ne jamais borner le kilométrage inférieur » (synthèse Gemini de vidéos YouTube de professionnels, liens des vidéos à ajouter) | Seuil de 3 = choix métier |
| Check-list de visite (CRM) | 10 points : VIN, rapport km/sinistres, CT, carrosserie, pneus, freins, factures, ligne droite, essai, aucun doute | Même guide ; HistoVec ([officiel](https://histovec.interieur.gouv.fr)) | Expérience pro, à sourcer vidéo par vidéo |
| PureTech 1.2 avant 2023 | **refus systématique**, même avec facture de courroie (avant : accepté à −30 % avec facture < 6 mois) | Revente très difficile : des concessionnaires refusent de les reprendre ([question parlementaire](https://questions.assemblee-nationale.fr/dyn/17/questions/QANR5L17QE1396.pdf)) ; chaîne de distribution depuis 2023 ([L'argus](https://www.largus.fr/actualite-automobile/moteur-1-2-puretech-stellantis-lancera-bientot-une-plate-forme-d-indemnisation-30037499.html)) | Choix de l'utilisateur (26/10/2026) |
| Fiabilité à surveiller | 1.6 THP / Prince (PSA, Mini R56, ≤ 2013), 1.0 EcoBoost, 1.2/1.4 TSI EA111 (2006-2014), BMW N47 (2007-2011) : avertissement, revente « risque de traîner », pas de refus | [Fiches-Auto](https://www.fiches-auto.fr/articles-auto/fiabilite/s-2472-moteurs-essence-les-moins-fiables.php), [Autocopilot](https://autocopilot.fr/motorisations), [Presse-Citron](https://www.presse-citron.net/auto-voici-la-liste-des-moteurs-essence-a-eviter-en-2023/) | Guides du secteur (sites commerciaux) |
| Coût de l'inspection IA | tokens × 4 $ / 20 $ par million (entrée / sortie), affiché « estimé » | Tarif Claude Opus 5.5 ([Anthropic, pricing](https://platform.claude.com/docs/en/about-claude/pricing)) ; images limitées à 5 Mo ([Anthropic, vision](https://platform.claude.com/docs/en/build-with-claude/vision)) | Sourcé ; quelques centimes par annonce, à vérifier sur ta console Anthropic |
| Inspection IA : 6 photos, 0 auto par run, budget 20 $/mois, écart compteur > 5 % et 2 000 km | — | Limites d'usage et seuil d'alerte | Choix métier (réglables dans Vercel) |
| Check-list photos | 6 points | Points de contrôle courants d'un véhicule d'occasion | Choix métier |
| Import : détection (USA, Japon, Allemagne, UE) | mots-clés de l'annonce (import, CARFAX, homologation, 846 A, plaques étrangères, volant à droite…) ; pas de MASTERCLASS | Demande de l'utilisateur (27/10/2026) | Choix métier |
| Import : papiers | 846 A hors UE, RTI DREAL sans COC (CT < 6 mois), quitus fiscal dans l'UE | [service-public F20992](https://www.service-public.gouv.fr/particuliers/vosdroits/F20992), [douane](https://www.douane.gouv.fr/fiche/achat-dun-vehicule-letranger-ou-dans-un-dom-com), [DREAL NA RTI01.2](https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/IMG/pdf/rti01.2_traduction.pdf), [impots.gouv quitus](https://www.impots.gouv.fr/vous-etes-un-particulier-et-vous-souhaitez-obtenir-un-quitus-fiscal) | Sourcé (officiel) |
| Import : homologation | seule l'homologation **écrite dans l'annonce** est déduite ; sinon affichée « 2 000 à 10 000 € selon les guides » | eplaque, Matmut (guides commerciaux) ; aucun tarif UTAC officiel | Estimation, à valider par devis |
| Import : malus | « probablement nul » si 1re immatriculation avant 2015, sinon « jusqu'à 80 000 € avant décote » | [service-public F35947](https://www.service-public.gouv.fr/particuliers/vosdroits/F35947), [F35950](https://www.service-public.gouv.fr/particuliers/vosdroits/F35950) | Sourcé ; montant exact non calculé (CO2 / CV inconnus) |
| Import : douane | USA 0 % si fabriquée aux USA et origine prouvée (depuis le 01/07/2026), sinon 10 % ; Japon 0 % avec preuve d'origine, sinon 10 % ; TVA 20 % | [Commission UE](https://commission.europa.eu/topics/trade/eu-us-trade-deal_en), [douane APE UE-Japon](https://www.douane.gouv.fr/fiche/accord-de-partenariat-economique-ue-japon) | Sourcé ; taux TARIC 8703 à vérifier à la main |
| Import : COC et transport Allemagne | COC 180 à 600 € ; camion 400 à 900 € | [autocopilot](https://autocopilot.fr/guides/importer-voiture-allemagne), [motorsactu](https://motorsactu.com/importer-voiture-allemagne-vers-france-demarches-couts/) (commerciaux) | Estimations, non déduites |
| Fiche entretien moteur (45 moteurs) | courroie ou chaîne, échéance en **fourchette entre sources**, kit estimé, points faibles, questions au vendeur ; information seulement (ni score ni marge) | L'argus, fiches-auto, Autocopilot, idGarages, AD, forums (sources secondaires, détail par moteur dans `backend/config/engines.js`) ; aucun carnet constructeur consulté | À valider sur carnet / VIN ; 15 fiches au type de distribution recoupé |
| Vendeur pro, « en l'état », « prix marchand » | signalés dans l'analyse, sans effet sur le score | Garantie légale de conformité, 12 mois de présomption sur une occasion ([service-public F11094](https://www.service-public.gouv.fr/particuliers/vosdroits/F11094)) | Sourcé ; en faire un risque attend ton accord |

Les heuristiques de lecture (vendeur pressé, risques, points forts) lisent **ce que l'annonce écrit** : elles n'inventent rien, mais un vendeur peut mentir. Photos, HistoVec et essai restent obligatoires.

## Outreach autonome (Make.com)

`POST /api/outreach` prend une annonce et renvoie un message prêt à envoyer. L'annonce est **toujours re-scorée côté serveur**.

```json
{ "listing": { "...": "même format que /api/score" }, "strategy": "auto" }
```

| `strategy` | Comportement |
|---|---|
| `auto` (défaut) | PÉPITE → négociation ; J+15 → mandat ; les deux → la plus rentable (marge négociée vs revenu du mandat, mandat à égalité car zéro trésorerie) |
| `negotiation` | message de négo : défauts détectés, remise ~10 % (800 € à 2 500 €), paiement immédiat par virement instantané |
| `mandate` | proposition de dépôt-vente : vente plus chère, zéro curieux, zéro avance, commission sur la plus-value au-dessus du prix net |

Réponse (extrait) :

```json
{
  "ok": true,
  "event": "outreach.generated",
  "version": 1,
  "strategy": "negotiation",
  "strategyReason": "PÉPITE : marge nette 1360 € > seuil 1000 €.",
  "listing": { "id": "a-001", "title": "…", "price": 6990, "marketPrice": 8900, "daysOnline": 6, "url": null },
  "scoring": { "status": "PEPITE", "score": 79, "netMargin": 1360, "negotiatedNetMargin": 1660 },
  "negotiation": { "askingPrice": 6990, "offerPrice": 6400, "discount": 590, "payment": "virement_instantane", "defects": [{ "id": "rayure", "…": "…" }] },
  "mandate": null,
  "message": { "strategy": "negotiation", "subject": "…", "body": "…", "length": 634 },
  "alternatives": []
}
```

Annonce non éligible (blacklist, ni PÉPITE ni J+15) : `200 { "ok": false, "error": "not_eligible", "reason": "…" }`. Dans Make, filtrer simplement sur `ok = true`. JSON invalide : 400, annonce invalide : 422.

**Scénario Make conseillé** : déclencheur (RSS / scraper / Google Sheet) → module HTTP « Make a request » `POST https://<ton-app>.vercel.app/api/outreach` (body JSON, parse response = oui) → filtre `ok = true` → envoi (Gmail, SMS, WhatsApp, messagerie de la plateforme) avec `message.subject` / `message.body`.

**Mode push** : `{ "listing": …, "dispatch": true }` avec l'en-tête `x-api-key: <OUTREACH_API_KEY>` envoie aussi le payload vers `MAKE_WEBHOOK_URL` (champ `dispatch` dans la réponse). Sans clé valide : 401.

Dans le dashboard, le bouton **« Générer le message autonome »** (fiches PÉPITE et fiches de l'onglet Mandat) appelle cette route et affiche le message ainsi que le payload JSON exact.
