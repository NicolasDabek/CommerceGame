/**
 * Interface — Suivi & ordres : liste de suivi + alertes, ordres d'achat permanents, bilan (P&L).
 */
import { ITEMS } from '../data/items.js';
import { formatMoney, formatPct, supplyChipHtml } from './TradeInsights.js';

const signed = (n) => {
  const v = Number(n || 0);
  const cls = v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-muted';
  return `<span class="${cls}">${v > 0 ? '+' : ''}${formatMoney(v)} €</span>`;
};

function itemOptions(selected) {
  return ITEMS.map(i => `<option value="${i.id}" ${i.id === selected ? 'selected' : ''}>${i.icon} ${i.name}</option>`).join('');
}

function priceInput(value) {
  return value != null ? Number(value).toFixed(2) : '';
}

export class TradingUI {
  constructor(options = {}) {
    this.getView = options.getView || (() => null);
    this.getFair = options.getFair || (() => 0);
    this.actions = options.actions || {};
    this.root = document.getElementById('trading-root');
    this.badgeEl = document.getElementById('trading-badge');
    this.tab = 'watch';
  }

  updateBadge(view = this.getView()) {
    if (!this.badgeEl || !view) return;
    this.badgeEl.textContent = view.unread ? String(view.unread) : '';
    this.badgeEl.hidden = !view.unread;
  }

  render() {
    const view = this.getView();
    if (!view) return;
    this.updateBadge(view);
    if (!this.root) return;
    // Ne pas effacer une saisie en cours (rafraîchissement automatique)
    const active = document.activeElement;
    if (active && this.root.contains(active) && /^(INPUT|SELECT)$/.test(active.tagName)) return;
    const tabs = `
      <div class="tabs trading-tabs">
        <button class="tab ${this.tab === 'watch' ? 'active' : ''}" data-tr-tab="watch">Suivi &amp; alertes${view.unread ? ` <span class="dock-badge">${view.unread}</span>` : ''}</button>
        <button class="tab ${this.tab === 'orders' ? 'active' : ''}" data-tr-tab="orders">Ordres permanents (${view.activeOrders}/${view.orderSlots})</button>
        <button class="tab ${this.tab === 'journal' ? 'active' : ''}" data-tr-tab="journal">Bilan</button>
      </div>`;
    let body = '';
    if (this.tab === 'orders') body = this._orders(view);
    else if (this.tab === 'journal') body = this._journal(view);
    else body = this._watch(view);
    this.root.innerHTML = tabs + body;
    this._wire();
  }

  _watch(view) {
    const rows = view.watch.map(w => `
      <tr data-watch-row="${w.itemId}">
        <td>${w.item.icon} ${w.item.name}<br><small class="text-muted">${w.item.category}</small></td>
        <td class="text-money">${formatMoney(w.fair)} €<br><small class="${w.changePct >= 0 ? 'text-success' : 'text-danger'}" title="Évolution de la valeur normale depuis que vous suivez l'objet">${formatPct(w.changePct)} depuis l'ajout</small></td>
        <td><span title="Annonce la moins chère">vente ${w.bestSell != null ? `<strong>${formatMoney(w.bestSell)} €</strong>` : '—'}</span>${w.dealPct != null && w.dealPct >= 5 ? ` <small class="text-success">(−${w.dealPct} %)</small>` : ''}<br><small class="text-muted" title="Offre d'achat la mieux payée">achat ${w.bestBuy != null ? `${formatMoney(w.bestBuy)} €` : '—'}</small></td>
        <td>${supplyChipHtml(w.supply)}</td>
        <td class="alert-inputs">
          <label title="Prévenez-moi quand une annonce passe sous ce prix">achat ≤ <input class="input input-xs" type="number" step="0.01" min="0" data-alert-below placeholder="${formatMoney(w.fair * 0.9)}" value="${priceInput(w.alertBelow)}" /></label>
          <label title="Prévenez-moi quand une offre d'achat dépasse ce prix">vente ≥ <input class="input input-xs" type="number" step="0.01" min="0" data-alert-above placeholder="${formatMoney(w.fair * 1.1)}" value="${priceInput(w.alertAbove)}" /></label>
        </td>
        <td class="nowrap">
          <button class="btn btn-small btn-primary" data-tr="save-alert" data-item="${w.itemId}">Enregistrer</button>
          <button class="btn btn-small btn-ghost" data-tr="unwatch" data-item="${w.itemId}" title="Retirer de la liste">✕</button>
        </td>
      </tr>`).join('');
    const alerts = view.alerts.map(a => `
      <li class="alert-item ${a.read ? '' : 'unread'} alert-${a.kind}"><span class="text-muted">J${a.day}</span> ${a.text}</li>`).join('');
    return `
      <p class="trade-hint text-muted">Suivez jusqu'à ${view.watchMax} objets (★ dans la Halle des prix). Une alerte se déclenche une fois quand le seuil est franchi, et aussi quand un objet suivi tombe en pénurie.</p>
      <div class="trading-add">
        <select class="select" id="watch-item">${itemOptions()}</select>
        <button class="btn btn-small btn-primary" data-tr="watch">★ Suivre</button>
      </div>
      <div class="trading-layout">
        <div class="table-container">
          <table class="data-table" id="watch-table">
            <thead><tr><th>Objet</th><th>Valeur normale</th><th>Carnet</th><th>Offre / demande</th><th title="Une alerte quand une annonce passe sous votre prix d'achat, ou quand une offre d'achat dépasse votre prix de vente">Alertes</th><th></th></tr></thead>
            <tbody>${rows || '<tr class="empty-row"><td colspan="6">Aucun objet suivi — cliquez ★ Suivre</td></tr>'}</tbody>
          </table>
        </div>
        <aside class="alert-log">
          <div class="goal-head"><h3>🔔 Alertes</h3>${view.unread ? '<button class="btn btn-small btn-ghost" data-tr="read">Tout marquer lu</button>' : ''}</div>
          <ul>${alerts || '<li class="text-muted">Aucune alerte pour l\'instant.</li>'}</ul>
        </aside>
      </div>`;
  }

  _orders(view) {
    const firstFair = this.getFair(ITEMS[0].id);
    const rows = view.orders.map(o => {
      const status = !o.active ? '<span class="text-muted">En pause</span>'
        : o.live ? `<span class="text-success">Offre active · reste ${o.live.quantity}</span>`
          : o.lastError ? `<span class="text-danger" title="${o.lastError}">Non placée : fonds insuffisants</span>`
            : '<span class="text-muted">Rempli — renouvelé demain</span>';
      return `
        <tr data-order-row="${o.id}">
          <td>${o.item.icon} ${o.item.name}</td>
          <td class="text-money">${formatMoney(o.price)} €<br><small class="${o.vsFairPct <= 0 ? 'text-success' : 'text-warning'}">${o.vsFairPct > 0 ? '+' : ''}${o.vsFairPct} % vs normale</small></td>
          <td>${o.quantity} / jour${o.minQuality ? `<br><small class="text-muted">Q${o.minQuality}+</small>` : ''}</td>
          <td>${status}</td>
          <td>${o.filledTotal} reçus${o.avgPrice != null ? `<br><small class="text-muted">moy. ${formatMoney(o.avgPrice)} €</small>` : ''}</td>
          <td><small>bloqué ${formatMoney(o.locked)} €<br>frais ${formatMoney(o.dailyFee)} € / jour</small></td>
          <td class="nowrap">
            <button class="btn btn-small ${o.active ? 'btn-ghost' : 'btn-primary'}" data-tr="toggle-order" data-id="${o.id}">${o.active ? 'Pause' : 'Reprendre'}</button>
            <button class="btn btn-small btn-ghost" data-tr="remove-order" data-id="${o.id}" title="Supprimer (l'offre du jour est annulée et remboursée)">✕</button>
          </td>
        </tr>`;
    }).join('');
    return `
      <p class="trade-hint text-muted">Un ordre permanent place chaque jour une offre d'achat d'1 jour à votre prix (argent bloqué + frais d'annonce). Idéal pour constituer du stock pendant un surplus et revendre en pénurie. Places : ${view.orderSlots} (plus avec le métier Négociant).</p>
      <div class="trading-add order-form">
        <label>Objet <select class="select" id="so-item">${itemOptions()}</select></label>
        <label>Prix unitaire (€) <input class="input input-xs" type="number" id="so-price" step="0.01" min="0.01" value="${(firstFair * 0.95).toFixed(2)}" /></label>
        <label>Qté / jour <input class="input input-xs" type="number" id="so-qty" min="1" max="10" value="2" /></label>
        <label>État min. <input class="input input-xs" type="number" id="so-minq" min="0" max="90" value="0" /></label>
        <button class="btn btn-small btn-primary" data-tr="add-order" ${view.activeOrders >= view.orderSlots ? 'disabled' : ''}>Créer l'ordre</button>
        <small class="text-muted" id="so-hint"></small>
      </div>
      <div class="table-container">
        <table class="data-table" id="orders-table">
          <thead><tr><th>Objet</th><th>Prix</th><th>Quantité</th><th>Aujourd'hui</th><th>Rempli</th><th>Coût</th><th></th></tr></thead>
          <tbody>${rows || '<tr class="empty-row"><td colspan="7">Aucun ordre permanent</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  _journal(view) {
    const j = view.journal;
    const max = Math.max(1, ...j.daily.map(d => Math.abs(d.net)));
    const bars = j.daily.map((d, i) => {
      const h = Math.round(Math.abs(d.net) / max * 40);
      const y = d.net >= 0 ? 44 - h : 44;
      return `<rect x="${i * 16 + 2}" y="${y}" width="12" height="${Math.max(1, h)}" class="${d.net >= 0 ? 'bar-up' : 'bar-down'}"><title>Jour ${d.day} : ${formatMoney(d.net)} €</title></rect>`;
    }).join('');
    const rows = j.rows.map(r => `
      <tr>
        <td>${r.item.icon} ${r.item.name}</td>
        <td>${r.bought}<br><small class="text-muted">${formatMoney(r.spent)} €</small></td>
        <td>${r.sold}<br><small class="text-muted">${formatMoney(r.earned)} €</small></td>
        <td>${signed(r.realized)}</td>
        <td>${r.held}</td>
        <td>${r.unrealized != null ? signed(r.unrealized) : '<span class="text-muted" title="Coût d\'achat inconnu (objets trouvés ou de départ)">—</span>'}</td>
      </tr>`).join('');
    return `
      <div class="eco-health journal-tiles">
        <div class="eco-tile" title="Ventes − coût d'achat moyen des objets vendus (hôtels de vente et d'achat)"><span class="eco-label">Marge réalisée</span><div class="eco-main"><strong>${signed(j.realized)}</strong></div><small class="text-muted">sur vos ventes</small></div>
        <div class="eco-tile" title="Contrats du Comptoir, commandes des marchands et services, moins le coût des objets livrés"><span class="eco-label">Contrats &amp; services</span><div class="eco-main"><strong>${signed(j.jobRealized)}</strong></div><small class="text-muted">encaissé ${formatMoney(j.jobIncome)} €</small></div>
        <div class="eco-tile" title="Fournitures et matériaux de l'établi, fournitures de fabrication"><span class="eco-label">Atelier</span><div class="eco-main"><strong>${signed(-j.workshop)}</strong></div><small class="text-muted">frais d'annonce ${formatMoney(j.fees)} €</small></div>
        <div class="eco-tile" title="Marge réalisée + contrats − atelier − frais d'annonce"><span class="eco-label">Résultat net</span><div class="eco-main"><strong>${signed(j.net)}</strong></div><small class="text-muted">latent en stock ${signed(j.unrealized)}</small></div>
        <div class="eco-tile"><span class="eco-label">14 derniers jours</span><svg class="journal-bars" viewBox="0 0 ${Math.max(1, j.daily.length) * 16 + 4} 88" aria-hidden="true"><line x1="0" y1="44" x2="1000" y2="44" class="bar-axis" />${bars}</svg></div>
      </div>
      <p class="trade-hint text-muted">Latent = valeur de marché actuelle (selon l'état) − votre coût d'achat, pour ce qui reste dans le sac. Une réparation ajoute son coût au prix de revient de l'objet.</p>
      <div class="table-container">
        <table class="data-table" id="journal-table">
          <thead><tr><th>Objet</th><th>Achetés</th><th>Vendus / livrés</th><th>Marge réalisée</th><th>En stock</th><th>Latent</th></tr></thead>
          <tbody>${rows || '<tr class="empty-row"><td colspan="6">Pas encore d\'opérations</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  _wire() {
    const root = this.root;
    root.querySelectorAll('[data-tr-tab]').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.trTab; this.render(); }));
    const soItem = root.querySelector('#so-item');
    const soPrice = root.querySelector('#so-price');
    const soHint = root.querySelector('#so-hint');
    const updateHint = () => {
      if (!soItem || !soHint) return;
      const fair = this.getFair(soItem.value);
      soHint.textContent = `Valeur normale : ${formatMoney(fair)} € — un prix 5 à 10 % en dessous se remplit surtout en période de surplus.`;
    };
    soItem?.addEventListener('change', () => { soPrice.value = (this.getFair(soItem.value) * 0.95).toFixed(2); updateHint(); });
    updateHint();
    root.querySelectorAll('[data-tr]').forEach(btn => btn.addEventListener('click', () => {
      const a = btn.dataset.tr;
      if (a === 'watch') this.actions.toggleWatch?.(root.querySelector('#watch-item').value, true);
      if (a === 'unwatch') this.actions.toggleWatch?.(btn.dataset.item, false);
      if (a === 'save-alert') {
        const row = btn.closest('tr');
        this.actions.setAlert?.(btn.dataset.item, row.querySelector('[data-alert-below]').value, row.querySelector('[data-alert-above]').value);
      }
      if (a === 'read') this.actions.markRead?.();
      if (a === 'add-order') {
        this.actions.addOrder?.({
          itemId: soItem.value,
          price: soPrice.value,
          quantity: root.querySelector('#so-qty').value,
          minQuality: root.querySelector('#so-minq').value
        });
      }
      if (a === 'toggle-order') this.actions.toggleOrder?.(btn.dataset.id);
      if (a === 'remove-order') this.actions.removeOrder?.(btn.dataset.id);
    }));
  }
}
