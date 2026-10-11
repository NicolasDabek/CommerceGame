/**
 * Centre de notifications : tout ce qui s'est passé pendant que vous regardiez ailleurs
 * (ventes et achats faits par les marchands sur vos offres, alertes de prix, crédit, chapitres…).
 * Stocké localement (50 dernières), séparé de la sauvegarde.
 */
const KEY = 'commerce_tycoon_notes';
const MAX = 50;

export const NOTE_KINDS = {
  deal: { label: 'Affaires', icon: '💶' },
  alert: { label: 'Alertes', icon: '🔔' },
  event: { label: 'Événements', icon: '📣' }
};

export function classifyStatus(text) {
  if (/^🔔|alerte|pénurie/i.test(text)) return 'alert';
  if (/crédit|vendu|acheté|contrat|commande|marché conclu|accord/i.test(text)) return 'deal';
  return 'event';
}

export class NotificationCenter {
  constructor({ getTimeLabel = () => '', onOpenPanel = () => {} } = {}) {
    this.getTimeLabel = getTimeLabel;
    this.onOpenPanel = onOpenPanel;
    this.filter = 'all';
    try { this.items = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { this.items = []; }
    if (!Array.isArray(this.items)) this.items = [];
    this.btn = document.getElementById('btn-notes');
    this.badge = document.getElementById('notes-badge');
    this.panel = document.getElementById('notes-panel');
    this.btn?.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    document.addEventListener('click', (e) => {
      if (this.panel && !this.panel.hidden && !this.panel.contains(e.target) && e.target !== this.btn) this.close();
    });
    this.updateBadge();
  }

  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.items.slice(0, MAX))); } catch (e) { /* ignore */ } }

  push({ text, kind = null, icon = null, panel = null }) {
    if (!text) return;
    const k = kind || classifyStatus(text);
    const top = this.items[0];
    if (top && top.text === text && Date.now() - top.at < 4000) return; // doublon immédiat
    this.items.unshift({ id: `n${Date.now()}${Math.floor(Math.random() * 1000)}`, text, kind: k, icon: icon || NOTE_KINDS[k]?.icon || '•', panel, at: Date.now(), time: this.getTimeLabel(), read: false });
    if (this.items.length > MAX) this.items.length = MAX;
    this._save();
    this.updateBadge();
    if (this.panel && !this.panel.hidden) this.render();
  }

  unread() { return this.items.filter(n => !n.read).length; }

  updateBadge() {
    const n = this.unread();
    if (this.badge) { this.badge.textContent = n > 9 ? '9+' : String(n); this.badge.hidden = n === 0; }
    if (this.btn) this.btn.setAttribute('aria-label', `Notifications (${n} non lue${n > 1 ? 's' : ''})`);
  }

  toggle() { if (this.panel?.hidden) this.open(); else this.close(); }
  open() { if (!this.panel) return; this.panel.hidden = false; this.render(); this.panel.querySelector('button')?.focus(); }
  close() { if (this.panel) this.panel.hidden = true; }

  markAllRead() { this.items.forEach(n => { n.read = true; }); this._save(); this.updateBadge(); this.render(); }
  clear() { this.items = []; this._save(); this.updateBadge(); this.render(); }

  render() {
    if (!this.panel) return;
    const list = this.items.filter(n => this.filter === 'all' || n.kind === this.filter);
    const chips = [['all', 'Tout'], ...Object.entries(NOTE_KINDS).map(([k, v]) => [k, `${v.icon} ${v.label}`])]
      .map(([k, l]) => `<button class="chip-btn ${this.filter === k ? 'active' : ''}" data-note-filter="${k}">${l}</button>`).join('');
    this.panel.innerHTML = `
      <div class="notes-head">
        <strong>Notifications</strong>
        <div><button class="btn btn-small btn-ghost" data-note-act="read">Tout marquer lu</button> <button class="btn btn-small btn-ghost" data-note-act="clear">Effacer</button></div>
      </div>
      <div class="notes-filters">${chips}</div>
      <ul class="notes-list">${list.length ? list.map(n => `
        <li class="${n.read ? '' : 'unread'}" ${n.panel ? `data-note-panel="${n.panel}" tabindex="0" role="button"` : ''}>
          <span class="note-icon">${n.icon}</span>
          <span class="note-text">${n.text}</span>
          <small class="text-muted">${n.time || ''}</small>
        </li>`).join('') : '<li class="empty-state">Rien de neuf. Les ventes faites par les marchands sur vos offres, vos alertes de prix et les échéances de crédit apparaîtront ici.</li>'}</ul>`;
    this.panel.querySelectorAll('[data-note-filter]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); this.filter = b.dataset.noteFilter; this.render(); }));
    this.panel.querySelector('[data-note-act="read"]')?.addEventListener('click', (e) => { e.stopPropagation(); this.markAllRead(); });
    this.panel.querySelector('[data-note-act="clear"]')?.addEventListener('click', (e) => { e.stopPropagation(); this.clear(); });
    this.panel.querySelectorAll('[data-note-panel]').forEach(li => {
      const go = () => { this.close(); this.onOpenPanel(li.dataset.notePanel); };
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
    // ouvrir = lu
    let changed = false;
    this.items.forEach(n => { if (!n.read) { n.read = true; changed = true; } });
    if (changed) { this._save(); this.updateBadge(); }
  }
}
