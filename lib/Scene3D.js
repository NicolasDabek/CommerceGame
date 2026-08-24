/**
 * Scene3D — Helper minimal pour initialiser une scène Three.js
 * Prêt pour quand on ajoutera le monde 3D plus tard.
 *
 * Usage :
 *   import { Scene3D } from '../lib/Scene3D.js';
 *   const scene3d = new Scene3D(containerElement);
 *   scene3d.start();
 */

import * as THREE from './three.module.js';
import { OrbitControls } from './OrbitControls.js';

export class Scene3D {
  /**
   * @param {HTMLElement} container - Élément DOM qui accueille le canvas
   * @param {Object} [options]
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      background: options.background ?? 0x1a1d27,
      antialias: options.antialias ?? true,
      ...options
    };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.background);

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    this.camera.position.set(5, 5, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: this.options.antialias });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Lumières de base
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 5);
    this.scene.add(dir);

    // Grille de référence (debug)
    const grid = new THREE.GridHelper(20, 20, 0x6c5ce7, 0x3d4458);
    this.scene.add(grid);

    this._running = false;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  start() {
    if (this._running) return;
    this._running = true;
    const loop = () => {
      if (!this._running) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  resize() {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}

export { THREE };
