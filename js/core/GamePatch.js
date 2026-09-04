import { JobBoard } from '../systems/JobBoard.js';
import { Storage } from '../utils/storage.js';

export function enhanceGame(game) {
  if (!game || game.__enhanced) return game;
  game.__enhanced = true;

  game.auctionHouse.lockFunds = (id, amount) => {
    if (id === 'player') return game.removeMoney(amount);
    return game.npcController.debitNpc(id, amount);
  };
  game.auctionHouse.unlockFunds = (id, amount) => {
    if (id === 'player') game.addMoney(amount);
    else game.npcController.creditNpc(id, amount);
  };

  if (game.timeManager && !game.timeManager.gameTimeMs && game.currentDay > 1) {
    game.timeManager.gameTimeMs = (game.currentDay - 1) * game.timeManager.msPerGameDay;
  }

  const origExpire = game.matchingEngine.expireOffers.bind(game.matchingEngine);
  game.matchingEngine.expireOffers = (offers, _now) => origExpire(offers, game.timeManager.now());

  if (game.npcController) {
    game.npcController.getNow = () => game.timeManager.now();
    game.npcController.getMsPerGameDay = () => game.timeManager.msPerGameDay;
    game.npcController.executeBid = (offer, npcId, amount) => game.auctionHouse.placeBid(offer, npcId, amount);
    game.npcController.executeCancel = (offer, npcId) => {
      if (!offer || offer.ownerId !== npcId || offer.status !== 'active') return { success: false };
      if (offer.currentBidderId && offer.currentBid != null) {
        const refund = Math.round(offer.currentBid * offer.quantity * 100) / 100;
        if (game.auctionHouse.unlockFunds) game.auctionHouse.unlockFunds(offer.currentBidderId, refund);
      }
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

  const savedJobs = (Storage.load() || {}).jobs || {};
  game.jobBoard = new JobBoard(game, savedJobs);
  game.jobBoard.ensureContracts();

  const origSave = game.save.bind(game);
  game.save = function() {
    origSave();
    const data = Storage.load();
    if (data) {
      data.jobs = game.jobBoard.toJSON();
      Storage.save(data);
    }
  };

  const origTick = game.tick.bind(game);
  game.tick = function() {
    const dayBefore = game.timeManager.getCurrentDay();
    const snapshot = game.offers.map(o => `${o.id}:${o.currentBid}:${o.status}:${o.quantity}`).join('|');
    origTick();
    if (game.timeManager.getCurrentDay() !== dayBefore) {
      game.jobBoard.onNewDay();
      if (game.npcController && typeof game.npcController.onNewDay === 'function') {
        game.npcController.onNewDay(game.timeManager.getCurrentDay());
      }
      game.save();
    } else {
      game.jobBoard.ensureContracts();
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
    if (result.fee) game.jobBoard.depositFee(result.fee);
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
    if (result.fee) game.jobBoard.depositFee(result.fee);
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
  game.getGameNow = () => game.timeManager.now();

  const origProfiles = game.getNpcProfiles.bind(game);
  game.getNpcProfiles = function() {
    return origProfiles().map(p => {
      const ai = game.npcController?.getAiSnapshot?.(p.id) || {};
      return {
        ...p,
        lastIntent: ai.lastIntent || game.npcController?.npcStates?.[p.id]?.lastIntent || null,
        mood: ai.mood ?? 0,
        rivalry: ai.rivalry ?? 0,
        focusName: ai.focusName || null
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
