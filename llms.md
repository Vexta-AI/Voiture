# Pépite Radar

> Application web de veille, de scoring et d'aide à la décision pour l'achat-revente et le mandat de dépôt-vente de véhicules d'occasion (auto 3 000 € – 30 000 €, moto 5 000 € – 18 000 €), Bordeaux et Nouvelle-Aquitaine.

## Ce que fait l'application

- Score chaque annonce de 0 à 100 et lui donne un statut : 🔥 PÉPITE POTENTIELLE, A SURVEILLER ou REFUSE.
- Calcule la marge nette : prix marché (médiane des annonces comparables) − prix affiché − 500 € de remise en état − 200 € de capital risque, puis la marge réelle (− carte grise à 58 €/CV en Nouvelle-Aquitaine, − assurance temporaire ~6 €/jour, − annonce LeBonCoin 80 €, − trajet ou rapatriement). Les options ne gonflent jamais la marge.
- Refuse les moteurs à risque : Renault 1.2 TCe H5Ft (2012-2018), 1.2 PureTech avant 2023 sans courroie récente, boîte VAG DSG7 à sec DQ200.
- Repère les options qui valorisent le véhicule (toit panoramique, Pack AMG, S-Line, M-Sport, Tesla Shanghai LFP/Ryzen, Akrapovic, valises BMW…) et les défauts qui servent à négocier (rayures, pneus, plaquettes, jantes).
- Cible les vendeurs dont l'annonce est en ligne depuis plus de 14 jours pour leur proposer un dépôt-vente sans avance de trésorerie.
- Génère les messages au vendeur : négociation argumentée (remise d'environ 10 %, 800 € à 2 500 €, paiement par virement instantané) et proposition de mandat (commission sur la plus-value au-dessus du prix net vendeur).

- Photos : check-list gratuite sur chaque pépite, et inspection IA (Claude vision) à la demande : défauts visibles, cohérence km / usure, compteur lu sur photo, questions au vendeur. Indicatif, ne change ni score ni marge.
- CRM : pipelines achat-revente, mandat et acheteurs ; lecture des réponses (accord, contre-offre, question, refus) ; chaleur des leads ; réponses, relances et papiers préparés.

## API

- `GET /api/listings` : annonces scorées. Filtres `type`, `status`, `minDays`.
- `POST /api/score` : analyse une annonce JSON ou un tableau d'annonces.
- `POST /api/messages` : script de négociation ou de mandat pour une annonce.
- `GET/POST /api/crm`, `PATCH/DELETE /api/crm/:id` : deals du CRM (actions : message envoyé / reçu, étape, note, papiers, chiffres).
- `GET/POST /api/inspect` : état et budget de l'inspection IA ; inspection des photos d'une annonce du radar (`listingId`).
- `POST /api/outreach` : message autonome au format JSON stable pour Make.com (stratégie choisie automatiquement).

## Fichiers clés

- `backend/config/rules.js` : toutes les règles métier et valeurs chiffrées.
- `backend/utils/scoring.js` : moteur de scoring.
- `backend/utils/messages.js` : générateur de messages.
- `backend/utils/outreach.js` : choix de stratégie et payload d'outreach.
- `backend/utils/inspection.js` et `lib/inspect.ts` : check-list photos, schéma et appel de l'inspection IA.
- `backend/config/crm.js` et `backend/utils/crm.js` : règles et moteur du CRM.

## Règle de fiabilité

Aucun chiffre n'est inventé : chaque valeur métier est sourcée (README, section « Sources & hypothèses ») ou signalée comme choix métier / à valider. Le prix marché est la médiane des prix affichés d'annonces comparables, pas l'Argus. Voir `CLAUDE.md`.
