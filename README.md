# CommerceGame — Commerce Tycoon

Jeu de commerce inspiré des hôtels de vente de Dofus / Wakfu / Albion Online (hôtel d’achat, matching, enchères, économie dynamique).

Prototype solo avec PNJ. Interface 2D. Architecture prête pour un backend et un monde 3D.

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
├── css/style.css
├── js/
│   ├── main.js
│   ├── core/          # Game, Economy, TimeManager, EventBus, Goals
│   ├── models/
│   ├── systems/
│   ├── ui/
│   ├── data/
│   └── utils/storage.js
├── tests/
└── lib/               # Scene3D + OrbitControls (Three.js en CDN)
```

## Licence

MIT — voir `LICENSE`.
