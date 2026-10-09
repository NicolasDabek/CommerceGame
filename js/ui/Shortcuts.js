/**
 * Raccourcis clavier + aide (touche ?).
 * Inactifs pendant une saisie (champ texte, liste) ; la modale garde Échap / Entrée.
 */

export const PANEL_KEYS = [
  { key: '1', panel: 'inventory', label: 'Sac' },
  { key: '2', panel: 'auction', label: 'Hôtel de vente' },
  { key: '3', panel: 'buyhouse', label: 'Hôtel d\'achat' },
  { key: '4', panel: 'market', label: 'Halle des prix' },
  { key: '5', panel: 'jobs', label: 'Atelier' },
  { key: '6', panel: 'npcs', label: 'Marchands' },
  { key: '7', panel: 'trading', label: 'Suivi, alertes, crédit' },
  { key: '8', panel: 'goals', label: 'Parcours & rang' },
  { key: '9', panel: 'history', label: 'Carnet' }
];

const SEARCH_BY_PANEL = { auction: 'auction-search', buyhouse: 'buy-search', market: 'market-search', history: 'filter-item' };
const NEW_BY_PANEL = { auction: 'btn-new-sell', buyhouse: 'btn-new-buy' };

function isTyping() {
  const el = document.activeElement;
  return !!el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
}

function modalOpen() {
  const m = document.getElementById('modal-overlay');
  return !!m && !m.classList.contains('hidden');
}

export class Shortcuts {
  /**
   * @param {{Modal:object, prefs:object, setStatus:Function, onPrefsReset:Function, onShowHud:Function}} options
   */
  constructor(options = {}) {
    this.Modal = options.Modal;
    this.prefs = options.prefs;
    this.setStatus = options.setStatus || (() => {});
    this.onPrefsReset = options.onPrefsReset || (() => {});
    this.onShowHud = options.onShowHud || (() => {});
    this.current = 'town';
    this._lastSpeed = null;
    window.addEventListener('panel-changed', (e) => { if (e.detail?.panel) this.current = e.detail.panel; });
    window.addEventListener('keydown', (e) => this._onKey(e));
    // Indique les raccourcis sur les boutons du dock
    document.querySelectorAll('.dock-btn[data-panel]').forEach(btn => {
      const k = PANEL_KEYS.find(p => p.panel === btn.dataset.panel);
      if (k) btn.title = `${btn.title ? btn.title + ' — ' : ''}touche ${k.key}`;
    });
  }

  _onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (modalOpen() || isTyping()) return;
    const open = (panel) => {
      if (this.current === panel) window.showWorldPanel?.('town');
      else window.showWorldPanel?.(panel);
    };
    const entry = PANEL_KEYS.find(p => p.key === e.key);
    if (entry && !e.repeat) { e.preventDefault(); open(entry.panel); return; }
    if (e.key === '?' || (e.code === 'KeyH' && !e.repeat)) { e.preventDefault(); this.openHelp(); return; }
    if (e.key === '/' && SEARCH_BY_PANEL[this.current]) {
      e.preventDefault();
      document.getElementById(SEARCH_BY_PANEL[this.current])?.focus();
      return;
    }
    if (e.code === 'KeyN' && NEW_BY_PANEL[this.current] && !e.repeat) {
      e.preventDefault();
      document.getElementById(NEW_BY_PANEL[this.current])?.click();
      return;
    }
    if (e.code === 'KeyP' && !e.repeat) {
      e.preventDefault();
      this.togglePause();
    }
  }

  togglePause() {
    const btns = [...document.querySelectorAll('.speed-btn')];
    const active = btns.find(b => b.classList.contains('active'));
    const speed = active ? active.dataset.speed : '10';
    if (speed === '0') {
      const back = btns.find(b => b.dataset.speed === (this._lastSpeed || '10'));
      back?.click();
      this.setStatus('Reprise du temps');
    } else {
      this._lastSpeed = speed;
      btns.find(b => b.dataset.speed === '0')?.click();
      this.setStatus('Pause — touche P pour reprendre');
    }
  }

  openHelp() {
    const rows = PANEL_KEYS.map(p => `<tr><td><kbd>${p.key}</kbd></td><td>${p.label}</td></tr>`).join('');
    this.Modal.open({
      title: '⌨️ Raccourcis clavier',
      bodyHTML: `
        <table class="data-table compact-table shortcut-table">
          <tbody>
            ${rows}
            <tr><td><kbd>Z Q S D</kbd> / flèches</td><td>Marcher sur la place</td></tr>
            <tr><td><kbd>E</kbd> / <kbd>Entrée</kbd></td><td>Entrer dans le bâtiment le plus proche</td></tr>
            <tr><td><kbd>Échap</kbd></td><td>Ressortir dans la rue / fermer</td></tr>
            <tr><td><kbd>/</kbd></td><td>Rechercher dans le lieu ouvert</td></tr>
            <tr><td><kbd>N</kbd></td><td>Nouvelle annonce (Hôtel de vente) ou offre d'achat (Hôtel d'achat)</td></tr>
            <tr><td><kbd>P</kbd></td><td>Pause / reprise du temps</td></tr>
            <tr><td><kbd>?</kbd> ou <kbd>H</kbd></td><td>Cette aide</td></tr>
          </tbody>
        </table>
        <p class="text-muted" style="margin-top:10px">Vos filtres, tris et onglets sont mémorisés d'une visite à l'autre.</p>`,
      buttons: [
        { label: 'Réafficher la carte Parcours et les astuces', className: 'btn-ghost', onClick: () => {
          this.prefs.set('hudHidden', false); this.prefs.set('tipsSeen', []); this.prefs.set('tipsOff', false);
          this.onShowHud(); this.Modal.close(); this.setStatus('Carte Parcours et astuces réactivées');
        } },
        { label: 'Oublier les filtres mémorisés', className: 'btn-ghost', onClick: () => {
          this.onPrefsReset(); this.Modal.close(); this.setStatus('Filtres réinitialisés');
        } },
        { label: 'Fermer', className: 'btn-primary', onClick: () => this.Modal.close() }
      ]
    });
  }
}
