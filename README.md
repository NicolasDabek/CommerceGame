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
npm test
```

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
- Économie : prix moyens, inflation, événements **réversibles**
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
├── tests/
├── lib/               # Three.js r170, OrbitControls, Scene3D (voir lib/README.md)
└── assets/fonts/      # Nunito + Fredoka (woff2, licence OFL)
```

## Licence

MIT — voir `LICENSE`.
