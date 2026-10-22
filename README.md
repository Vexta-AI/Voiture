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

Déploiement Vercel : importer le repo, aucun réglage requis. Variables optionnelles (voir `.env.example`) :

| Variable | Rôle |
|---|---|
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
  utils/text.js          ← normalisation du texte, détection de mots-clés avec gestion des négations
  utils/scoring.test.js  ← tests des règles
  data/listings.js       ← annonces de démo (une par règle)
app/
  page.tsx               ← dashboard (3 onglets)
  api/listings           ← GET  annonces scorées (?type=auto|moto&status=PEPITE&minDays=15)
  api/score              ← POST une annonce ou un tableau → analyse (point d'entrée scraper / n8n)
  api/messages           ← POST génère le script, affinage optionnel par Claude
  api/outreach           ← POST message autonome pour une PÉPITE / un mandat J+15 (Make.com)
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
| Remise en état | − 350 € (detailing 80 € + petite méca) |
| Capital risque | − 200 € systématiques |
| **Marge nette** | Marge brute − 550 € |

Le bonus des options déclencheurs n'entre **jamais** dans la marge ni dans le statut : il est affiché à part comme « potentiel options » (argument de revente). Un **scénario négocié** est calculé en parallèle : prix cible = prix affiché − leviers de négo, puis déduction du coût réel des défauts.

**Statuts**

- 🔥 **PÉPITE POTENTIELLE** : marge nette > 1 000 € (citadines) ou > 2 000 € (compactes / premium) ; > 1 500 € en moto (paramètre ajustable)
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

**Leviers de négociation** : rayure −300 € (polish 90 €), carrosserie / calandre −500 €, pneus −250 €, plaquettes −150 €, jantes −250 € (rénovation 170 € HT), révision −200 €, kit chaîne moto −200 €. Le script demande une remise bornée entre 500 € et 1 000 €.

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

## Outreach autonome (Make.com)

`POST /api/outreach` prend une annonce et renvoie un message prêt à envoyer. L'annonce est **toujours re-scorée côté serveur**.

```json
{ "listing": { "...": "même format que /api/score" }, "strategy": "auto" }
```

| `strategy` | Comportement |
|---|---|
| `auto` (défaut) | PÉPITE → négociation ; J+15 → mandat ; les deux → la plus rentable (marge négociée vs revenu du mandat, mandat à égalité car zéro trésorerie) |
| `negotiation` | message de négo : défauts détectés, remise de 500 € à 1 000 €, paiement immédiat par virement instantané |
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
