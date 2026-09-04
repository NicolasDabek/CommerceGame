import { getItemById } from '../data/items.js';

export class NpcUI {
  constructor(options = {}) {
    this.getProfiles = options.getProfiles || (() => []);
    this.resolveName = options.resolveName || ((id) => id);
    this.root = document.getElementById('npc-grid');
  }

  render() {
    if (!this.root) return;
    const profiles = this.getProfiles();

    if (profiles.length === 0) {
      this.root.innerHTML = '<p class="text-muted">Aucun marchand.</p>';
      return;
    }

    this.root.innerHTML = profiles.map(profile => this._renderCard(profile)).join('');
  }

  _renderCard(profile) {
    const inventoryQty = profile.inventory.reduce((sum, slot) => sum + slot.quantity, 0);
    const topInventory = profile.inventory.slice(0, 3).map(slot => {
      const item = getItemById(slot.itemId);
      return `<span class="mini-chip">${item?.icon || ''} ${item?.name || slot.itemId} x${slot.quantity}</span>`;
    }).join('');

    const recent = profile.transactions.slice(0, 3).map(tx => {
      const item = getItemById(tx.itemId);
      const verb = tx.sellerId === profile.id ? 'vendu a' : 'achete a';
      const other = tx.sellerId === profile.id ? tx.buyerId : tx.sellerId;
      return `<li>${item?.icon || ''} ${verb} ${this.resolveName(other)} · ${this._formatMoney(tx.total)} €</li>`;
    }).join('');

    return `
      <article class="npc-card">
        <div class="npc-card-header">
          <div>
            <h3>${profile.name}</h3>
            <p>${profile.personality} · activite ${(profile.aggressiveness * 100).toFixed(0)}%</p>
          </div>
          <strong class="text-money">${this._formatMoney(profile.capital)} €</strong>
        </div>
        <p class="npc-description">${profile.description}</p>
        ${profile.lastIntent ? `<p class="text-muted" style="font-size:0.82rem;margin:6px 0 0">Dernière action : ${profile.lastIntent}</p>` : ''}
        <div class="npc-tags">
          ${profile.preferredCategories.map(cat => `<span class="mini-chip">${cat}</span>`).join('')}
        </div>
        <div class="npc-stats">
          <span>Stock: ${inventoryQty}</span>
          <span>Offres: ${profile.activeOffers.length}</span>
          <span>Ventes: ${this._formatMoney(profile.sold)} €</span>
          <span>Achats: ${this._formatMoney(profile.bought)} €</span>
        </div>
        <div class="npc-section">
          <h4>Inventaire connu</h4>
          <div class="npc-tags">${topInventory || '<span class="text-muted">Vide</span>'}</div>
        </div>
        <div class="npc-section">
          <h4>Derniers mouvements</h4>
          <ul class="npc-history">${recent || '<li class="text-muted">Aucun mouvement</li>'}</ul>
        </div>
      </article>
    `;
  }

  _formatMoney(amount) {
    return Number(amount).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}
