# Pépite Radar

Veille, scoring et aide à la décision pour l'**achat-revente** et le **mandat de dépôt-vente** Auto & Moto, segment **3 000 € – 30 000 €**, Bordeaux & région.

Next.js 15 (App Router) · Tailwind CSS · moteur de scoring en JS pur · prêt pour Vercel.

## Démarrage

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # tests du moteur de scoring (node:test)
npm run build      # build de production
```

Déploiement Vercel : importer le repo, aucun réglage requis. Variable optionnelle `ANTHROPIC_API_KEY` pour activer le bouton « Affiner avec l'IA » sur les messages vendeurs (voir `.env.example`).

## Architecture

```
backend/
  config/rules.js        ← TOUTES les valeurs métier (blacklist, options, leviers, coûts, seuils, mandat)
  utils/scoring.js       ← moteur de scoring & calcul de marge (fonction pure)
  utils/messages.js      ← générateur de scripts : négociation & proposition de mandat
  utils/text.js          ← normalisation du texte, détection de mots-clés avec gestion des négations
  utils/scoring.test.js  ← tests des règles
  data/listings.js       ← annonces de démo (une par règle)
app/
  page.tsx               ← dashboard (3 onglets)
  api/listings           ← GET  annonces scorées (?type=auto|moto&status=PEPITE&minDays=15)
  api/score              ← POST une annonce ou un tableau → analyse (point d'entrée scraper / n8n)
  api/messages           ← POST génère le script, affinage optionnel par Claude
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
| Marge brute | Cote marché pro + bonus options − prix affiché |
| Remise en état | − 350 € (detailing 80 € + petite méca) |
| Capital risque | − 200 € systématiques |
| **Marge nette** | Marge brute − 550 € |

Un **scénario négocié** est calculé en parallèle : prix cible = prix affiché − leviers de négo, puis déduction du coût réel des défauts.

**Statuts**

- 🔥 **PÉPITE POTENTIELLE** : marge nette > 1 000 € (citadines) ou > 2 000 € (compactes / premium) ; > 1 500 € en moto (paramètre ajustable)
- **A SURVEILLER** : marge positive au prix affiché ou après négociation
- **REFUSE** : blacklist, ou aucune marge même négociée

**Blacklist (score 0)**

- Renault 1.2 TCe H5Ft 2012-2018
- 1.2 PureTech avant 2023 sans facture courroie + crépine < 6 mois. Avec facture : achat plafonné à −30 % de la cote
- DSG7 à sec DQ200 (VAG ≤ 1.6 L, ou code DQ200 explicite). La DQ381 des 2.0 n'est pas concernée
- Mots-clés : « voyant moteur », « boîte HS », « vendu dans l'état sans CT », « contre-visite ». Les négations (« aucun voyant moteur ») sont ignorées

**Options déclencheurs (bonus de valeur, plafonné à 2 500 €)**

- Auto : toit ouvrant / panoramique, Pack AMG, S-Line, M-Sport, volant à méplat, double écran MBUX ; Tesla Shanghai (VIN `LRW`) + LFP + Ryzen
- Moto : valises alu / top-case BMW ou Givi, ligne Akrapovic, Shifter Pro, Pack Touring / Dynamic, éligibilité A2 (MTT1 ou kit bridage)

**Leviers de négociation** : rayure −300 € (polish 90 €), carrosserie / calandre −500 €, pneus −250 €, plaquettes −150 €, jantes −250 € (rénovation 170 € HT), révision −200 €, kit chaîne moto −200 €. Le script demande une remise bornée entre 500 € et 1 000 €.

**Mandat J+15** : annonces en ligne depuis plus de 14 jours, hors blacklist. Commission 6 % (min. 500 €, ajustable) + upsells detailing (150 € facturés pour 80 € de coût) et entretien (180 € pour 80 €). Exclusivité 30 jours, dédit de 250 €.

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
