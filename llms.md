# Pépite Radar

> Application web de veille, de scoring et d'aide à la décision pour l'achat-revente et le mandat de dépôt-vente de véhicules d'occasion (auto 3 000 € – 30 000 €, moto 5 000 € – 18 000 €), Bordeaux et Nouvelle-Aquitaine.

## Ce que fait l'application

- Score chaque annonce de 0 à 100 et lui donne un statut : 🔥 PÉPITE POTENTIELLE, A SURVEILLER ou REFUSE.
- Calcule la marge nette : cote marché pro + bonus options − prix affiché − 350 € de remise en état − 200 € de capital risque.
- Refuse les moteurs à risque : Renault 1.2 TCe H5Ft (2012-2018), 1.2 PureTech avant 2023 sans courroie récente, boîte VAG DSG7 à sec DQ200.
- Repère les options qui valorisent le véhicule (toit panoramique, Pack AMG, S-Line, M-Sport, Tesla Shanghai LFP/Ryzen, Akrapovic, valises BMW…) et les défauts qui servent à négocier (rayures, pneus, plaquettes, jantes).
- Cible les vendeurs dont l'annonce est en ligne depuis plus de 14 jours pour leur proposer un dépôt-vente sans avance de trésorerie.
- Génère les messages au vendeur : négociation argumentée (remise de 500 € à 1 000 €) et proposition de mandat.

## API

- `GET /api/listings` : annonces scorées. Filtres `type`, `status`, `minDays`.
- `POST /api/score` : analyse une annonce JSON ou un tableau d'annonces.
- `POST /api/messages` : script de négociation ou de mandat pour une annonce.

## Fichiers clés

- `backend/config/rules.js` : toutes les règles métier et valeurs chiffrées.
- `backend/utils/scoring.js` : moteur de scoring.
- `backend/utils/messages.js` : générateur de messages.
