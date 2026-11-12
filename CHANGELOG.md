# Changelog

Toutes les évolutions notables de Commerce Tycoon. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage [sémantique](https://semver.org/lang/fr/). Les « passes » GD (game design) et UX sont mesurées
par la simulation headless (`npm run sim -- --csv`, 20 graines appariées) et les audits Playwright (réseau externe bloqué).

## [Non publié]

### Ajouté
- **GD passe 13 — rang 5 « Maison reconnue »** : charte définitive du Comptoir, accordée au rang 4 après 7 000 € de chiffre
  d'affaires et 3 gros contrats du Comptoir livrés à temps, sans crédit en retard. Avantages modérés : crédit 3 000 € à 0,7 %/jour,
  un 3ᵉ ordre permanent, gros contrats tous les 10 jours. Avancement affiché dans Parcours → Rang. L'ancien rang 4 devient
  « 🎖️ Négociant établi ». Sauvegardes 1.0.0 compatibles (champ `houseCharter` facultatif).
- **Sollicitation ciblée du Comptoir** : un objet sans annonce depuis 9 jours est remis en vente par le marchand qui en garde le plus
  (ou confié depuis la réserve du Comptoir, payé à la valeur normale). Aucun argent créé.
- **Prêt gagé** : la part d'un contrat déjà en stock au moment d'emprunter baisse le taux de 0,3 point/jour au prorata
  (plancher 0,2 %/jour), si le prêt est remboursé à temps.
- Simulation : colonnes `haggle_discount_mean_pct`, `haggle_discount_median_pct`, `rank2_day` à `rank5_day`, `rank5_share` ;
  rapport `reports/gd13.{md,csv}` (lots A et B, 40 graines, avant / après) via `scripts/gd13Collect.mjs` et `scripts/gd13Report.mjs`.

### Modifié
- Cible du marchandage : « rabais médian de 3 à 6 % du prix » remplace « 0,9 à 1,1 € par accord » (décision de Nicolas).
- Tests resserrés : pénuries ≤ 12 jours vérifiées sur 20 graines (3 auparavant) et pour chaque robot ; subventions ≤ 20 k€ aussi
  graine par graine ; test du crédit du trader sur 20 graines appariées ; garde-fou bas de l'apport du crédit à l'hybride 1,10 → 1,15.

### Écarts connus (reports/gd13.md)
- Apport du crédit au trader « garde son stock » : 1,05–1,08 pour une cible ≥ 1,12, incompatible avec « garde » ≤ 1,35.
- 1,38 accord marchandé par jour pour une cible ≥ 1,5.

## [1.0.0] — 2026-11-11

Première version stable : jeu complet, 100 % local (aucun CDN), sauvegardes versionnées.

### Ajouté
- **Sauvegarde versionnée** : champs `saveVersion` (format 1) et `gameVersion`, migration des sauvegardes 0.x
  (`js/core/game/saveMigration.js`), copie de secours avant migration, sauvegarde illisible mise de côté
  (`commerce_tycoon_save_corrupt`) au lieu d'être perdue, sauvegarde d'une version future chargée au mieux.
- **Version affichée** dans l'aide (touche ?) et le menu Plus (`js/version.js`).
- **GD passe 12 — marchandise gagée** : tant qu'un prêt adossé à un contrat court, les clients d'étal ne demandent pas
  l'objet de ce contrat (🔒 affiché dans le panneau Marchands) ; le gage est levé au remboursement.
- Tests : `tests/save.test.js` (format, migration, sauvegarde illisible, effacement), marchandise gagée ;
  audit Playwright de version (nouvelle partie, sauvegarde/rechargement, migration, fin de parcours, console, réseau).
- Rapport `reports/gd12-hybride.{md,csv}` ; le CSV de simulation inclut la variante « garde son stock ».

### Modifié
- **GD passe 12 — anti-flip à l'étal activé** (revente le jour même → le client lâche au plus 3 %), en plus du gage :
  hybride « garde son stock » ×1,38 → ×1,33 l'honnête (≤ 1,35), apport du crédit à l'hybride +7 % → +14 % (+17 % sur 40 graines),
  marchandeur ×1,22 → ×1,26 (bande 1,20–1,35). Test « garde son stock » resserré de 1,5 × à 1,35 ×.
- `package.json` : version 1.0.0, licence, auteur, dépôt, page d'accueil, moteur Node ≥ 18.
- README : état 1.0.0, nombre d'objets (15), effacement de la sauvegarde, structure (CSS découpé, version, migrations).

### Corrigé
- **« Effacer la sauvegarde »** appelait `localStorage.clear()` : sur GitHub Pages l'origine `nicolasdabek.github.io`
  est partagée, ce qui effaçait aussi les données des autres jeux. Seules les clés de Commerce Tycoon sont effacées.

## Historique 0.x (prototype)

### 2026-11-09 — UX passe 11, GD passe 11
- UX 11 : piège de focus palette et menu Plus (`js/ui/focusTrap.js`, `aria-modal`, retour du focus), contrastes AA
  (`.btn-success`, `.deal-bad`, texte discret de la palette), survols sous `@media (hover: hover)`.
- GD 11 : visite des clients d'étal sauvegardée (migration GD10), scénario trader hybride (crédit + étal), paiements PNJ
  contrôlés, vente d'étal informée (coût connu ou « inconnu », bénéfice net, expiration, confirmation de vente à perte),
  branche « approvisionneur » aux rangs 3/4, anti-flip mesuré (désactivé), expérience « petits consommables » (désactivée).

### 2026-11-07 — Refactorisation
- `css/style.css` découpé en 6 feuilles (concaténation identique), `Negotiation.js` allégé (`negotiation/tuning.js`,
  `negotiation/dialogue.js`) — aucun changement de comportement (CSV de simulation identique).

### 2026-11-01 → 2026-11-06 — GD passes 6 à 10, UI/UX passes 6 à 8
- GD 6 : gros contrats bridés avec aléa de livraison, marchandage (maxFlex 7 %), taxe d'étal.
- GD 7 : lassitude allégée, ajustements rangs 3/4, colonnes CSV de marchandage.
- GD 8 : mesures sur 10 graines + IC95, achat-revente bridé, maxFlex 6 %, lassitude affichée, correctif de rang entre parties.
- GD 9 : livraisons comptées comme ventes, objectifs recalibrés (3 500 €, 800 €, 12 000 €), réputation des objectifs en XP dès le rang 2.
- GD 10 : clients d'étal qui marchandent (rang 2+), humeur du marchand affichée, objectifs « ventes marchandées ».
- UI/UX 6–8 : bandeau d'actualité, étiquettes PNJ limitées, lisibilité mobile.

### 2026-10-16 → 2026-10-30 — Refonte UI/UX, GD passes 1 à 5
- Refonte UI/UX (en-tête mobile, carte de quête, barre à 5 onglets + « Plus », cibles 44 px, texte ≥ 12 px), audits UX 2, 4, 5.
- Équilibrage GD 1–5 : Comptoir moins interventionniste, commandes publiques, marchandage bridé, crédit adossé aux contrats,
  gros contrats à crédit, tests déterministes.
- Revue : suppression d'EventBus, échappement HTML unique, découpage de Game / JobBoard / NPCController en sous-modules.

### 2026-10-07 → 2026-10-13 — v3 à v7
- Monde 3D intégré à `index.html` ; **tout en local** : Three.js r170 et polices embarqués, plus aucun CDN.
- Interfaces d'analyse du commerce, économie stabilisée, Comptoir municipal, IA des PNJ.
- Offre et demande, métiers, atelier minuté, suivi & ordres permanents.
- v5 : marchandage, crédit du Comptoir, rangs & parcours, vente groupée / achat partiel, raccourcis.
- v6 : marchandage en plusieurs tours, esprit des marchands. v7 : arguments au marchandage, carnet, comparateur,
  historique des prix, demandes des marchands, mobile.

### 2026-08-24 → 2026-09-05 — Prototype
- Hôtels de vente et d'achat, matching, enchères PNJ (paliers, plafond d'achat immédiat), objectifs.
- Travail : contrats, tournée, étal, atelier progressif, réparation, services PNJ, démantèlement.
- IA PNJ (scoring du marché, humeur, rivalité), réputation, frais dynamiques, clans.
- Place de marché 3D pixelisée, licence MIT, CI de tests, déploiement GitHub Pages.

[1.0.0]: https://github.com/NicolasDabek/CommerceGame/releases/tag/v1.0.0
