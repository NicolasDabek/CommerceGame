# lib/

Bibliothèques tierces pour Commerce Tycoon.

## Contenu

| Fichier | Description |
|---------|-------------|
| `three.module.js` | Three.js r170 (ES module) |
| `OrbitControls.js` | Contrôles caméra orbitaux |
| `Scene3D.js` | Helper pour initialiser une scène 3D rapidement |

## Utilisation future (monde 3D)

```js
import { Scene3D } from '../lib/Scene3D.js';

const container = document.getElementById('canvas-3d');
const scene3d = new Scene3D(container);
scene3d.start();

// Ajouter des objets :
import { THREE } from '../lib/Scene3D.js';
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x6c5ce7 })
);
scene3d.scene.add(mesh);
```

Pour l’instant le prototype reste en interface 2D pure.
