# Pépite Radar : carnet de bord (règles, idées, chantiers)

Tout ce qu'on apprend en route est noté ici, puis construit. Règle du projet : rien n'est inventé, chaque valeur métier est sourcée dans `backend/config/rules.js` et dans le tableau « Sources & hypothèses » du `README.md`. Une règle métier (marge, seuils, coûts) ne change qu'avec l'accord de l'utilisateur.

Légende : ✅ fait · 🔨 en cours · 🟡 attend ton accord · 💡 idée à creuser · ⏰ rappel daté

## Chasse et données

- ✅ Chasses à 6 h, 12 h et 18 h (heure de Paris).
- ✅ Stockage Neon Postgres (le quota Vercel Blob était épuisé). Site et base à Washington (iad1), au même endroit.
- ✅ Lecture des annonces complètes par l'API (`/api/hunt/listing?id=` ou `?q=`, protégée par `CRON_SECRET`), sur les 4 derniers jours.
- 💡 Apify payant : 10 annonces par recherche en gratuit, c'est le principal frein au nombre de pépites.
- 💡 Garder les descriptions plus de 4 jours, pour les annonces suivies dans le CRM.
- ⏰ Remettre la chasse moto au printemps (`HUNT_TYPES=auto,moto`), rappel du 01/02/2027.

## Calcul de marge

- ✅ Marge calculée en particulier (`BUSINESS.status = 'particulier'`). Dire « passe en micro » une fois l'activité déclarée.
- ✅ Objectif 1 000 € **net** (pas brut). Budget à partir de 1 500 €, remise en état 350 € sous 5 000 €.
- ✅ Nouveaux leviers : débosselage sans peinture (−300 €, coût 80 €), disques + plaquettes (−400 €, coût 300 €).
- 💡 Jante unie à 70 € HT : le type de jante (unie ou bi-ton) ne se lit pas dans l'annonce, on garde 170 € (prudent).
- ✅ Offre « sous 24 h » dans les messages.
- ✅ Cote sur les **particuliers** seulement quand ils sont assez nombreux (sinon pros inclus, et c'est écrit dans les critères).
- 💡 Même règle pour la revente « chez toi » (rayon 100/200 km).

## Fiabilité, entretien, vendabilité

- ✅ PureTech 1.2 avant 2023 refusé systématiquement. Moteurs à surveiller : THP/Prince, 1.0 EcoBoost, EA111 TSI, BMW N47.
- ✅ Vendabilité : finition, options, couleur, annonce qui traîne, concurrence à la revente.
- ✅ Fiche entretien par moteur (45 moteurs) : courroie ou chaîne, échéance selon les sources, points faibles, questions au vendeur. Information seulement, sans effet sur le score.
- ✅ Pas de MASTERCLASS pour une finition d'entrée de gamme ou une voiture « risque de traîner ».
- 💡 Intervalles constructeur : les confirmer sur les carnets (aujourd'hui, sources secondaires « À valider »).
- 💡 Crit'Air / ZFE : non intégré tant que les sources se contredisent.

## Vendeur et type d'annonce

- ✅ Vendeur pro repéré (annonce leboncoin « Pro ») : rappel garantie, prix clé en main, frais de dossier.
- ✅ Voitures importées (USA, Japon, Allemagne, UE) : origine, papiers, homologation annoncée déduite, malus, miles, questions au vendeur, jamais MASTERCLASS.
- ✅ « Vendu en l'état » compte comme un risque (avertissement, jamais MASTERCLASS).
- À valider à la main : taux TARIC 8703 (USA, Japon), redevance RTI DREAL, tarif UTAC, délai légal d'un mois.

## Mandat, dépôt-vente, acheteurs

- ✅ Formulaire acheteurs `/cherche` (validation manuelle), alertes « annonce qui traîne » pour le mandat.
- ✅ Formulaire public `/vendre` : le vendeur laisse sa voiture, la demande arrive dans le CRM (Mandats) avec une alerte Telegram.
- 💡 Le mandat et le dépôt-vente supposent une activité déclarée : voir un comptable.

## Vendre (ta voiture ou ton stock)

- ✅ Page `/vente` : prix d'affichage (cote + 5 % de négo, ou prix ferme), plancher (quart bas des comparables), annonce honnête (chaque entretien avec sa preuve, repeinte dite), réponses types, papiers (CT < 6 mois, cession, non-gage, ANTS sous 15 jours).
- 💡 Enregistrer la vente dans le CRM (stock « En vente ») et suivre les acheteurs.

## Inspection photos

- ✅ Check-list gratuite. L'IA (clé Anthropic) ne se lance que sur un clic.
