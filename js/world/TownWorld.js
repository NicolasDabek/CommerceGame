/**
 * TownWorld — place de marché semi-3D pixelisée.
 * Volontairement cheap : cubes, couleurs plates, routines visibles.
 * Le monde reflète l'état du jeu (offres, clans, heure, intentions IA).
 */

import * as THREE from 'three';
import { OrbitControls } from '../../lib/OrbitControls.js';
import { NPCS, getClanById } from '../data/npcs.js';

const CLAN_HEX = {
  circuit: 0x3d8bfd,
  forge: 0xd97706,
  halle: 0x16a34a,
  atelier: 0xa855f7
};

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pixelMaterial(hex, noise = 18) {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const n = ((x * 3 + y * 7) % 5) - 2;
      const k = n * noise;
      ctx.fillStyle = `rgb(${clamp(r + k)},${clamp(g + k)},${clamp(b + k)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshLambertMaterial({ map: tex });
}

function clamp(n) {
  return Math.max(0, Math.min(255, n | 0));
}

function boxMesh(w, h, d, hex, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pixelMaterial(hex));
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export class TownWorld {
  constructor(container, game, options = {}) {
    this.container = container;
    this.game = game;
    this.onOpenPanel = options.onOpenPanel || (() => {});
    this.onInspect = options.onInspect || (() => {});

    this._running = false;
    this._agents = [];
    this._buildings = [];
    this._clickables = [];
    this._lastSync = 0;
    this._hour = 12;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 520;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x7ec8e3, 28, 70);

    const aspect = w / Math.max(1, h);
    const view = 18;
    this.camera = new THREE.OrthographicCamera(
      -view * aspect, view * aspect, view, -view, 0.1, 200
    );
    this.camera.position.set(22, 20, 22);
    this.camera.lookAt(0, 0.5, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setPixelRatio(1);
    this._cssSize(w, h);
    this.renderer.domElement.style.imageRendering = 'pixelated';
    this.renderer.domElement.style.imageRendering = 'crisp-edges';
    this.renderer.domElement.className = 'town-canvas';
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.target.set(0, 0.4, 0);
    this.controls.minZoom = 0.55;
    this.controls.maxZoom = 2.4;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minPolarAngle = Math.PI / 5;
    this.controls.enablePan = true;

    this.hemi = new THREE.HemisphereLight(0xfff1c9, 0x3a4a3a, 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3d0, 0.85);
    this.sun.position.set(12, 18, 8);
    this.scene.add(this.sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this._buildTown();
    this._spawnPeople();

    this._onResize = () => this.resize();
    this._onClick = (e) => this._handleClick(e);
    window.addEventListener('resize', this._onResize);
    this.renderer.domElement.addEventListener('pointerdown', this._onClick);
  }

  _cssSize(w, h) {
    const scale = 0.5;
    this.renderer.setSize(Math.max(2, Math.floor(w * scale)), Math.max(2, Math.floor(h * scale)), false);
    const el = this.renderer.domElement;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }

  _buildTown() {
    const ground = boxMesh(42, 0.4, 42, 0x6aa84f, 0, -0.2, 0);
    this.scene.add(ground);

    const plaza = boxMesh(16, 0.12, 16, 0xc4b59a, 0, 0.05, 0);
    this.scene.add(plaza);
    const cobble = boxMesh(6, 0.08, 6, 0xb09a7a, 0, 0.12, 0);
    this.scene.add(cobble);

    this._addFountain();
    this._addTrees();
    this._addPath(-14, 0, 12, 1.4);
    this._addPath(0, -14, 1.4, 12);
    this._addPath(14, 0, 12, 1.4);
    this._addPath(0, 14, 1.4, 12);

    const defs = [
      { id: 'auction', name: 'Hôtel de vente', panel: 'auction', x: 0, z: -16, w: 6.2, d: 5.2, h: 5.2, color: 0xb85c38, roof: 0x6b2d1a },
      { id: 'buyhouse', name: "Hôtel d'achat", panel: 'buyhouse', x: 0, z: 16, w: 6.2, d: 5.2, h: 4.4, color: 0x3d6b8a, roof: 0x1f3d52 },
      { id: 'workshop', name: 'Atelier', panel: 'jobs', x: -16, z: 0, w: 5.4, d: 5.4, h: 3.6, color: 0x8a6a3d, roof: 0x4a3518 },
      { id: 'market', name: 'Halle des prix', panel: 'market', x: 16, z: 0, w: 5.6, d: 5.2, h: 3.8, color: 0x4a7c59, roof: 0x244832 },
      { id: 'player', name: 'Votre échoppe', panel: 'inventory', x: -8.5, z: 8.5, w: 3.6, d: 3.4, h: 2.8, color: 0xc9a227, roof: 0x6c5ce7 },
      { id: 'circuit', name: 'Circuit Nord', panel: 'npcs', x: -13, z: -13, w: 4.2, d: 4.2, h: 3.2, color: 0x3d8bfd, roof: 0x1b4f9a, clan: 'circuit' },
      { id: 'forge', name: 'Forge Ouest', panel: 'npcs', x: 13, z: -13, w: 4.2, d: 4.2, h: 3.2, color: 0xd97706, roof: 0x7a3e04, clan: 'forge' },
      { id: 'halle', name: 'Halle Centrale', panel: 'npcs', x: -13, z: 13, w: 4.2, d: 4.2, h: 3.0, color: 0x16a34a, roof: 0x14532d, clan: 'halle' },
      { id: 'atelier', name: 'Atelier des rives', panel: 'npcs', x: 13, z: 13, w: 4.2, d: 4.2, h: 3.2, color: 0xa855f7, roof: 0x5b21b6, clan: 'atelier' }
    ];

    defs.forEach((def) => this._addBuilding(def));
    this._addStalls();
  }

  _addFountain() {
    const group = new THREE.Group();
    group.add(boxMesh(2.4, 0.5, 2.4, 0x8d99ae, 0, 0.3, 0));
    group.add(boxMesh(1.6, 0.7, 1.6, 0x4cc9f0, 0, 0.7, 0));
    group.add(boxMesh(0.35, 1.6, 0.35, 0xcbd5e1, 0, 1.4, 0));
    group.userData = { kind: 'decor', name: 'Fontaine de la place' };
    this.scene.add(group);
  }

  _addTrees() {
    const spots = [
      [-18, -6], [-18, 6], [18, -6], [18, 6],
      [-6, -18], [6, -18], [-6, 18], [6, 18],
      [-19, -19], [19, 19]
    ];
    spots.forEach(([x, z], i) => {
      const g = new THREE.Group();
      g.add(boxMesh(0.35, 1.1, 0.35, 0x5c4033, 0, 0.55, 0));
      const leaf = i % 2 === 0 ? 0x2d6a4f : 0x40916c;
      g.add(boxMesh(1.4, 1.3, 1.4, leaf, 0, 1.6, 0));
      g.add(boxMesh(0.9, 0.8, 0.9, 0x1b4332, 0, 2.4, 0));
      g.position.set(x, 0, z);
      this.scene.add(g);
    });
  }

  _addPath(x, z, w, d) {
    this.scene.add(boxMesh(w, 0.06, d, 0xd6c4a8, x, 0.04, z));
  }

  _addBuilding(def) {
    const g = new THREE.Group();
    g.position.set(def.x, 0, def.z);
    const body = boxMesh(def.w, def.h, def.d, def.color, 0, def.h / 2, 0);
    body.userData = { kind: 'building', id: def.id, name: def.name, panel: def.panel, clan: def.clan };
    g.add(body);
    const roof = boxMesh(def.w + 0.5, 0.7, def.d + 0.5, def.roof, 0, def.h + 0.35, 0);
    roof.userData = body.userData;
    g.add(roof);
    const door = boxMesh(0.9, 1.3, 0.2, 0x3b2a1a, 0, 0.7, def.d / 2 + 0.05);
    g.add(door);
    g.add(boxMesh(0.7, 0.7, 0.08, 0xfff3b0, -def.w * 0.28, def.h * 0.55, def.d / 2 + 0.04));
    g.add(boxMesh(0.7, 0.7, 0.08, 0xfff3b0, def.w * 0.28, def.h * 0.55, def.d / 2 + 0.04));
    if (def.id === 'player') {
      g.add(boxMesh(1.6, 0.7, 0.12, 0x6c5ce7, 0, def.h + 1.0, 0.2));
    }
    this.scene.add(g);
    this._buildings.push({ ...def, group: g, mesh: body });
    this._clickables.push(body, roof);
  }

  _addStalls() {
    const spots = [
      [-4.2, -5.2], [4.2, -5.2], [-4.2, 5.2], [4.2, 5.2],
      [-5.4, 0], [5.4, 0]
    ];
    this.stalls = [];
    spots.forEach(([x, z]) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.add(boxMesh(1.8, 0.45, 1.2, 0x8d6e4c, 0, 0.35, 0));
      g.add(boxMesh(2.0, 0.12, 1.4, 0xc1121f, 0, 1.35, 0));
      g.add(boxMesh(0.12, 1.1, 0.12, 0x5c4033, -0.85, 0.85, -0.5));
      g.add(boxMesh(0.12, 1.1, 0.12, 0x5c4033, 0.85, 0.85, -0.5));
      this.scene.add(g);
      this.stalls.push(g);
    });
  }

  _spawnPeople() {
    this._agents = [];
    NPCS.forEach((npc, index) => {
      const color = CLAN_HEX[npc.clanId] || 0x888888;
      const group = new THREE.Group();
      const body = boxMesh(0.46, 0.62, 0.32, color, 0, 0.55, 0);
      const head = boxMesh(0.38, 0.38, 0.38, 0xf1c27d, 0, 1.05, 0);
      group.add(body);
      group.add(head);
      const home = this._buildingById(npc.clanId) || this._buildingById('market');
      const start = this._doorOf(home);
      group.position.set(start.x + (index % 5) * 0.35, 0, start.z + Math.floor(index / 5) * 0.35);
      group.userData = { kind: 'npc', id: npc.id, name: npc.name, clan: npc.clanId };
      body.userData = group.userData;
      head.userData = group.userData;
      this.scene.add(group);
      this._clickables.push(body, head);
      this._agents.push({
        npc,
        group,
        target: group.position.clone(),
        wait: Math.random() * 2,
        speed: 1.15 + npc.aggressiveness * 1.1,
        bob: Math.random() * Math.PI * 2
      });
    });

    const you = new THREE.Group();
    you.add(boxMesh(0.5, 0.7, 0.34, 0x6c5ce7, 0, 0.55, 0));
    you.add(boxMesh(0.4, 0.4, 0.4, 0xf1c27d, 0, 1.1, 0));
    const shop = this._buildingById('player');
    const door = this._doorOf(shop);
    you.position.set(door.x + 0.8, 0, door.z + 0.6);
    you.userData = { kind: 'player', id: 'player', name: 'Vous' };
    you.children.forEach((c) => { c.userData = you.userData; this._clickables.push(c); });
    this.scene.add(you);
    this.playerToken = you;
  }

  _buildingById(id) {
    return this._buildings.find((b) => b.id === id) || null;
  }

  _doorOf(building) {
    if (!building) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(building.x, 0, building.z + building.d / 2 + 1.1);
  }

  _hourOfDay() {
    const tm = this.game?.timeManager;
    if (!tm) return 12;
    const ms = tm.gameTimeMs % tm.msPerGameDay;
    return (ms / tm.msPerGameDay) * 24;
  }

  _routineTarget(npc) {
    const hour = this._hour;
    const personality = npc.personality;
    let key = npc.clanId;
    if (hour >= 21 || hour < 6) key = npc.clanId;
    else if (hour < 9) key = personality === 'artisan' ? 'workshop' : npc.clanId;
    else if (hour < 12) key = 'auction';
    else if (hour < 15) key = personality === 'épicier' ? 'market' : 'buyhouse';
    else if (hour < 18) {
      if (personality === 'artisan') key = 'workshop';
      else if (personality === 'collectionneur') key = 'auction';
      else key = 'market';
    } else key = npc.clanId;

    const offers = this.game?.offers || [];
    const ownSell = offers.some((o) => o.ownerId === npc.id && o.type === 'sell' && o.status === 'active');
    const ownBuy = offers.some((o) => o.ownerId === npc.id && o.type === 'buy' && o.status === 'active');
    if (ownSell && hour >= 8 && hour < 17) key = 'auction';
    if (ownBuy && hour >= 11 && hour < 18 && personality !== 'épicier') key = 'buyhouse';

    const b = this._buildingById(key) || this._buildingById('market');
    const door = this._doorOf(b);
    const jitter = ((hashHue(npc.id) % 17) - 8) * 0.12;
    return new THREE.Vector3(door.x + jitter, 0, door.z + jitter * 0.4);
  }

  _applyDaylight() {
    const h = this._hour;
    let sky = 0x7ec8e3;
    let sunI = 0.85;
    let hemiI = 0.95;
    let fog = 0x7ec8e3;
    if (h < 5.5 || h >= 21) {
      sky = 0x1b2436; sunI = 0.15; hemiI = 0.35; fog = 0x1b2436;
    } else if (h < 7.5) {
      sky = 0xf4a261; sunI = 0.45; hemiI = 0.6; fog = 0xe76f51;
    } else if (h >= 19) {
      sky = 0xe76f51; sunI = 0.4; hemiI = 0.55; fog = 0xc44536;
    }
    this.scene.background = new THREE.Color(sky);
    this.scene.fog.color.setHex(fog);
    this.sun.intensity = sunI;
    this.hemi.intensity = hemiI;
    const ang = ((h - 6) / 12) * Math.PI;
    this.sun.position.set(Math.cos(ang) * 16, Math.max(3, Math.sin(ang) * 18), 8);
  }

  sync() {
    this._hour = this._hourOfDay();
    this._applyDaylight();
    const profiles = typeof this.game.getNpcProfiles === 'function' ? this.game.getNpcProfiles() : [];
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    this._agents.forEach((agent) => {
      const profile = byId[agent.npc.id];
      agent.intent = profile?.lastIntent || null;
      agent.mood = profile?.mood ?? 0;
      if (agent.wait <= 0) {
        agent.target.copy(this._routineTarget(agent.npc));
        agent.wait = 3 + Math.random() * 6;
      }
    });
    const shop = this._buildingById('player');
    if (shop && this.playerToken) {
      const door = this._doorOf(shop);
      this.playerToken.position.lerp(new THREE.Vector3(door.x + 1.0, 0, door.z + 0.4), 0.02);
    }
  }

  _handleClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this._clickables, false);
    if (!hits.length) return;
    const data = hits[0].object.userData || {};
    if (data.kind === 'building' && data.panel) {
      this.onInspect({ type: 'building', id: data.id, name: data.name, panel: data.panel });
      this.onOpenPanel(data.panel);
    } else if (data.kind === 'npc') {
      const agent = this._agents.find((a) => a.npc.id === data.id);
      this.onInspect({
        type: 'npc',
        id: data.id,
        name: data.name,
        clan: data.clan,
        intent: agent?.intent,
        mood: agent?.mood
      });
    } else if (data.kind === 'player') {
      this.onInspect({ type: 'player', name: 'Votre échoppe' });
      this.onOpenPanel('inventory');
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    this.sync();
    let last = performance.now();
    const loop = (now) => {
      if (!this._running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this._tick(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this._updateLabels();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _tick(dt) {
    this._hour = this._hourOfDay();
    if (performance.now() - this._lastSync > 900) {
      this._lastSync = performance.now();
      this.sync();
    }
    this._agents.forEach((agent) => {
      agent.wait -= dt;
      const pos = agent.group.position;
      const dx = agent.target.x - pos.x;
      const dz = agent.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.12) {
        const step = agent.speed * dt;
        pos.x += (dx / dist) * Math.min(step, dist);
        pos.z += (dz / dist) * Math.min(step, dist);
        agent.group.rotation.y = Math.atan2(dx, dz);
        agent.bob += dt * 10;
        agent.group.position.y = Math.abs(Math.sin(agent.bob)) * 0.08;
      } else {
        agent.group.position.y = 0;
      }
    });
  }

  _updateLabels() {
    const layer = document.getElementById('town-labels');
    if (!layer) return;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const bits = [];
    const project = (obj, yOff) => {
      const v = obj.getWorldPosition(new THREE.Vector3());
      v.y += yOff;
      v.project(this.camera);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    };
    this._buildings.forEach((b) => {
      const p = project(b.group, b.h + 0.8);
      if (p.x < 8 || p.y < 8 || p.x > w - 8 || p.y > h - 8) return;
      bits.push(`<span class="town-label building" style="left:${p.x}px;top:${p.y}px">${b.name}</span>`);
    });
    this._agents.forEach((agent) => {
      const p = project(agent.group, 1.6);
      if (p.x < 8 || p.y < 8 || p.x > w - 8 || p.y > h - 8) return;
      const extra = agent.intent ? `<i>${agent.intent}</i>` : '';
      bits.push(`<span class="town-label npc" style="left:${p.x}px;top:${p.y}px">${agent.npc.name}${extra}</span>`);
    });
    layer.innerHTML = bits.join('');
  }

  resize() {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 520;
    const aspect = w / Math.max(1, h);
    const view = 18;
    this.camera.left = -view * aspect;
    this.camera.right = view * aspect;
    this.camera.top = view;
    this.camera.bottom = -view;
    this.camera.updateProjectionMatrix();
    this._cssSize(w, h);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.domElement.removeEventListener('pointerdown', this._onClick);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
