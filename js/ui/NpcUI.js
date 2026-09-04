import { getItemById } from '../data/items.js';
import { CLANS, getClanById } from '../data/npcs.js';

export class NpcUI {
  constructor(options = {}) {
    this.getProfiles = options.getProfiles || (() => []);
    this.resolveName = options.resolveName || ((id) => id);
    this.getAlliance = options.getAlliance || (() => null);
    this.getReputation = options.getReputation || (() => 0);
    this.onJoinClan = options.onJoinClan || null;
    this.onLeaveClan = options.onLeaveClan || null;
    this.root = document.getElementById('npc-grid');
  }

  render() {
    if (!this.root) return;
    const profiles = this.getProfiles();
    const alliance = this.getAlliance();
    const rep = this.getReputation();

    if (profiles.length === 0) {
      this.root.innerHTML = '<p class="text-muted">Aucun marchand.</p>';
      return;
    }

    const clanBlocks = CLANS.map(clan => {
      const members = profiles.filter(p => p.clanId === clan.id);
      const allied = alliance === clan.id;
      const rivalOfAlly = alliance && getClanById(alliance)?.rivalId === clan.id;
      const canJoin = !allied && rep >= (clan.joinRep || 8);
      return `
        <section class="clan-block" style="border-color:${clan.color}">
          <header class="clan-head">
            <div>
              <h3>${clan.icon} ${clan.name}</h3>
              <p class="text-muted">${clan.motto} · ${clan.specialty}</p>
            </div>
            <div class="clan-actions">
              ${allied ? '<span class="mini-chip">Allié</span>' : ''}
              ${rivalOfAlly ? '<span class="mini-chip">Rival</span>' : ''}
              ${allied
                ? `<button class="btn btn-small btn-ghost" data-leave-clan="1">Quitter</button>`
                : `<button class="btn btn-small ${canJoin ? '' : 'btn-ghost'}" data-join-clan="${clan.id}" ${canJoin ? '' : 'disabled'} title="Réputation ${clan.joinRep}+">${canJoin ? "S'allier" : `Rep. ${clan.joinRep}`}</button>`}
            </div>
          </header>
          <div class="npc-grid clan-members">
            ${members.map(p => this._renderCard(p, clan, allied)).join('')}
          </div>
        </section>
      `;
    }).join('');

    this.root.innerHTML = clanBlocks;
    this.root.querySelectorAll('[data-join-clan]').forEach(btn => {
      btn.addEventListener('click', () => this.onJoinClan && this.onJoinClan(btn.getAttribute('data-join-clan')));
    });
    this.root.querySelectorAll('[data-leave-clan]').forEach(btn => {
      btn.addEventListener('click', () => this.onLeaveClan && this.onLeaveClan());
    });
  }

  _renderCard(profile, clan, allied) {
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

    const trust = typeof profile.trust === 'number' ? profile.trust : 0;
    const trustLabel = trust > 0.3 ? 'vous fait confiance' : trust < -0.3 ? 'méfiant' : 'neutre';

    return `
      <article class="npc-card">
        <div class="npc-card-header">
          <div>
            <h3>${profile.name}</h3>
            <p>${profile.personality} · ${(profile.aggressiveness * 100).toFixed(0)}% · ${clan?.icon || ''} ${clan?.name || ''}</p>
          </div>
          <strong class="text-money">${this._formatMoney(profile.capital)} €</strong>
        </div>
        <p class="npc-description">${profile.description}</p>
        ${this._aiLine(profile, allied, trustLabel)}
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

  _aiLine(profile, allied, trustLabel) {
    const bits = [];
    if (profile.lastIntent) bits.push(`Dernière action : ${profile.lastIntent}`);
    if (profile.focusName) bits.push(`Focus : ${profile.focusName}`);
    if (typeof profile.mood === 'number') {
      const mood = profile.mood > 0.35 ? 'confiant' : profile.mood < -0.35 ? 'tendu' : 'calme';
      bits.push(`Humeur : ${mood}`);
    }
    bits.push(`Confiance : ${trustLabel}`);
    if (profile.rivalry > 0.45) bits.push('Rivalise avec vous');
    if (allied) bits.push('Clan allié');
    if (!bits.length) return '';
    return `<p class="text-muted" style="font-size:0.82rem;margin:6px 0 0">${bits.join(' · ')}</p>`;
  }

  _formatMoney(amount) {
    return Number(amount).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}
