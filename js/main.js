/**
 * Commerce Tycoon — Point d'entrée
 */
import { Game } from './core/Game.js';
import { HistoryUI } from './ui/HistoryUI.js';
import { AuctionHouseUI } from './ui/AuctionHouseUI.js';
import { BuyHouseUI } from './ui/BuyHouseUI.js';
import { InventoryUI } from './ui/InventoryUI.js';
import { MarketUI } from './ui/MarketUI.js';
import { NpcUI } from './ui/NpcUI.js';
import { GoalsUI } from './ui/GoalsUI.js';
import { JobsUI } from './ui/JobsUI.js';
import { getItemById } from './data/items.js';

const game = new Game();

const Modal = {
  overlay: null, titleEl: null, bodyEl: null, footerEl: null,
  init() {
    this.overlay = document.getElementById('modal-overlay');
    this.titleEl = document.getElementById('modal-title');
    this.bodyEl = document.getElementById('modal-body');
    this.footerEl = document.getElementById('modal-footer');
    document.getElementById('modal-close').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
  },
  open({ title, bodyHTML, buttons = [] }) {
    this.titleEl.textContent = title;
    this.bodyEl.innerHTML = bodyHTML;
    this.footerEl.innerHTML = '';
    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.className = `btn ${btn.className || 'btn-primary'}`;
      button.textContent = btn.label;
      button.addEventListener('click', () => { if (btn.onClick) btn.onClick(); });
      this.footerEl.appendChild(button);
    });
    this.overlay.classList.remove('hidden');
  },
  close() { this.overlay.classList.add('hidden'); }
};

function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const panels = document.querySelectorAll('.panel');
  function showPanel(target) {
    navButtons.forEach(b => b.classList.toggle('active', b.dataset.panel === target));
    panels.forEach(p => {
      const isTarget = p.id === `panel-${target}`;
      p.classList.toggle('active', isTarget);
      p.style.display = isTarget ? 'flex' : 'none';
    });
  }
  navButtons.forEach(btn => btn.addEventListener('click', () => showPanel(btn.dataset.panel)));
  showPanel('history');
}

function formatMoney(amount) {
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function getBook(itemId) {
  if (typeof game.getOrderBook === 'function') return game.getOrderBook(itemId);
  const sells = game.offers.filter(o => o.type === 'sell' && o.status === 'active' && o.itemId === itemId);
  const buys = game.offers.filter(o => o.type === 'buy' && o.status === 'active' && o.itemId === itemId);
  return {
    bestSell: sells.length ? Math.min(...sells.map(o => o.price)) : null,
    bestBuy: buys.length ? Math.max(...buys.map(o => o.price)) : null
  };
}
function suggestedSellPrice(itemId, quality, perfection) {
  const avg = game.getAdjustedMarketPrice(itemId, quality, perfection);
  const book = getBook(itemId);
  if (book.bestBuy != null) return Math.round(Math.max(avg, book.bestBuy) * 100) / 100;
  return avg;
}
function suggestedBuyPrice(itemId) {
  const avg = game.economy.getAveragePrice(itemId);
  const book = getBook(itemId);
  if (book.bestSell != null) return Math.round(Math.min(avg, book.bestSell) * 100) / 100;
  return avg;
}
function updateMoneyDisplay() {
  const el = document.getElementById('money-value');
  if (el) el.textContent = formatMoney(game.player.money);
}
function setStatus(msg) {
  const el = document.getElementById('status-message');
  if (el) el.textContent = msg;
}

function openCreateSellModal() {
  const ownedItems = game.inventory.items;
  if (ownedItems.length === 0) { setStatus('Inventaire vide — impossible de vendre'); return; }
  const options = ownedItems.map(slot => {
    const item = getItemById(slot.itemId);
    return `<option value="${slot.itemId}|${slot.quality}|${slot.perfection}|${slot.quantity}">${item?.icon || ''} ${item?.name || slot.itemId} (x${slot.quantity}) — Q${slot.quality}</option>`;
  }).join('');
  Modal.open({
    title: 'Mettre en vente',
    bodyHTML: `
      <div class="form-group"><label>Objet</label><select id="sell-item" class="select" style="width:100%">${options}</select></div>
      <p id="sell-market-info" class="text-muted" style="font-size:0.85rem;margin:6px 0 10px"></p>
      <div class="form-row">
        <div class="form-group"><label>Quantité</label><input type="number" id="sell-qty" class="input" value="1" min="1" style="width:100%" /></div>
        <div class="form-group"><label>Durée</label><select id="sell-duration" class="select" style="width:100%"><option value="1">1 jour (3% + 0,20€)</option><option value="2">2 jours (6% + 0,20€)</option><option value="7">7 jours (10% + 0,20€)</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Prix de départ (€)</label><input type="number" id="sell-price" class="input" step="0.01" min="0.01" style="width:100%" /></div>
        <div class="form-group"><label>Achat immédiat (€) <span class="text-muted">(optionnel)</span></label><input type="number" id="sell-buyout" class="input" step="0.01" min="0.01" style="width:100%" placeholder="Laisser vide si aucun" /></div>
      </div>
      <p class="text-muted" style="font-size:0.85rem;margin-top:8px">Les frais sont débités immédiatement. Les objets sont retirés de l'inventaire.</p>`,
    buttons: [
      { label: 'Annuler', className: 'btn-ghost', onClick: () => Modal.close() },
      { label: 'Mettre en vente', className: 'btn-primary', onClick: () => {
        const raw = document.getElementById('sell-item').value;
        const [itemId, quality, perfection, maxQty] = raw.split('|');
        const qty = Number(document.getElementById('sell-qty').value);
        const price = Number(document.getElementById('sell-price').value);
        const buyoutRaw = document.getElementById('sell-buyout').value;
        const buyout = buyoutRaw ? Number(buyoutRaw) : null;
        const duration = Number(document.getElementById('sell-duration').value);
        if (!price || price <= 0 || qty <= 0 || qty > Number(maxQty)) { setStatus('Paramètres invalides'); return; }
        const result = game.createSellOffer({ itemId, quantity: qty, price, buyoutPrice: buyout, durationDays: duration, quality: Number(quality), perfection: Number(perfection) });
        if (result.success) { setStatus(`Annonce créée (frais : ${result.fee.toFixed(2)} €)`); Modal.close(); refreshAllUI(); }
        else setStatus(result.error || 'Erreur');
      } }
    ]
  });
  if (ownedItems[0]) setTimeout(() => {
    const select = document.getElementById('sell-item');
    const priceInput = document.getElementById('sell-price');
    const infoEl = document.getElementById('sell-market-info');
    if (!select || !priceInput) return;
    const updateSuggestedPrice = () => {
      const [itemId, quality, perfection] = select.value.split('|');
      const q = Number(quality); const p = Number(perfection);
      const avg = game.getAdjustedMarketPrice(itemId, q, p);
      const rawAvg = game.economy.getAveragePrice(itemId);
      const book = getBook(itemId);
      priceInput.value = suggestedSellPrice(itemId, q, p).toFixed(2);
      const bestBuy = book.bestBuy != null ? formatMoney(book.bestBuy) + ' €' : 'aucune';
      if (infoEl) infoEl.innerHTML = `Prix moyen : <strong class="text-money">${formatMoney(rawAvg)} €</strong> · ajusté Q/P : ${formatMoney(avg)} € · meilleure offre d'achat : ${bestBuy}`;
    };
    select.addEventListener('change', updateSuggestedPrice);
    updateSuggestedPrice();
  }, 0);
}

function openCreateBuyModal() {
  const items = game.getAllItems();
  const options = items.map(item => `<option value="${item.id}">${item.icon || ''} ${item.name} (base ${item.basePrice.toFixed(2)} €)</option>`).join('');
  Modal.open({
    title: "Créer une offre d'achat",
    bodyHTML: `
      <div class="form-group"><label>Objet recherché</label><select id="buy-item" class="select" style="width:100%">${options}</select></div>
      <p id="buy-market-info" class="text-muted" style="font-size:0.85rem;margin:6px 0 10px"></p>
      <div class="form-row">
        <div class="form-group"><label>Quantité</label><input type="number" id="buy-qty" class="input" value="1" min="1" style="width:100%" /></div>
        <div class="form-group"><label>Durée</label><select id="buy-duration" class="select" style="width:100%"><option value="1">1 jour (3% + 0,20€)</option><option value="2">2 jours (6% + 0,20€)</option><option value="7">7 jours (10% + 0,20€)</option></select></div>
      </div>
      <div class="form-group"><label>Prix unitaire proposé (€)</label><input type="number" id="buy-price" class="input" step="0.01" min="0.01" style="width:100%" /></div>
      <p class="text-muted" style="font-size:0.85rem;margin-top:8px">L'argent (prix × quantité + frais) est bloqué immédiatement.</p>`,
    buttons: [
      { label: 'Annuler', className: 'btn-ghost', onClick: () => Modal.close() },
      { label: "Créer l'offre", className: 'btn-primary', onClick: () => {
        const itemId = document.getElementById('buy-item').value;
        const qty = Number(document.getElementById('buy-qty').value);
        const price = Number(document.getElementById('buy-price').value);
        const duration = Number(document.getElementById('buy-duration').value);
        if (!price || price <= 0 || qty <= 0) { setStatus('Paramètres invalides'); return; }
        const result = game.createBuyOffer({ itemId, quantity: qty, price, durationDays: duration });
        if (result.success) { setStatus(`Offre créée (bloqué : ${result.lockedAmount.toFixed(2)} € + frais ${result.fee.toFixed(2)} €)`); Modal.close(); refreshAllUI(); }
        else setStatus(result.error || 'Erreur');
      } }
    ]
  });
  if (items[0]) setTimeout(() => {
    const select = document.getElementById('buy-item');
    const priceInput = document.getElementById('buy-price');
    const infoEl = document.getElementById('buy-market-info');
    if (!select || !priceInput) return;
    const updateSuggestedPrice = () => {
      const itemId = select.value;
      const avg = game.economy.getAveragePrice(itemId);
      const book = getBook(itemId);
      priceInput.value = suggestedBuyPrice(itemId).toFixed(2);
      const bestSell = book.bestSell != null ? formatMoney(book.bestSell) + ' €' : 'aucune';
      if (infoEl) infoEl.innerHTML = `Prix moyen : <strong class="text-money">${formatMoney(avg)} €</strong> · vente la moins chère : ${bestSell}`;
    };
    select.addEventListener('change', updateSuggestedPrice);
    updateSuggestedPrice();
  }, 0);
}

function openBidModal(offerId) {
  const offer = game.offers.find(o => o.id === offerId);
  if (!offer) { setStatus('Annonce introuvable'); return; }
  const item = getItemById(offer.itemId);
  const minBid = typeof offer.minNextBid === 'function'
    ? offer.minNextBid()
    : (offer.currentBid != null ? Math.round((offer.currentBid + 0.01) * 100) / 100 : offer.price);
  const step = typeof offer.bidStep === 'function' ? offer.bidStep() : 0.01;
  const currentInfo = offer.currentBid != null
    ? `Enchère actuelle : <strong>${formatMoney(offer.currentBid)} €</strong> par ${game.getNpcName(offer.currentBidderId)}`
    : `Prix de départ : <strong>${formatMoney(offer.price)} €</strong>`;
  const buyoutLine = offer.buyoutPrice != null
    ? `Achat immédiat à ${formatMoney(offer.buyoutPrice)} € — l'enchère doit rester strictement en dessous.`
    : "Pas d'achat immédiat : palier d'enchère uniquement.";
  Modal.open({
    title: `Enchérir — ${item?.icon || ''} ${item?.name || offer.itemId}`,
    bodyHTML: `<p style="margin-bottom:12px">${currentInfo}</p><p class="text-muted" style="margin-bottom:16px;font-size:0.9rem">Quantité : ${offer.quantity} — palier ${formatMoney(step)} €. ${buyoutLine} L'argent est bloqué jusqu'à la fin.</p><div class="form-group"><label>Votre enchère unitaire (€) — minimum ${formatMoney(minBid)} €</label><input type="number" id="bid-amount" class="input" step="${step}" min="${minBid}" value="${minBid.toFixed(2)}" style="width:100%" /></div><p class="text-muted" style="font-size:0.85rem;margin-top:8px">Total bloqué : <span id="bid-total">${formatMoney(minBid * offer.quantity)}</span> €</p>`,
    buttons: [
      { label: 'Annuler', className: 'btn-ghost', onClick: () => Modal.close() },
      { label: 'Enchérir', className: 'btn-warning', onClick: () => {
        const amount = Number(document.getElementById('bid-amount').value);
        if (!amount || amount < minBid) { setStatus(`Enchère trop basse (min. ${minBid.toFixed(2)} €)`); return; }
        if (typeof offer.canBidAmount === 'function') {
          const check = offer.canBidAmount(amount);
          if (!check.ok) { setStatus(check.error || 'Enchère refusée'); return; }
        } else if (offer.buyoutPrice != null && amount >= offer.buyoutPrice) {
          setStatus(`L'enchère ne peut pas atteindre l'achat immédiat (${offer.buyoutPrice.toFixed(2)} €)`);
          return;
        }
        const result = game.placeBid(offerId, amount);
        if (result.success) { setStatus(`Enchère placée : ${formatMoney(amount)} €`); Modal.close(); refreshAllUI(); }
        else setStatus(result.error || 'Erreur');
      } }
    ]
  });
  setTimeout(() => {
    const input = document.getElementById('bid-amount');
    const totalEl = document.getElementById('bid-total');
    if (input && totalEl) input.addEventListener('input', () => { totalEl.textContent = formatMoney((Number(input.value) || 0) * offer.quantity); });
  }, 0);
}

function openFulfillModal(offerId, maxQty) {
  const offer = game.offers.find(o => o.id === offerId);
  if (!offer) { setStatus('Offre introuvable'); return; }
  const item = getItemById(offer.itemId);
  const owned = game.inventory.count(offer.itemId);
  const canSell = Math.min(owned, offer.quantity, maxQty);
  Modal.open({
    title: `Vendre — ${item?.icon || ''} ${item?.name || offer.itemId}`,
    bodyHTML: `<p style="margin-bottom:12px">L'acheteur propose <strong class="text-money">${formatMoney(offer.price)} €</strong> l'unité.</p><p class="text-muted" style="margin-bottom:16px;font-size:0.9rem">Vous en possédez ${owned} — Demande : ${offer.quantity}</p><div class="form-group"><label>Quantité à vendre (max ${canSell})</label><input type="number" id="fulfill-qty" class="input" value="${canSell}" min="1" max="${canSell}" style="width:100%" /></div><p class="text-muted" style="font-size:0.85rem;margin-top:8px">Total reçu : <span id="fulfill-total" class="text-money">${formatMoney(offer.price * canSell)}</span> €</p>`,
    buttons: [
      { label: 'Annuler', className: 'btn-ghost', onClick: () => Modal.close() },
      { label: 'Vendre', className: 'btn-success', onClick: () => {
        const qty = Number(document.getElementById('fulfill-qty').value);
        if (!qty || qty <= 0 || qty > canSell) { setStatus('Quantité invalide'); return; }
        const result = game.fulfillBuyOffer(offerId, qty);
        if (result.success) { setStatus(`Vendu ! +${formatMoney(result.total)} €`); Modal.close(); refreshAllUI(); }
        else setStatus(result.error || 'Erreur');
      } }
    ]
  });
  setTimeout(() => {
    const input = document.getElementById('fulfill-qty');
    const totalEl = document.getElementById('fulfill-total');
    if (input && totalEl) input.addEventListener('input', () => { totalEl.textContent = formatMoney(offer.price * (Number(input.value) || 0)); });
  }, 0);
}

let historyUI, auctionUI, buyUI, inventoryUI, marketUI, npcUI, goalsUI, jobsUI;

function initUI() {
  const resolveName = (id) => game.getNpcName(id);
  historyUI = new HistoryUI({ getTransactions: () => game.transactions, resolveName });
  auctionUI = new AuctionHouseUI({
    getActiveSellOffers: () => game.getActiveSellOffers(),
    getPlayerSellOffers: () => game.getPlayerSellOffers(),
    resolveName,
    onBuyout: (offerId, qty) => { const result = game.buyout(offerId, qty); if (result.success) { setStatus('Achat immédiat réussi'); refreshAllUI(); } else setStatus(result.error || "Échec de l'achat"); },
    onCancel: (offerId) => { const result = game.cancelOffer(offerId); if (result.success) { setStatus('Annonce annulée'); refreshAllUI(); } else setStatus(result.error || 'Erreur'); },
    onCreateSell: () => openCreateSellModal(),
    onBid: (offerId) => openBidModal(offerId)
  });
  buyUI = new BuyHouseUI({
    getActiveBuyOffers: () => game.getActiveBuyOffers(),
    getPlayerBuyOffers: () => game.getPlayerBuyOffers(),
    getPlayerItemCount: (itemId) => game.inventory.count(itemId),
    resolveName,
    onCancel: (offerId) => { const result = game.cancelOffer(offerId); if (result.success) { setStatus(`Offre annulée (remboursé : ${(result.refund || 0).toFixed(2)} €)`); refreshAllUI(); } else setStatus(result.error || 'Erreur'); },
    onCreateBuy: () => openCreateBuyModal(),
    onFulfill: (offerId, maxQty) => openFulfillModal(offerId, maxQty)
  });
  inventoryUI = new InventoryUI({
    getInventory: () => game.inventory,
    onSlotClick: (index, slot) => {
      const item = getItemById(slot.itemId);
      const avg = slot.avgBuyPrice != null ? ` | Achat moy. ${slot.avgBuyPrice.toFixed(2)} €` : '';
      setStatus(`${item?.name || slot.itemId} — Qté ${slot.quantity} | Q${slot.quality} P${slot.perfection}${avg}`);
    }
  });
  marketUI = new MarketUI({ getMarketRows: () => game.getMarketRows(), getEvents: () => game.economy.getActiveEvents() });
  npcUI = new NpcUI({ getProfiles: () => game.getNpcProfiles(), resolveName });
  goalsUI = new GoalsUI({ getGoals: () => game.getGoals(), getSummary: () => game.getProgressSummary() });
  jobsUI = new JobsUI({
    getView: () => game.getJobsView ? game.getJobsView() : { contracts: [], recipes: [], stallItems: [], stats: {}, feeVault: 0, scavengeUsedToday: 0, maxScavengePerDay: 4, maxStallPerDay: 3 },
    onScavenge: () => {
      const result = game.scavenge ? game.scavenge() : { success: false, error: 'Indisponible' };
      if (result.success && result.type === 'cash') setStatus(`Tournée : +${result.amount.toFixed(2)} €`);
      else if (result.success) setStatus(`Tournée : ${result.icon || ''} ${result.name || 'objet'} x${result.quantity} (Q${result.quality})`);
      else setStatus(result.error || 'Tournée impossible');
      refreshAllUI();
    },
    onComplete: (id) => {
      const result = game.completeJob ? game.completeJob(id) : { success: false, error: 'Indisponible' };
      if (result.success) setStatus(`Contrat livré : +${result.payout.toFixed(2)} €`);
      else setStatus(result.error || 'Livraison impossible');
      refreshAllUI();
    },
    onStall: (itemId, quality, perfection, qty) => {
      const result = game.sellFromStall ? game.sellFromStall(itemId, quality, perfection, qty) : { success: false, error: 'Indisponible' };
      if (result.success) setStatus(`Étal : +${result.total.toFixed(2)} €`);
      else setStatus(result.error || 'Vente impossible');
      refreshAllUI();
    },
    onCraft: (id, focus) => {
      const result = game.craftJob ? game.craftJob(id, focus) : { success: false, error: 'Indisponible' };
      if (result.success) setStatus(`Atelier : ${result.name} Q${result.quality} (~${Number(result.value || 0).toFixed(2)} €)`);
      else setStatus(result.error || 'Fabrication impossible');
      refreshAllUI();
    },
    onPolish: (itemId, quality, perfection) => {
      const result = game.polishItem ? game.polishItem(itemId, quality, perfection) : { success: false, error: 'Indisponible' };
      if (result.success) setStatus(`Réparé : ${result.name} Q${result.quality}${result.partName ? ' · ' + result.partName : ''}`);
      else setStatus(result.error || 'Réparation impossible');
      refreshAllUI();
    },
    onService: (id) => {
      const result = game.fulfillNpcService ? game.fulfillNpcService(id) : { success: false, error: 'Indisponible' };
      if (result.success && result.kind === 'repair') setStatus(`Service : réparé ${result.name} pour ${result.npcName} (+${Number(result.payout).toFixed(2)} €)`);
      else if (result.success) setStatus(`Service : démantèlement pour ${result.npcName} (+${Number(result.payout).toFixed(2)} €)`);
      else setStatus(result.error || 'Service impossible');
      refreshAllUI();
    },
    onSalvage: (itemId, quality, perfection) => {
      const result = game.salvageItem ? game.salvageItem(itemId, quality, perfection) : { success: false, error: 'Indisponible' };
      if (result.success) {
        const loot = (result.outputs || []).map(o => `${o.icon || ''} ${o.name} x${o.qty}`).join(', ');
        setStatus(`Démantelé : ${result.name} → ${loot}`);
      } else setStatus(result.error || 'Démantèlement impossible');
      refreshAllUI();
    }
  });
}

function refreshAllUI() {
  updateMoneyDisplay();
  historyUI?.render(); auctionUI?.render(); buyUI?.render(); inventoryUI?.render();
  marketUI?.render(); npcUI?.render(); goalsUI?.render(); jobsUI?.render();
}
window.addEventListener('panel-changed', () => { if (historyUI) refreshAllUI(); });

function init() {
  const loaded = game.load();
  if (loaded) setStatus('Sauvegarde chargée');
  else { game.giveStarterItems(); setStatus('Nouvelle partie — objets de départ ajoutés'); }
  initNavigation(); Modal.init(); initUI(); refreshAllUI();
  setInterval(() => {
    const offersBefore = game.offers.length;
    game.tick();
    if (game.offers.length !== offersBefore || game.transactions.length > 0) refreshAllUI();
    else game.timeManager.updateUI();
  }, 8000);
  game.timeManager.updateUI();
  window.game = game;
  window.Modal = Modal;
}
document.addEventListener('DOMContentLoaded', init);
