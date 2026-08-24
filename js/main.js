/**
 * Commerce Tycoon — Point d'entrée
 * Prototype v0.1
 */

import { Game } from './core/Game.js';
import { HistoryUI } from './ui/HistoryUI.js';
import { AuctionHouseUI } from './ui/AuctionHouseUI.js';
import { BuyHouseUI } from './ui/BuyHouseUI.js';
import { InventoryUI } from './ui/InventoryUI.js';
import { getItemById } from './data/items.js';

// ============================================
// Instance principale
// ============================================
const game = new Game();

// ============================================
// Modal générique
// ============================================
const Modal = {
  overlay: null,
  titleEl: null,
  bodyEl: null,
  footerEl: null,

  init() {
    this.overlay = document.getElementById('modal-overlay');
    this.titleEl = document.getElementById('modal-title');
    this.bodyEl = document.getElementById('modal-body');
    this.footerEl = document.getElementById('modal-footer');

    document.getElementById('modal-close').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  },

  open({ title, bodyHTML, buttons = [] }) {
    this.titleEl.textContent = title;
    this.bodyEl.innerHTML = bodyHTML;
    this.footerEl.innerHTML = '';

    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.className = `btn ${btn.className || 'btn-primary'}`;
      button.textContent = btn.label;
      button.addEventListener('click', () => {
        if (btn.onClick) btn.onClick();
      });
      this.footerEl.appendChild(button);
    });

    this.overlay.classList.remove('hidden');
  },

  close() {
    this.overlay.classList.add('hidden');
  }
};

// ============================================
// Navigation
// ============================================
function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const panels = document.querySelectorAll('.panel');

  function showPanel(target) {
    navButtons.forEach(b => {
      b.classList.toggle('active', b.dataset.panel === target);
    });
    panels.forEach(p => {
      const isTarget = p.id === `panel-${target}`;
      p.classList.toggle('active', isTarget);
      // Force hide/show au cas où le CSS serait en conflit
      p.style.display = isTarget ? 'flex' : 'none';
    });
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      showPanel(btn.dataset.panel);
    });
  });

  // Assure l'état initial
  showPanel('history');
}

// ============================================
// Helpers d'affichage
// ============================================
function formatMoney(amount) {
  return amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function updateMoneyDisplay() {
  const el = document.getElementById('money-value');
  if (el) el.textContent = formatMoney(game.player.money);
}

function setStatus(msg) {
  const el = document.getElementById('status-message');
  if (el) el.textContent = msg;
}

// ============================================
// Modals de création d'offres
// ============================================
function openCreateSellModal() {
  const inventory = game.inventory;
  const ownedItems = inventory.items;

  if (ownedItems.length === 0) {
    setStatus('Inventaire vide — impossible de vendre');
    return;
  }

  const options = ownedItems.map(slot => {
    const item = getItemById(slot.itemId);
    return `<option value="${slot.itemId}|${slot.quality}|${slot.perfection}|${slot.quantity}">
      ${item?.icon || ''} ${item?.name || slot.itemId} (x${slot.quantity}) — Q${slot.quality}
    </option>`;
  }).join('');

  Modal.open({
    title: 'Mettre en vente',
    bodyHTML: `
      <div class="form-group">
        <label>Objet</label>
        <select id="sell-item" class="select" style="width:100%">
          ${options}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Quantité</label>
          <input type="number" id="sell-qty" class="input" value="1" min="1" style="width:100%" />
        </div>
        <div class="form-group">
          <label>Durée</label>
          <select id="sell-duration" class="select" style="width:100%">
            <option value="1">1 jour (3% + 0,20€)</option>
            <option value="2">2 jours (6% + 0,20€)</option>
            <option value="7">7 jours (10% + 0,20€)</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Prix de départ (€)</label>
          <input type="number" id="sell-price" class="input" step="0.01" min="0.01" style="width:100%" />
        </div>
        <div class="form-group">
          <label>Achat immédiat (€) <span class="text-muted">(optionnel)</span></label>
          <input type="number" id="sell-buyout" class="input" step="0.01" min="0.01" style="width:100%" placeholder="Laisser vide si aucun" />
        </div>
      </div>
      <p class="text-muted" style="font-size:0.85rem;margin-top:8px">
        Les frais sont débités immédiatement. Les objets sont retirés de l'inventaire.
      </p>
    `,
    buttons: [
      {
        label: 'Annuler',
        className: 'btn-ghost',
        onClick: () => Modal.close()
      },
      {
        label: 'Mettre en vente',
        className: 'btn-primary',
        onClick: () => {
          const raw = document.getElementById('sell-item').value;
          const [itemId, quality, perfection, maxQty] = raw.split('|');
          const qty = Number(document.getElementById('sell-qty').value);
          const price = Number(document.getElementById('sell-price').value);
          const buyoutRaw = document.getElementById('sell-buyout').value;
          const buyout = buyoutRaw ? Number(buyoutRaw) : null;
          const duration = Number(document.getElementById('sell-duration').value);

          if (!price || price <= 0 || qty <= 0 || qty > Number(maxQty)) {
            setStatus('Paramètres invalides');
            return;
          }

          const result = game.createSellOffer({
            itemId,
            quantity: qty,
            price,
            buyoutPrice: buyout,
            durationDays: duration,
            quality: Number(quality),
            perfection: Number(perfection)
          });

          if (result.success) {
            setStatus(`Annonce créée (frais : ${result.fee.toFixed(2)} €)`);
            Modal.close();
            refreshAllUI();
          } else {
            setStatus(result.error || 'Erreur');
          }
        }
      }
    ]
  });

  // Préremplit le prix avec le basePrice
  const first = ownedItems[0];
  const item = getItemById(first.itemId);
  if (item) {
    setTimeout(() => {
      const priceInput = document.getElementById('sell-price');
      if (priceInput) priceInput.value = item.basePrice.toFixed(2);
    }, 0);
  }
}

function openCreateBuyModal() {
  const items = game.getAllItems();

  const options = items.map(item =>
    `<option value="${item.id}">${item.icon || ''} ${item.name} (base ${item.basePrice.toFixed(2)} €)</option>`
  ).join('');

  Modal.open({
    title: 'Créer une offre d\'achat',
    bodyHTML: `
      <div class="form-group">
        <label>Objet recherché</label>
        <select id="buy-item" class="select" style="width:100%">
          ${options}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Quantité</label>
          <input type="number" id="buy-qty" class="input" value="1" min="1" style="width:100%" />
        </div>
        <div class="form-group">
          <label>Durée</label>
          <select id="buy-duration" class="select" style="width:100%">
            <option value="1">1 jour (3% + 0,20€)</option>
            <option value="2">2 jours (6% + 0,20€)</option>
            <option value="7">7 jours (10% + 0,20€)</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Prix unitaire proposé (€)</label>
        <input type="number" id="buy-price" class="input" step="0.01" min="0.01" style="width:100%" />
      </div>
      <p class="text-muted" style="font-size:0.85rem;margin-top:8px">
        L'argent (prix × quantité + frais) est bloqué immédiatement.
      </p>
    `,
    buttons: [
      {
        label: 'Annuler',
        className: 'btn-ghost',
        onClick: () => Modal.close()
      },
      {
        label: 'Créer l\'offre',
        className: 'btn-primary',
        onClick: () => {
          const itemId = document.getElementById('buy-item').value;
          const qty = Number(document.getElementById('buy-qty').value);
          const price = Number(document.getElementById('buy-price').value);
          const duration = Number(document.getElementById('buy-duration').value);

          if (!price || price <= 0 || qty <= 0) {
            setStatus('Paramètres invalides');
            return;
          }

          const result = game.createBuyOffer({
            itemId,
            quantity: qty,
            price,
            durationDays: duration
          });

          if (result.success) {
            setStatus(`Offre créée (bloqué : ${result.lockedAmount.toFixed(2)} € + frais ${result.fee.toFixed(2)} €)`);
            Modal.close();
            refreshAllUI();
          } else {
            setStatus(result.error || 'Erreur');
          }
        }
      }
    ]
  });

  // Préremplit avec le basePrice du premier item
  const firstItem = items[0];
  if (firstItem) {
    setTimeout(() => {
      const priceInput = document.getElementById('buy-price');
      if (priceInput) priceInput.value = firstItem.basePrice.toFixed(2);
    }, 0);
  }
}

function openBidModal(offerId) {
  const offer = game.offers.find(o => o.id === offerId);
  if (!offer) {
    setStatus('Annonce introuvable');
    return;
  }

  const item = getItemById(offer.itemId);
  const minBid = offer.currentBid != null
    ? Math.round((offer.currentBid + 0.01) * 100) / 100
    : offer.price;

  const currentInfo = offer.currentBid != null
    ? `Enchère actuelle : <strong>${formatMoney(offer.currentBid)} €</strong> par ${game.getNpcName(offer.currentBidderId)}`
    : `Prix de départ : <strong>${formatMoney(offer.price)} €</strong>`;

  Modal.open({
    title: `Enchérir — ${item?.icon || ''} ${item?.name || offer.itemId}`,
    bodyHTML: `
      <p style="margin-bottom:12px">${currentInfo}</p>
      <p class="text-muted" style="margin-bottom:16px;font-size:0.9rem">
        Quantité : ${offer.quantity} — L'argent sera bloqué jusqu'à la fin de l'enchère.
      </p>
      <div class="form-group">
        <label>Votre enchère unitaire (€) — minimum ${formatMoney(minBid)} €</label>
        <input type="number" id="bid-amount" class="input" step="0.01" min="${minBid}" value="${minBid.toFixed(2)}" style="width:100%" />
      </div>
      <p class="text-muted" style="font-size:0.85rem;margin-top:8px">
        Total bloqué : <span id="bid-total">${formatMoney(minBid * offer.quantity)}</span> €
      </p>
    `,
    buttons: [
      {
        label: 'Annuler',
        className: 'btn-ghost',
        onClick: () => Modal.close()
      },
      {
        label: 'Enchérir',
        className: 'btn-warning',
        onClick: () => {
          const amount = Number(document.getElementById('bid-amount').value);
          if (!amount || amount < minBid) {
            setStatus(`Enchère trop basse (min. ${minBid.toFixed(2)} €)`);
            return;
          }

          const result = game.placeBid(offerId, amount);
          if (result.success) {
            setStatus(`Enchère placée : ${formatMoney(amount)} €`);
            Modal.close();
            refreshAllUI();
          } else {
            setStatus(result.error || 'Erreur');
          }
        }
      }
    ]
  });

  // Met à jour le total bloqué en direct
  setTimeout(() => {
    const input = document.getElementById('bid-amount');
    const totalEl = document.getElementById('bid-total');
    if (input && totalEl) {
      input.addEventListener('input', () => {
        const val = Number(input.value) || 0;
        totalEl.textContent = formatMoney(val * offer.quantity);
      });
    }
  }, 0);
}

function openFulfillModal(offerId, maxQty) {
  const offer = game.offers.find(o => o.id === offerId);
  if (!offer) {
    setStatus('Offre introuvable');
    return;
  }

  const item = getItemById(offer.itemId);
  const owned = game.inventory.count(offer.itemId);
  const canSell = Math.min(owned, offer.quantity, maxQty);

  Modal.open({
    title: `Vendre — ${item?.icon || ''} ${item?.name || offer.itemId}`,
    bodyHTML: `
      <p style="margin-bottom:12px">
        L'acheteur propose <strong class="text-money">${formatMoney(offer.price)} €</strong> l'unité.
      </p>
      <p class="text-muted" style="margin-bottom:16px;font-size:0.9rem">
        Vous en possédez ${owned} — Demande : ${offer.quantity}
      </p>
      <div class="form-group">
        <label>Quantité à vendre (max ${canSell})</label>
        <input type="number" id="fulfill-qty" class="input" value="${canSell}" min="1" max="${canSell}" style="width:100%" />
      </div>
      <p class="text-muted" style="font-size:0.85rem;margin-top:8px">
        Total reçu : <span id="fulfill-total" class="text-money">${formatMoney(offer.price * canSell)}</span> €
      </p>
    `,
    buttons: [
      {
        label: 'Annuler',
        className: 'btn-ghost',
        onClick: () => Modal.close()
      },
      {
        label: 'Vendre',
        className: 'btn-success',
        onClick: () => {
          const qty = Number(document.getElementById('fulfill-qty').value);
          if (!qty || qty <= 0 || qty > canSell) {
            setStatus('Quantité invalide');
            return;
          }

          const result = game.fulfillBuyOffer(offerId, qty);
          if (result.success) {
            setStatus(`Vendu ! +${formatMoney(result.total)} €`);
            Modal.close();
            refreshAllUI();
          } else {
            setStatus(result.error || 'Erreur');
          }
        }
      }
    ]
  });

  setTimeout(() => {
    const input = document.getElementById('fulfill-qty');
    const totalEl = document.getElementById('fulfill-total');
    if (input && totalEl) {
      input.addEventListener('input', () => {
        const val = Number(input.value) || 0;
        totalEl.textContent = formatMoney(offer.price * val);
      });
    }
  }, 0);
}

// ============================================
// UI instances
// ============================================
let historyUI, auctionUI, buyUI, inventoryUI;

function initUI() {
  const resolveName = (id) => game.getNpcName(id);

  historyUI = new HistoryUI({
    getTransactions: () => game.transactions,
    resolveName
  });

  auctionUI = new AuctionHouseUI({
    getActiveSellOffers: () => game.getActiveSellOffers(),
    getPlayerSellOffers: () => game.getPlayerSellOffers(),
    resolveName,
    onBuyout: (offerId, qty) => {
      const result = game.buyout(offerId, qty);
      if (result.success) {
        setStatus('Achat immédiat réussi');
        refreshAllUI();
      } else {
        setStatus(result.error || 'Échec de l\'achat');
      }
    },
    onCancel: (offerId) => {
      const result = game.cancelOffer(offerId);
      if (result.success) {
        setStatus('Annonce annulée');
        refreshAllUI();
      } else {
        setStatus(result.error || 'Erreur');
      }
    },
    onCreateSell: () => openCreateSellModal(),
    onBid: (offerId) => openBidModal(offerId)
  });

  buyUI = new BuyHouseUI({
    getActiveBuyOffers: () => game.getActiveBuyOffers(),
    getPlayerBuyOffers: () => game.getPlayerBuyOffers(),
    getPlayerItemCount: (itemId) => game.inventory.count(itemId),
    resolveName,
    onCancel: (offerId) => {
      const result = game.cancelOffer(offerId);
      if (result.success) {
        setStatus(`Offre annulée (remboursé : ${(result.refund || 0).toFixed(2)} €)`);
        refreshAllUI();
      } else {
        setStatus(result.error || 'Erreur');
      }
    },
    onCreateBuy: () => openCreateBuyModal(),
    onFulfill: (offerId, maxQty) => openFulfillModal(offerId, maxQty)
  });

  inventoryUI = new InventoryUI({
    getInventory: () => game.inventory,
    onSlotClick: (index, slot) => {
      const item = getItemById(slot.itemId);
      const avg = slot.avgBuyPrice != null
        ? ` | Achat moy. ${slot.avgBuyPrice.toFixed(2)} €`
        : '';
      setStatus(`${item?.name || slot.itemId} — Qté ${slot.quantity} | Q${slot.quality} P${slot.perfection}${avg}`);
    }
  });
}

function refreshAllUI() {
  updateMoneyDisplay();
  historyUI?.render();
  auctionUI?.render();
  buyUI?.render();
  inventoryUI?.render();
}

// Rafraîchit l'UI à chaque changement d'onglet (ex: "Pas en stock" → "Vendre")
window.addEventListener('panel-changed', () => {
  if (historyUI) refreshAllUI();
});

// ============================================
// Démarrage
// ============================================
function init() {
  console.log('Commerce Tycoon — Initialisation...');

  // Charge la sauvegarde
  const loaded = game.load();
  if (loaded) {
    console.log('Sauvegarde chargée');
    setStatus('Sauvegarde chargée');
  } else {
    console.log('Nouvelle partie');
    // Donne des objets de départ pour tester
    game.giveStarterItems();
    setStatus('Nouvelle partie — objets de départ ajoutés');
  }

  // UI
  initNavigation();
  Modal.init();
  initUI();
  refreshAllUI();

  // Tick principal : temps + PNJ + expirations (toutes les 8 secondes)
  setInterval(() => {
    const offersBefore = game.offers.length;
    game.tick();
    // Rafraîchit l'UI si quelque chose a changé
    if (game.offers.length !== offersBefore || game.transactions.length > 0) {
      refreshAllUI();
    } else {
      // Au minimum on met à jour l'heure
      game.timeManager.updateUI();
    }
  }, 8000);

  // Première mise à jour de l'heure
  game.timeManager.updateUI();

  // Expose pour debug
  window.game = game;
  window.Modal = Modal;

  console.log('Prototype prêt — les PNJ vont commencer à trader.');
}

document.addEventListener('DOMContentLoaded', init);