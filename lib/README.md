# lib/

Bibliothèques tierces pour Commerce Tycoon.

## Contenu

| Fichier | Description |
|---------|-------------|
| `three.module.js` | Three.js r170 (ES module), copie de `build/three.module.js` du paquet npm `three@0.170.0` |
| `three.LICENSE` | Licence MIT de Three.js |
| `OrbitControls.js` | Contrôles caméra orbitaux (`examples/jsm/controls/OrbitControls.js` de `three@0.170.0`, importe `three`) |
| `Scene3D.js` | Helper pour initialiser une scène 3D rapidement |

Aucun CDN : tout est servi en local. L'import map d'`index.html` fait pointer
`'three'` vers `./lib/three.module.js`, et les modules (`TownWorld`, `OrbitControls`,
`Scene3D`) importent `'three'` : il n'y a qu'une seule instance de Three.js.

Pour mettre à jour Three.js, remplacer `three.module.js` et `OrbitControls.js` par les
fichiers de la même version du paquet npm (`npm pack three@<version>`), puis mettre à jour ce tableau.

## Utilisation

Le monde 3D du jeu est `js/world/TownWorld.js`, monté par `js/world/mount.js`.
`Scene3D` reste disponible pour des scènes simples :

```js
import * as THREE from 'three';
import { Scene3D } from '../lib/Scene3D.js';

const scene3d = new Scene3D(document.getElementById('canvas-3d'));
scene3d.start();
scene3d.scene.add(new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x6c5ce7 })
));
```
