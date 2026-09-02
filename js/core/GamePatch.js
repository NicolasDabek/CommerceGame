/** Surcharge runtime : annonces visibles, carnet, horloge jeu, lockFunds */
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

  if (game.npcController) {
    game.npcController.getNow = () => game.timeManager.now();
    game.npcController.getMsPerGameDay = () => game.timeManager.msPerGameDay;
  }

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

    game.offers.push(result.offer);
    if (params.autoMatch === true) {
      const { transactions } = game.matchingEngine.match(result.offer, game.offers);
      result.matched = transactions.length;
      result.soldQty = transactions.reduce((s, tx) => s + tx.quantity, 0);
    } else {
      result.matched = 0;
      result.soldQty = 0;
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

    game.offers.push(result.offer);
    if (params.autoMatch === true) {
      const { transactions } = game.matchingEngine.match(result.offer, game.offers);
      result.matched = transactions.length;
    } else {
      result.matched = 0;
    }
    game.save();
    game._notifyUI();
    return result;
  };

  game.getGameNow = () => game.timeManager.now();

  game.getOrderBook = function(itemId) {
    const sells = game.offers.filter(o => o.type === 'sell' && o.status === 'active' && o.itemId === itemId);
    const buys = game.offers.filter(o => o.type === 'buy' && o.status === 'active' && o.itemId === itemId);
    const bestSell = sells.length ? Math.min(...sells.map(o => o.price)) : null;
    const bestBuy = buys.length ? Math.max(...buys.map(o => o.price)) : null;
    const spread = bestSell != null && bestBuy != null
      ? Math.round((bestSell - bestBuy) * 100) / 100
      : null;
    return {
      bestSell,
      bestBuy,
      spread,
      sellQty: sells.reduce((s, o) => s + o.quantity, 0),
      buyQty: buys.reduce((s, o) => s + o.quantity, 0)
    };
  };

  return game;
}
