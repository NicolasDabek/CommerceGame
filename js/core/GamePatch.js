import { JobBoard } from '../systems/JobBoard.js';
import { TradingDesk } from '../systems/TradingDesk.js';
import { Negotiation } from '../systems/Negotiation.js';
import { Credit } from '../systems/Credit.js';
import { Career } from '../systems/Career.js';
import { getRankView, rankFor } from './Ranks.js';
import { getItemById } from '../data/items.js';
import { Storage } from '../utils/storage.js';
import { Offer } from '../models/Offer.js';
import { CLANS, getClanById } from '../data/npcs.js';

export function enhanceGame(game) {
  if (!game || game.__enhanced) return game;
  game.__enhanced = true;

  game.auctionHouse.lockFunds = (id, amount) => game._debitParty(id, amount);
  game.auctionHouse.unlockFunds = (id, amount) => game._creditParty(id, amount);

  if (game.timeManager && !game.timeManager.gameTimeMs && game.currentDay > 1) {
    game.timeManager.gameTimeMs = (game.currentDay - 1) * game.timeManager.msPerGameDay;
  }

  const origExpire = game.matchingEngine.expireOffers.bind(game.matchingEngine);
  game.matchingEngine.expireOffers = (offers, _now) => origExpire(offers, game.timeManager.now());

  if (game.npcController) {
    game.npcController.getNow = () => game.timeManager.now();
    game.npcController.getMsPerGameDay = () => game.timeManager.msPerGameDay;
    game.npcController.getPlayerRep = () => game.player.reputation;
    game.npcController.getPlayerAlliance = () => game.player.allianceClanId;
    game.npcController.executeBid = (offer, npcId, amount) => game.auctionHouse.placeBid(offer, npcId, amount);
    game.npcController.executeCancel = (offer, npcId) => {
      if (!offer || offer.ownerId !== npcId || offer.status !== 'active') return { success: false };
      game.auctionHouse.releaseBid(offer);
      offer.status = 'cancelled';
      return { success: true };
    };
    const run = game.npcController.runMatching;
    game.npcController.runMatching = (offer) => {
      setTimeout(() => {
        if (offer && offer.status === 'active') run(offer);
      }, 12000);
    };
  }

  const savedData = Storage.load() || {};
  game.jobBoard = new JobBoard(game, savedData.jobs || {});
  game.jobBoard.ensureContracts();
  // Suivi, alertes, ordres permanents et journal (anciennes sauvegardes : vide)
  game.tradingDesk = new TradingDesk(game, savedData.trading || {});
  // Marchandage, crédit du Comptoir, parcours du marchand (anciennes sauvegardes : vides)
  game.negotiation = new Negotiation(game, savedData.negotiation || {});
  game.credit = new Credit(game, savedData.credit || {});
  game.tradeListeners.push((tx) => game.credit.onTransaction(tx));
  game.career = new Career(game, savedData.career || {});

  // Nouvelle partie : les marchands ouvrent boutique tout de suite (hôtels non vides)
  if (game.__newGame && game.npcController?.primeMarket) {
    game.npcController.primeMarket(2, game.timeManager.now());
    game.__newGame = false;
  }

  if (!Offer.__repFees) {
    Offer.__repFees = true;
    const origListing = Offer.calculateListingFee.bind(Offer);
    const origChange = Offer.calculatePriceChangeFee.bind(Offer);
    Offer.calculateListingFee = (price, quantity, durationDays) => {
      const base = origListing(price, quantity, durationDays);
      const mult = game.player?.getFeeMultiplier?.() ?? 1;
      return Math.round(base * mult * 100) / 100;
    };
    Offer.calculatePriceChangeFee = (oldPrice, newPrice, quantity) => {
      const base = origChange(oldPrice, newPrice, quantity);
      const mult = game.player?.getFeeMultiplier?.() ?? 1;
      return Math.round(base * mult * 100) / 100;
    };
  }

  game.joinClan = function(clanId) {
    const clan = getClanById(clanId);
    if (!clan) return { success: false, error: 'Clan inconnu' };
    const current = game.player.allianceClanId;
    if (current === clanId) return { success: false, error: 'Déjà allié à ce clan' };
    const need = clan.joinRep || 8;
    if ((game.player.reputation || 0) < need) {
      return { success: false, error: `Il faut ${need} de réputation pour rejoindre ${clan.name}` };
    }
    if (current) game.player.addReputation(-3);
    game.player.allianceClanId = clanId;
    game.player.addReputation(1);
    game.save();
    game._notifyUI();
    return { success: true, clan };
  };

  game.leaveClan = function() {
    if (!game.player.allianceClanId) return { success: false, error: 'Aucune alliance' };
    game.player.addReputation(-2);
    game.player.allianceClanId = null;
    game.save();
    game._notifyUI();
    return { success: true };
  };

  game.getClans = function() {
    const ally = game.player.allianceClanId;
    return CLANS.map(clan => ({
      ...clan,
      allied: ally === clan.id,
      rival: ally ? getClanById(ally)?.rivalId === clan.id : false,
      members: (game.getNpcProfiles ? game.getNpcProfiles() : []).filter(p => p.clanId === clan.id).length
    }));
  };

  const origSave = game.save.bind(game);
  game.save = function() {
    origSave();
    const data = Storage.load();
    if (data) {
      data.jobs = game.jobBoard.toJSON();
      if (game.tradingDesk) data.trading = game.tradingDesk.toJSON();
      if (game.negotiation) data.negotiation = game.negotiation.toJSON();
      if (game.credit) data.credit = game.credit.toJSON();
      if (game.career) data.career = game.career.toJSON();
      Storage.save(data);
    }
  };

  const origTick = game.tick.bind(game);
  game.tick = function() {
    const dayBefore = game.timeManager.getCurrentDay();
    const snapshot = game.offers.map(o => `${o.id}:${o.currentBid}:${o.status}:${o.quantity}`).join('|');
    origTick();
    game.jobBoard.collectReady();
    game.tradingDesk?.tick?.();
    if (game.timeManager.getCurrentDay() !== dayBefore) {
      // Les PNJ (production, consommation) et le Comptoir sont déjà gérés dans Game.onDayChange
      game.jobBoard.onNewDay();
      const loanEvent = game.credit?.onNewDay();
      if (loanEvent?.type === 'autoRepaid') game.uiCallbacks?.onStatus?.(`Crédit remboursé automatiquement : −${loanEvent.amount.toFixed(2)} €`);
      else if (loanEvent?.type === 'overdue') game.uiCallbacks?.onStatus?.(`Crédit en retard (${loanEvent.days} j) : réputation en baisse, 50 % de vos ventes saisies${loanEvent.seized ? ` · ${loanEvent.seized.toFixed(2)} € prélevés` : ''}`);
      game.career?.check();
      game.save();
    } else {
      game.jobBoard.ensureContracts();
      game.career?.check();
    }
    const after = game.offers.map(o => `${o.id}:${o.currentBid}:${o.status}:${o.quantity}`).join('|');
    if (after !== snapshot && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('panel-changed'));
    }
  };

  game.createSellOffer = function(params) {
    const adjusted = game.getAdjustedMarketPrice(params.itemId, params.quality, params.perfection);
    if (params.price == null && adjusted > 0) params.price = adjusted;
    const result = game.auctionHouse.createSellOffer({
      ...params,
      ownerId: 'player',
      createdAt: game.timeManager.now(),
      msPerGameDay: game.timeManager.msPerGameDay
    });
    if (!result.success) return result;
    result.offer.expiresAt = result.offer.createdAt + result.offer.durationDays * result.offer.msPerGameDay;
    if (result.fee) { game.jobBoard.depositFee(result.fee); game.tradingDesk?.recordFee(result.fee); }
    game.offers.push(result.offer);
    result.matched = 0;
    result.soldQty = 0;
    if (params.autoMatch === true) {
      const { transactions } = game.matchingEngine.match(result.offer, game.offers);
      result.matched = transactions.length;
      result.soldQty = transactions.reduce((s, tx) => s + tx.quantity, 0);
    }
    game.save();
    game._notifyUI();
    return result;
  };

  game.createBuyOffer = function(params) {
    const result = game.buyHouse.createBuyOffer({
      ...params,
      ownerId: 'player',
      createdAt: game.timeManager.now(),
      msPerGameDay: game.timeManager.msPerGameDay
    });
    if (!result.success) return result;
    result.offer.expiresAt = result.offer.createdAt + result.offer.durationDays * result.offer.msPerGameDay;
    if (result.fee) { game.jobBoard.depositFee(result.fee); game.tradingDesk?.recordFee(result.fee); }
    game.offers.push(result.offer);
    result.matched = 0;
    if (params.autoMatch === true) {
      const { transactions } = game.matchingEngine.match(result.offer, game.offers);
      result.matched = transactions.length;
    }
    game.save();
    game._notifyUI();
    return result;
  };

  game.scavenge = () => game.jobBoard.scavenge();
  game.completeJob = (id) => game.jobBoard.complete(id);
  game.sellFromStall = (itemId, quality, perfection, qty) => game.jobBoard.sellFromStall(itemId, quality, perfection, qty);
  game.craftJob = (id, focus) => game.jobBoard.craft(id, { focus: !!focus });
  game.polishItem = (itemId, quality, perfection) => game.jobBoard.polish(itemId, quality, perfection);
  game.fulfillNpcService = (id) => game.jobBoard.fulfillService(id);
  game.salvageItem = (itemId, quality, perfection) => game.jobBoard.salvageOwn(itemId, quality, perfection);
  game.getJobsView = () => game.jobBoard.getView();
  game.startRepair = (itemId, quality, perfection, mode) => game.jobBoard.startRepair(itemId, quality, perfection, mode);
  game.getRepairQuote = (itemId, quality, perfection, mode) => game.jobBoard.repairQuote(itemId, quality, perfection, mode);
  game.deliverNpcOrder = (id) => game.jobBoard.deliverNpcOrder(id);
  game.getTradingView = () => game.tradingDesk.getView();
  game.toggleWatch = (itemId) => { const r = game.tradingDesk.toggleWatch(itemId); game._notifyUI(); return r; };
  game.setPriceAlert = (itemId, below, above) => { const r = game.tradingDesk.setAlert(itemId, below, above); game._notifyUI(); return r; };
  game.addStandingOrder = (params) => { const r = game.tradingDesk.addStandingOrder(params); game._notifyUI(); return r; };
  game.toggleStandingOrder = (id) => { const r = game.tradingDesk.toggleStandingOrder(id); game._notifyUI(); return r; };
  game.removeStandingOrder = (id) => { const r = game.tradingDesk.removeStandingOrder(id); game._notifyUI(); return r; };
  game.markAlertsRead = () => { game.tradingDesk.markAlertsRead(); game._notifyUI(); };
  game.getGameNow = () => game.timeManager.now();

  // ---------- Marchandage ----------
  game.getNegotiationQuote = (offerId) => game.negotiation.quote(offerId);
  game.negotiate = (offerId, price, qty, opts) => {
    const r = game.negotiation.propose(offerId, price, qty, opts);
    if (r.success && r.outcome === 'accepted') game.career?.check();
    return r;
  };

  // ---------- Crédit du Comptoir ----------
  game.getCreditView = () => game.credit.getView();
  game.getCreditQuote = (amount, days) => game.credit.quote(amount, days);
  game.borrow = (amount, days) => game.credit.borrow(amount, days);
  game.repayLoan = () => { const r = game.credit.repay(); if (r.success) game.career?.check(); return r; };

  // ---------- Rang, parcours, patrimoine ----------
  game.getRankView = () => getRankView(game.player.reputation || 0);
  game.getCareerView = () => game.career.getView();
  game.notePanel = (panel) => { game.career?.notePanel(panel); };

  /** Patrimoine = argent + stock au prix du marché + offres en cours + établi − crédit. */
  game.getNetWorth = function() {
    const value = (itemId, q, p) => game.getAdjustedMarketPrice(itemId, q ?? 50, p ?? 50) || 0;
    const cash = game.player.money;
    const stock = game.player.inventory.items.reduce((t, s) => t + value(s.itemId, s.quality, s.perfection) * s.quantity, 0);
    let listed = 0; let locked = 0;
    game.offers.forEach(o => {
      if (o.status !== 'active') return;
      if (o.ownerId === 'player' && o.type === 'sell') listed += value(o.itemId, o.quality, o.perfection) * o.quantity;
      if (o.ownerId === 'player' && o.type === 'buy') locked += o.price * o.quantity;
      if (o.type === 'sell' && o.currentBidderId === 'player' && o.currentBid != null) locked += o.currentBid * o.quantity;
    });
    const bench = (game.jobBoard?.bench || []).reduce((t, e) => t + value(e.itemId, e.toQuality ?? e.quality, e.perfection) * (e.quantity || 1), 0);
    const debt = game.credit?.outstanding?.() || 0;
    const r = (n) => Math.round(n * 100) / 100;
    const total = r(cash + stock + listed + locked + bench - debt);
    return { total, cash: r(cash), stock: r(stock), listed: r(listed), locked: r(locked), bench: r(bench), debt: r(debt) };
  };

  // ---------- Vente groupée ----------
  /** Offres d'achat (PNJ et Comptoir) pour un objet, de la mieux payée à la moins bien payée. */
  game.getBulkSellPlan = function(itemId, minPrice = 0) {
    const owned = game.player.inventory.count(itemId);
    const offers = game.getActiveBuyOffers()
      .filter(o => o.itemId === itemId && o.ownerId !== 'player' && o.price >= minPrice && o.quantity > 0)
      .sort((a, b) => b.price - a.price || a.createdAt - b.createdAt);
    let left = owned; let total = 0; const lines = [];
    for (const o of offers) {
      if (left <= 0) break;
      const qty = Math.min(left, o.quantity);
      lines.push({ offerId: o.id, buyer: game.getNpcName(o.ownerId), qty, price: o.price });
      total += qty * o.price; left -= qty;
    }
    const sold = owned - left;
    const avgCost = game._getAveragePlayerCost(itemId);
    return {
      itemId, owned, sold, remaining: left, lines,
      total: Math.round(total * 100) / 100,
      avgPrice: sold ? Math.round((total / sold) * 100) / 100 : null,
      margin: avgCost != null && sold ? Math.round((total - avgCost * sold) * 100) / 100 : null
    };
  };
  game.bulkSell = function(itemId, minPrice = 0) {
    const plan = game.getBulkSellPlan(itemId, minPrice);
    if (!plan.sold) return { success: false, error: "Aucune offre d'achat pour cet objet à ce prix" };
    let sold = 0; let total = 0;
    for (const line of plan.lines) {
      const r = game.fulfillBuyOffer(line.offerId, line.qty);
      if (r.success) { sold += line.qty; total += r.total; }
    }
    if (!sold) return { success: false, error: 'Vente impossible' };
    const item = getItemById(itemId);
    return { success: true, sold, total: Math.round(total * 100) / 100, name: item?.name || itemId, offers: plan.lines.length };
  };

  // Résumé de progression : titre de rang et frais réels (manquaient dans l'écran Objectifs)
  const origSummary = game.getProgressSummary.bind(game);
  game.getProgressSummary = function() {
    const s = origSummary();
    const rank = rankFor(game.player.reputation || 0);
    return { ...s, reputationTitle: rank.title, rankIcon: rank.icon, feeMultiplier: game.player.getFeeMultiplier() };
  };

  const origProfiles = game.getNpcProfiles.bind(game);
  game.getNpcProfiles = function() {
    return origProfiles().map(p => {
      const ai = game.npcController?.getAiSnapshot?.(p.id) || {};
      return {
        ...p,
        lastIntent: ai.lastIntent || game.npcController?.npcStates?.[p.id]?.lastIntent || null,
        mood: ai.mood ?? 0,
        rivalry: ai.rivalry ?? 0,
        focusName: ai.focusName || null,
        clanId: ai.clanId || p.clanId || null,
        clanName: ai.clanName || null,
        clanIcon: ai.clanIcon || null,
        clanColor: ai.clanColor || null,
        trust: ai.trust ?? 0,
        lastReason: ai.lastReason || null,
        strategy: ai.strategy || null,
        strategyText: ai.strategyText || null,
        profession: ai.profession || null,
        professionIcon: ai.professionIcon || null,
        professionText: ai.professionText || null,
        repaired: ai.repaired ?? 0,
        arbitrages: ai.arbitrages ?? 0,
        capitalState: ai.capitalState || null,
        capitalLabel: ai.capitalLabel || null,
        stock: ai.stock ?? null,
        stockTarget: ai.stockTarget ?? null,
        stockLabel: ai.stockLabel || null,
        needs: ai.needs || [],
        journal: ai.journal || [],
        actionsToday: ai.actionsToday ?? 0,
        actionBudget: ai.actionBudget ?? null,
        allied: game.player.allianceClanId && game.player.allianceClanId === (ai.clanId || p.clanId)
      };
    });
  };

  game.getOrderBook = function(itemId) {
    const sells = game.offers.filter(o => o.type === 'sell' && o.status === 'active' && o.itemId === itemId);
    const buys = game.offers.filter(o => o.type === 'buy' && o.status === 'active' && o.itemId === itemId);
    const bestSell = sells.length ? Math.min(...sells.map(o => o.currentBid != null ? o.currentBid : o.price)) : null;
    const bestBuy = buys.length ? Math.max(...buys.map(o => o.price)) : null;
    return {
      bestSell,
      bestBuy,
      spread: bestSell != null && bestBuy != null ? Math.round((bestSell - bestBuy) * 100) / 100 : null,
      sellQty: sells.reduce((s, o) => s + o.quantity, 0),
      buyQty: buys.reduce((s, o) => s + o.quantity, 0)
    };
  };

  if (typeof window !== 'undefined') {
    setTimeout(() => window.dispatchEvent(new CustomEvent('panel-changed')), 40);
  }
  return game;
}
