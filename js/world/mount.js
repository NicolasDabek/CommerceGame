import { TownWorld } from './TownWorld.js';
import { enhanceGame } from '../core/GamePatch.js';
import { getClanById } from '../data/npcs.js';

function hideLegacyPanels() {
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.remove('active');
    p.style.setProperty('display', 'none', 'important');
  });
  document.getElementById('interior-overlay')?.classList.remove('open');
}

function setStatus(text) {
  const status = document.getElementById('status-message');
  if (status) status.textContent = text;
}

/* Clavier du monde inactif si un panneau, une modale ou un champ de saisie a le focus */
function isInputBlocked() {
  if (document.getElementById('interior-overlay')?.classList.contains('open')) return true;
  const modal = document.getElementById('modal-overlay');
  if (modal && !modal.classList.contains('hidden')) return true;
  const el = document.activeElement;
  return !!el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
}

function inspect(info) {
  const el = document.getElementById('town-inspect');
  if (!el) return;
  if (!info) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  let html = `<h3>${info.name || 'Lieu'}</h3>`;
  if (info.type === 'npc') {
    const clan = getClanById(info.clan);
    html += `<p>${clan ? `${clan.icon} ${clan.name}` : 'Sans clan'}</p><p>${info.intent || 'En ville'}</p>`;
  } else if (info.type === 'building') {
    html += '<p>Porte ouverte. Double-clic ou E à proximité pour entrer.</p>';
  } else {
    html += "<p>C'est vous. ZQSD pour marcher.</p>";
  }
  if (info.panel) {
    const label = info.type === 'player' ? 'Ouvrir le sac' : 'Entrer';
    html += `<button class="btn btn-primary btn-small" data-enter-panel="${info.panel}">${label}</button>`;
  }
  html += ' <button class="btn btn-ghost btn-small" data-close-inspect>Fermer</button>';
  el.innerHTML = html;
  el.querySelector('[data-enter-panel]')?.addEventListener('click', () => window.showWorldPanel?.(info.panel));
  el.querySelector('[data-close-inspect]')?.addEventListener('click', () => {
    el.hidden = true;
    window.townWorld?.clearSelection();
  });
  setStatus(info.name || '');
}

function wireHud(game, world) {
  document.querySelectorAll('.dock-btn[data-panel]').forEach((btn) => {
    btn.addEventListener('click', () => window.showWorldPanel?.(btn.dataset.panel));
  });
  document.getElementById('btn-exit-interior')?.addEventListener('click', () => window.showWorldPanel?.('town'));
  document.getElementById('btn-town-recenter')?.addEventListener('click', () => world.recenter());
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
  hideLegacyPanels();
  if (!window.game) {
    requestAnimationFrame(mount);
    return;
  }
  const host = document.getElementById('town-canvas-host');
  if (!host) {
    requestAnimationFrame(mount);
    return;
  }
  if (window.townWorld) {
    hideLegacyPanels();
    requestAnimationFrame(() => window.townWorld.resize?.());
    return;
  }
  enhanceGame(window.game);
  const world = new TownWorld(host, window.game, {
    onOpenPanel: (panel) => window.showWorldPanel?.(panel),
    onInspect: inspect,
    onStatus: setStatus,
    isInputBlocked
  });
  world.start();
  requestAnimationFrame(() => world.resize());
  setTimeout(() => world.resize(), 200);
  window.townWorld = world;
  wireHud(window.game, world);
  hideLegacyPanels();
  window.addEventListener('panel-changed', (ev) => {
    if (ev.detail?.panel === 'town') {
      hideLegacyPanels();
      requestAnimationFrame(() => world.resize());
    } else {
      world.clearKeys();
    }
  });
}

hideLegacyPanels();
mount();
