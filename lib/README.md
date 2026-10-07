# lib/

Bibliothèques tierces pour Commerce Tycoon.

## Contenu

| Fichier | Description |
|---------|-------------|
| `OrbitControls.js` | Contrôles caméra orbitaux (importe `three`) |
| `Scene3D.js` | Helper pour initialiser une scène 3D rapidement |

Three.js r170 n'est pas copié ici : il est chargé depuis le CDN via l'import map
d'`index.html` (`"three": "https://unpkg.com/three@0.170.0/build/three.module.js"`).
Les fichiers de `lib/` importent donc `'three'` (et non `./three.module.js`).

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
