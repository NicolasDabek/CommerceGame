import { TownWorld } from './TownWorld.js';
import { enhanceGame } from '../core/GamePatch.js';

function inspect(info) {
  const el = document.getElementById('town-inspect');
  const status = document.getElementById('status-message');
  if (!el || !info) return;
  el.hidden = false;
  if (info.type === 'npc') {
    el.innerHTML = `<h3>${info.name}</h3><p>Clan ${info.clan || '?'}</p><p>${info.intent || 'En ville'}</p>`;
  } else {
    el.innerHTML = `<h3>${info.name || 'Lieu'}</h3><p>${info.type === 'building' ? 'Porte ouverte.' : "C'est chez vous."}</p>`;
  }
  if (status) status.textContent = info.name || '';
}

function wireHud(game, world) {
  document.querySelectorAll('.dock-btn[data-panel]').forEach((btn) => {
    btn.addEventListener('click', () => window.showWorldPanel?.(btn.dataset.panel));
  });
  document.getElementById('btn-exit-interior')?.addEventListener('click', () => window.showWorldPanel?.('town'));
  document.getElementById('btn-town-recenter')?.addEventListener('click', () => world.focusPlaza?.());
  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      game.timeManager.setSpeed(Number(btn.dataset.speed));
      document.querySelectorAll('.speed-btn').forEach((b) => b.classList.toggle('active', b === btn));
      game.timeManager.updateUI();
    });
  });
  document.getElementById('btn-reset-save')?.addEventListener('click', () => {
    if (confirm('Effacer la sauvegarde ?')) {
      localStorage.clear();
      location.reload();
    }
  });
}

function mount() {
  if (!window.game) {
    requestAnimationFrame(mount);
    return;
  }
  const host = document.getElementById('town-canvas-host');
  if (!host || window.townWorld) return;
  enhanceGame(window.game);
  const world = new TownWorld(host, window.game, {
    onOpenPanel: (panel) => window.showWorldPanel?.(panel),
    onInspect: inspect
  });
  world.start();
  requestAnimationFrame(() => world.resize());
  window.townWorld = world;
  wireHud(window.game, world);
  window.addEventListener('panel-changed', (ev) => {
    if (ev.detail?.panel === 'town') requestAnimationFrame(() => world.resize());
  });
}

mount();
