# CommerceGame — Commerce Tycoon

Jeu de commerce inspiré des hôtels de vente de Dofus / Wakfu / Albion Online (hôtel d’achat, matching, enchères, économie dynamique).

Prototype solo avec PNJ. Le jeu se déroule sur **La Place**, une place de marché en 3D pixelisée (Three.js) : on y marche, on entre dans les bâtiments, et les tableaux (hôtels, marché, atelier…) s'ouvrent à l'intérieur.

## Démarrage

```bash
cd CommerceGame
python3 -m http.server 8080
```

Ouvre http://localhost:8080

Les modules ES ne fonctionnent pas en `file://`. Alternatives : `npm start` ou `npx serve .`

## Tests

```bash
npm test          # tests unitaires (économie, IA des PNJ, Comptoir, matching…) + test de stabilité sur 60 jours
npm run sim       # simulation headless de l'économie (120 jours, 3 graines)
npm run sim -- --days=365 --seeds=5 --every=30
npm run sim -- --json
```

La simulation fait tourner les 15 PNJ sans navigateur ni réseau (horloge virtuelle, hasard déterministe)
et affiche jour par jour le niveau des prix, la masse monétaire, la trésorerie du Comptoir, le stock et le volume.

## Déploiement

Le workflow GitHub Pages publie le site depuis `main`.
À activer une fois : Settings → Pages → GitHub Actions.

## Commerce — lire le marché

Les panneaux d'hôtel de vente / d'achat, de marché et d'inventaire affichent le **contexte prix** déjà calculé par le jeu (moyenne, haut/bas, dernière vente, carnet, stock, marge estimée) :

- **Hôtel de vente** : recherche, catégories, « meilleures offres », badge *Bonne affaire / Cher*, sac et bouton Acheter désactivé si capital insuffisant
- **Hôtel d'achat** : stock + marge vs votre coût moyen avant de vendre
- **Marché** : tri par opportunité (écart, bonne affaire, marge, volume) + sparklines
- **Inventaire** : fiche détail à droite, valeur estimée du sac, *Mettre en vente* / *Vendre à l'hôtel d'achat*
- **Modales** : boutons de quantité 1 / ½ / Max, fiche insight et aperçu des frais

## Économie — comment elle reste stable

- **Prix moyens corrigés** : une vente est ramenée à « qualité moyenne et conditions neutres » avant d'entrer dans la moyenne
  (sinon tendance, inflation et qualité s'appliquaient deux fois et les prix s'emballaient). Une vente absurde est amortie.
- **Retour à la normale** : chaque jour, les prix moyens se rapprochent de leur valeur de base (plus fort hors de la bande 60–180 %).
  Tendances de catégorie et inflation oscillent autour de 1, dans des bornes étroites.
- **Événements temporaires** : ils modifient les prix affichés le temps de leur durée (en jours de jeu), sans effet durable.
- **Comptoir municipal** (`js/systems/MarketReserve.js`) : encaisse la taxe de 3 % sur les ventes des PNJ, leurs frais d'annonce
  et leurs coûts de fabrication ; revend son stock quand un objet manque ou dépasse ~130 % de sa valeur normale ;
  rachète ce qui est bradé sous ~75 % ; réinjecte son excédent en commandes publiques (90 %) et en aides aux marchands à sec.
  Au-delà de 4 000 € de trésorerie, l'excédent est détruit (puits d'argent).
- **PNJ producteurs et consommateurs** : ils consomment une partie de leur stock (surtout la nourriture) et fabriquent
  sous leur stock cible, ce qui crée offre et demande en continu.
- **Lisibilité** : carte *Santé de l'économie* dans le Marché (niveau des prix, masse monétaire, Comptoir, activité),
  pastille dans la barre du haut, et pastille « pourquoi ce prix ? » sous chaque prix moyen.

## IA des marchands

Chaque PNJ raisonne à partir d'un **prix de référence** (60 % moyenne du marché + 40 % valeur normale, ajusté à la qualité) :
annonces bornées entre 78 % et 145 % de ce prix, achats plafonnés à 115 % (125 % pour un collectionneur sur ses favoris),
stock cible par personnalité, réaction aux pénuries et surplus, rivalité de clan, confiance envers le joueur,
budget d'actions quotidien et délai avant de remettre en vente un objet retiré. Les cartes Marchands affichent
la stratégie, la dernière intention **et sa raison**, la trésorerie, le stock vs cible, les besoins et la confiance.

## Monde 3D — contrôles

- **ZQSD** (AZERTY) / **WASD** (QWERTY) ou **flèches** : marcher (la caméra suit)
- **Clic** sur un bâtiment, un marchand ou soi-même : fiche d'infos (bouton *Entrer*)
- **E** (ou Entrée) près d'une porte, ou **double-clic** sur un bâtiment : entrer
- **Échap** ou *Sortir dans la rue* : revenir sur la place
- Souris : glisser pour tourner, clic droit pour déplacer, molette pour zoomer · **Recadrer** recentre sur le joueur

| Bâtiment | Ouvre |
|----------|-------|
| Hôtel de vente | Annonces et enchères |
| Hôtel d'achat | Offres d'achat |
| Halle des prix | Marché (prix moyens, tendances) |
| Atelier | Travail, établi, services PNJ |
| Votre échoppe | Inventaire |
| Maisons de clan (Circuit Nord, Forge Ouest, Halle Centrale, Atelier des rives) | Marchands et clans |

Tout est en local, sans CDN : Three.js r170 (`lib/three.module.js`, résolu par l'import map d'`index.html`) et les polices Nunito / Fredoka (`assets/fonts/`). Le jeu marche hors ligne.

## Contrôles de temps

- Pause, 1×, 10×, 60×
- À 1× : 10 minutes réelles = 1 jour de jeu
- Les durées d’annonces suivent le temps de jeu

Reset sauvegarde : bouton **Reset** ou `localStorage.clear(); location.reload();`

## Fonctionnalités

- Hôtel de vente : prix de départ, buyout, enchères (joueur + PNJ)
- Hôtel d’achat : offres multiples, capital bloqué, bouton Vendre
- Matching FIFO au prix de vente, surplus rendu à l’acheteur
- Économie : prix moyens, inflation, événements **réversibles**, Comptoir municipal régulateur, santé de l'économie
- 24 objets, 15 PNJ, objectifs, graphique de prix (sparkline)
- Sauvegarde localStorage plafonnée

## Structure

```
.
├── index.html
├── css/style.css     # + fonts.css (polices locales), world-override.css (HUD du monde 3D)
├── js/
│   ├── main.js
│   ├── core/          # Game, Economy, TimeManager, EventBus, Goals
│   ├── models/
│   ├── systems/
│   ├── ui/
│   ├── world/         # TownWorld (place 3D) + mount (branchement sur index.html)
│   ├── data/
│   └── utils/storage.js
├── scripts/           # sim.mjs + simCore.mjs (simulation headless de l'économie)
├── tests/
├── lib/               # Three.js r170, OrbitControls, Scene3D (voir lib/README.md)
└── assets/fonts/      # Nunito + Fredoka (woff2, licence OFL)
```

## Licence

MIT — voir `LICENSE`.
