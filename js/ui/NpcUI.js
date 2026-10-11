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
    this.getHaggle = options.getHaggle || null;
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

    return `
      <article class="npc-card" id="npc-card-${profile.id}">
        <div class="npc-card-header">
          <div>
            <h3>${profile.name}</h3>
            <p>${profile.personality} · ${(profile.aggressiveness * 100).toFixed(0)}% · ${clan?.icon || ''} ${clan?.name || ''}</p>
            ${profile.strategy ? `<p class="npc-strategy" title="${profile.strategyText || ''}">🎯 ${profile.strategy}</p>` : ''}
            ${profile.profession ? `<p class="npc-strategy npc-profession" title="${profile.professionText || ''}">${profile.professionIcon || ''} ${profile.profession}${profile.repaired ? ` · ${profile.repaired} réparé(s)` : ''}${profile.arbitrages ? ` · ${profile.arbitrages} arbitrage(s)` : ''}</p>` : ''}
          </div>
          <strong class="text-money">${this._formatMoney(profile.capital)} €</strong>
        </div>
        <p class="npc-description">${profile.description}</p>
        ${this._intentBox(profile)}
        ${this._mindBox(profile)}
        ${this._statusChips(profile, trust)}
        ${this._aiLine(profile, allied)}
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
          <h4>Annonces actives</h4>
          <div class="npc-tags">${this._offerChips(profile) || '<span class="text-muted">Aucune</span>'}</div>
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


  _offerChips(profile) {
    const offers = (profile.activeOffers || []).slice(0, 4);
    if (!offers.length) return '';
    return offers.map(o => {
      const item = getItemById(o.itemId);
      const kind = o.type === 'sell' ? 'vend' : 'achète';
      const price = o.type === 'sell'
        ? (o.buyoutPrice ?? o.currentBid ?? o.price)
        : o.price;
      return `<span class="mini-chip" title="${kind} ×${o.quantity}">${item?.icon || ''} ${kind} ${this._formatMoney(price)} €</span>`;
    }).join('');
  }

  /** Ce que fait le marchand et pourquoi (phrase courte). */
  _intentBox(profile) {
    if (!profile.lastIntent) {
      return '<div class="npc-intent"><span class="text-muted">Observe le marché…</span></div>';
    }
    const journal = (profile.journal || []).slice(0, -1).slice(-3).reverse();
    const title = journal.length ? `Avant : ${journal.join(' · ')}` : '';
    return `
      <div class="npc-intent" title="${title}">
        <strong>${profile.lastIntent}</strong>
        ${profile.lastReason ? `<small>${profile.lastReason}</small>` : ''}
      </div>
    `;
  }

  /** Objectif du jour, bilan sur 7 jours, ce qu'il a appris, rival, style de marchandage. */
  _mindBox(profile) {
    const m = profile.mind;
    if (!m) return '';
    const eur = (n) => `${n >= 0 ? '+' : ''}${this._formatMoney(n)} €`;
    const series = m.pnlSeries || [];
    const max = Math.max(1, ...series.map(v => Math.abs(v)));
    const spark = series.map(v => `<i class="${v >= 0 ? 'up' : 'down'}" style="height:${Math.max(8, Math.round(Math.abs(v) / max * 100))}%" title="${eur(v)}"></i>`).join('');
    const style = profile.haggleStyle;
    return `
      <div class="npc-mind">
        <div class="npc-goal" title="Objectif choisi chaque matin selon sa trésorerie, son stock et les besoins de la ville">
          <span class="npc-goal-icon">${m.goal.icon}</span>
          <div><strong>${m.goal.label}</strong><small>${m.goal.reason}</small></div>
        </div>
        <div class="npc-mind-row">
          ${m.pnlDays ? `<span class="mini-chip ${m.pnl7 >= 0 ? 'chip-good' : 'chip-bad'}" title="Variation de sa valeur (trésorerie + stock) sur les ${m.pnlDays} derniers jours">📈 ${m.pnlDays} j : ${eur(m.pnl7)}</span><span class="npc-spark" aria-hidden="true">${spark}</span>` : '<span class="mini-chip">📈 bilan demain</span>'}
          ${m.lesson ? `<span class="mini-chip" title="Il ajuste ses priorités selon ce qui lui a rapporté (ou coûté) ces derniers jours">🧠 Apprend : ${m.lesson}</span>` : ''}
          ${m.cautious ? '<span class="mini-chip chip-warn" title="Après des pertes, il paie un peu moins cher (jusqu\'à −1,8 %)">🛡️ Prudent après des pertes</span>' : ''}
          ${m.rivalName ? `<span class="mini-chip chip-warn" title="Ils se sont souvent surenchéris ou cassé les prix : il cherche à le battre">⚔️ Rival : ${m.rivalName}</span>` : ''}
          ${style ? `<span class="mini-chip" title="Style de marchandage : ${style.text}">${style.icon} ${style.label}</span>` : ''}
        </div>
      </div>`;
  }

  /** Trésorerie, stock vs cible, besoins, confiance — lisibles d'un coup d'œil. */
  _statusChips(profile, trust) {
    const chips = [];
    if (profile.capitalLabel) {
      const cls = profile.capitalState === 'dry' ? 'chip-bad' : profile.capitalState === 'tight' ? 'chip-warn' : 'chip-good';
      chips.push(`<span class="mini-chip ${cls}" title="Argent disponible par rapport à son capital de départ">💰 ${profile.capitalLabel}</span>`);
    }
    if (profile.stockTarget != null) {
      const cls = profile.stockLabel === 'Stock bas' ? 'chip-warn' : profile.stockLabel === 'Stock trop plein' ? 'chip-warn' : 'chip-good';
      chips.push(`<span class="mini-chip ${cls}" title="Il fabrique ou rachète sous sa cible, il brade au-dessus">📦 ${profile.stock}/${profile.stockTarget} · ${profile.stockLabel}</span>`);
    }
    if (profile.needs && profile.needs.length) {
      chips.push(`<span class="mini-chip" title="Objets de sa spécialité qu'il n'a plus : il les paiera un peu plus cher">Cherche ${profile.needs.map(n => n.icon).join(' ')}</span>`);
    }
    const pct = Math.round(Math.max(-1, Math.min(1, trust)) * 100);
    const trustWord = trust > 0.3 ? ' · vous fait confiance' : trust < -0.3 ? ' · méfiant' : '';
    chips.push(`<span class="mini-chip trust-chip" title="Monte quand vous commercez avec lui à prix correct. Plus elle est haute, plus il accepte vos offres facilement.">🤝 Confiance ${pct > 0 ? '+' : ''}${pct}${trustWord}</span>`);
    const haggle = this.getHaggle?.(profile.id);
    if (haggle) {
      const cls = haggle.triesLeft === 0 || haggle.dealsLeft === 0 ? 'chip-warn' : '';
      chips.push(`<span class="mini-chip ${cls}" title="Marchandage (bouton 🤝 Négocier dans les hôtels de vente et d'achat) : propositions restantes aujourd'hui et accords encore possibles. Le nombre d'essais dépend de votre rang ; tout se recharge chaque jour.">🗣️ ${haggle.triesLeft}/${haggle.triesPerDay} essais · ${haggle.dealsLeft} accord${haggle.dealsLeft > 1 ? 's' : ''}</span>`);
    }
    if (profile.actionBudget) {
      chips.push(`<span class="mini-chip" title="Nombre d'actions de marché aujourd'hui / maximum">⏱ ${profile.actionsToday}/${profile.actionBudget} actions</span>`);
    }
    return `<div class="npc-tags npc-status">${chips.join('')}</div>`;
  }

  _aiLine(profile, allied) {
    const bits = [];
    if (profile.focusName) bits.push(`Focus : ${profile.focusName}`);
    if (typeof profile.mood === 'number') {
      const mood = profile.mood > 0.35 ? 'confiant' : profile.mood < -0.35 ? 'tendu' : 'calme';
      bits.push(`Humeur : ${mood}`);
    }
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
