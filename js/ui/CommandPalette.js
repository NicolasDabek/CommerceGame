/**
 * Palette de commandes (Ctrl+K ou K) : chercher un lieu, un objet, un marchand ou une action
 * et y aller au clavier (↑ ↓ Entrée, Échap).
 */
import { ITEMS } from '../data/items.js';
import { NPCS } from '../data/npcs.js';
import { PANEL_KEYS } from './Shortcuts.js';

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Filtre « tous les mots » sans accents ; les entrées dont le titre commence par la requête passent devant. */
export function filterCommands(commands, query, limit = 12) {
  const q = norm(query).trim();
  if (!q) return commands.filter(c => c.pinned).slice(0, limit);
  const words = q.split(/\s+/);
  return commands
    .map(c => {
      const hay = norm(`${c.title} ${c.keywords || ''}`);
      if (!words.every(w => hay.includes(w))) return null;
      const t = norm(c.title);
      const score = (t.startsWith(q) ? 0 : t.includes(q) ? 1 : 2) + (c.rank || 0);
      return { c, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(x => x.c);
}

export class CommandPalette {
  /**
   * @param {{game:object, actions:object}} options actions : openPanel(panel), searchIn(panel, text),
   *   toggleWatch(itemId), negotiateBest(itemId), openHelp(), openSettings(), togglePause(), openCredit()
   */
  constructor({ game, actions }) {
    this.game = game;
    this.actions = actions;
    this.el = document.createElement('div');
    this.el.className = 'palette-overlay';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="palette" role="dialog" aria-modal="true" aria-label="Palette de commandes">
        <input type="search" class="input palette-input" id="palette-input" placeholder="Chercher un lieu, un objet, un marchand, une action…" autocomplete="off" aria-controls="palette-list" />
        <ul class="palette-list" id="palette-list" role="listbox"></ul>
        <div class="palette-foot text-muted"><kbd>↑</kbd><kbd>↓</kbd> choisir · <kbd>Entrée</kbd> valider · <kbd>Échap</kbd> fermer</div>
      </div>`;
    document.body.appendChild(this.el);
    this.input = this.el.querySelector('#palette-input');
    this.list = this.el.querySelector('#palette-list');
    this.sel = 0;
    this.results = [];
    this.input.addEventListener('input', () => { this.sel = 0; this.render(); });
    this.input.addEventListener('keydown', (e) => this._key(e));
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    window.addEventListener('keydown', (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      const modal = !document.getElementById('modal-overlay')?.classList.contains('hidden');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.isOpen() ? this.close() : this.open(); return; }
      if (!typing && !modal && !e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyK' && !this.isOpen()) { e.preventDefault(); this.open(); }
    });
  }

  isOpen() { return !this.el.hidden; }

  commands() {
    const g = this.game;
    const a = this.actions;
    const cmds = [];
    PANEL_KEYS.forEach(p => cmds.push({ title: `Aller : ${p.label}`, icon: '🚪', hint: `touche ${p.key}`, keywords: `ouvrir lieu ${p.panel}`, pinned: true, run: () => a.openPanel(p.panel) }));
    cmds.push({ title: 'Pause / reprise du temps', icon: '⏯️', hint: 'P', keywords: 'pause temps vitesse', pinned: true, run: () => a.togglePause() });
    cmds.push({ title: 'Emprunter au Comptoir (crédit)', icon: '💶', keywords: 'credit pret emprunt banque', run: () => a.openCredit() });
    cmds.push({ title: 'Raccourcis clavier & aide', icon: '⌨️', hint: '?', keywords: 'aide help touches', run: () => a.openHelp() });
    cmds.push({ title: 'Affichage & accessibilité', icon: '👁️', keywords: 'taille texte contraste animations accessibilite reglages', pinned: true, run: () => a.openSettings() });
    cmds.push({ title: 'Notifications', icon: '🔔', keywords: 'notifications historique alertes', run: () => a.openNotes() });
    if (a.openRequests) cmds.push({ title: 'Demandes des marchands', icon: '📜', keywords: 'demandes commandes livrer requetes', run: () => a.openRequests() });
    for (const item of ITEMS) {
      const owned = g.inventory.count(item.id);
      const ins = g.getItemInsight(item.id);
      const kw = `${item.category} objet`;
      cmds.push({ title: `${item.name} — fiche dans la Halle des prix`, icon: item.icon, keywords: `${kw} prix halle marche`, hint: `${String(ins.average.toFixed(2)).replace('.', ',')} €`, rank: 0.2, run: () => a.searchIn('market', item.name) });
      if (ins.bestSell != null) cmds.push({ title: `Acheter ${item.name}`, icon: '🛒', keywords: `${kw} achat annonce`, hint: `dès ${String(ins.bestSell.toFixed(2)).replace('.', ',')} €`, rank: 0.4, run: () => a.searchIn('auction', item.name) });
      if (a.compare) cmds.push({ title: `Comparer les marchands : ${item.name}`, icon: '⚖️', keywords: `${kw} comparer comparateur marchands`, rank: 0.6, run: () => a.compare(item.id) });
      if (a.chart) cmds.push({ title: `Historique des prix : ${item.name}`, icon: '📈', keywords: `${kw} graphique courbe historique`, rank: 0.7, run: () => a.chart(item.id) });
      if (owned > 0) cmds.push({ title: `Vendre ${item.name} (${owned} en stock)`, icon: '💰', keywords: `${kw} vente offre d'achat`, hint: ins.bestBuy != null ? `jusqu'à ${String(ins.bestBuy.toFixed(2)).replace('.', ',')} €` : 'aucune offre', rank: 0.3, run: () => a.searchIn('buyhouse', item.name) });
      const best = g.getActiveSellOffers().filter(o => o.itemId === item.id && o.ownerId !== 'player' && o.ownerId !== 'city' && o.currentBid == null)
        .sort((x, y) => (x.buyoutPrice ?? x.price) - (y.buyoutPrice ?? y.price))[0];
      if (best) cmds.push({ title: `Négocier ${item.name} avec ${g.getNpcName(best.ownerId)}`, icon: '🤝', keywords: `${kw} marchander negocier`, rank: 0.5, run: () => a.negotiate(best.id) });
      cmds.push({ title: `${g.tradingDesk?.isWatched(item.id) ? 'Ne plus suivre' : 'Suivre'} ${item.name}`, icon: '★', keywords: `${kw} suivi alerte watch`, rank: 0.8, run: () => a.toggleWatch(item.id) });
    }
    for (const npc of NPCS) cmds.push({ title: `Marchand : ${npc.name}`, icon: '👤', keywords: `pnj ${npc.personality}`, rank: 0.6, run: () => a.openNpc(npc.id) });
    return cmds;
  }

  open() {
    this.all = this.commands();
    this.el.hidden = false;
    this.input.value = '';
    this.sel = 0;
    this.render();
    setTimeout(() => this.input.focus(), 0);
  }

  close() { this.el.hidden = true; this.input.blur(); }

  render() {
    this.results = filterCommands(this.all || [], this.input.value);
    this.list.innerHTML = this.results.length
      ? this.results.map((c, i) => `<li role="option" id="pal-${i}" aria-selected="${i === this.sel}" class="${i === this.sel ? 'sel' : ''}" data-i="${i}"><span class="pal-icon">${c.icon || ''}</span><span class="pal-title">${c.title}</span>${c.hint ? `<small class="text-muted">${c.hint}</small>` : ''}</li>`).join('')
      : '<li class="empty-state">Aucun résultat. Essayez un nom d\'objet (« pain »), un lieu (« atelier ») ou une action (« crédit »).</li>';
    this.input.setAttribute('aria-activedescendant', this.results.length ? `pal-${this.sel}` : '');
    this.list.querySelectorAll('[data-i]').forEach(li => {
      li.addEventListener('mousemove', () => { if (this.sel !== Number(li.dataset.i)) { this.sel = Number(li.dataset.i); this._mark(); } });
      li.addEventListener('click', () => this.exec(Number(li.dataset.i)));
    });
  }

  _mark() {
    this.list.querySelectorAll('[data-i]').forEach(li => {
      const on = Number(li.dataset.i) === this.sel;
      li.classList.toggle('sel', on);
      li.setAttribute('aria-selected', String(on));
      if (on) li.scrollIntoView({ block: 'nearest' });
    });
    this.input.setAttribute('aria-activedescendant', `pal-${this.sel}`);
  }

  _key(e) {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) e.stopPropagation(); // la place ne doit pas réagir
    if (e.key === 'ArrowDown') { e.preventDefault(); this.sel = Math.min(this.results.length - 1, this.sel + 1); this._mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.sel = Math.max(0, this.sel - 1); this._mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); this.exec(this.sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
  }

  exec(i) {
    const c = this.results[i];
    if (!c) return;
    this.close();
    c.run();
  }
}
