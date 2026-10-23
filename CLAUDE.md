# Règles du projet Pépite Radar

## Règle n°1 : ne rien inventer, tout sourcer

- **Aucun chiffre, tarif, taux, seuil, délai ou règle légale sans source.** Chaque valeur métier (coûts, cotisations, carte grise, assurance, délais de vente, négociation, fiscalité, démarches) doit citer sa source : lien vers un site officiel (service-public.fr, economie.gouv.fr, ANTS, SDES, URSSAF…) ou un professionnel du secteur (L'argus, négociants, comparateurs).
- **Source dans le code :** un commentaire à côté de la valeur dans `backend/config/rules.js` (ou `backend/config/crm.js`), et une ligne dans le tableau « Sources & hypothèses » du `README.md`.
- **Pas de source trouvée :** ne pas inventer de valeur. Le dire clairement, et soit demander à l'utilisateur, soit marquer la valeur « Choix métier » ou « À valider » dans le README.
- **Sources qui se contredisent :** donner la fourchette, préciser laquelle est retenue et pourquoi.
- **Sites commerciaux ou guides :** les signaler comme tels (pas d'étude officielle). Préférer une source officielle quand elle existe.
- **Estimations :** toujours les marquer comme estimations dans l'interface (« estimés », « médiane des annonces », « marge prudente »), jamais comme des faits.
- **Données de l'application :** le « prix marché » est la médiane des prix affichés d'annonces comparables. Ce n'est ni l'Argus ni un prix de vente réel, et il ne doit jamais être présenté comme tel.
- **Réponses à l'utilisateur :** citer les sources (liens) pour toute information factuelle ou réglementaire, et dire ce qui reste à vérifier (comptable, préfecture, devis d'assurance).

## Autres règles

- Ne jamais modifier une règle métier de l'utilisateur (formule de marge, seuils pépite, coûts) sans son accord explicite : proposer, sourcer, puis attendre sa validation.
- Les tests (`npm test`), `npx tsc --noEmit`, `npm run lint` et `npm run build` doivent passer avant chaque push.
