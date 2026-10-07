import { TradingDesk } from '../js/systems/TradingDesk.js';
import { Offer } from '../js/models/Offer.js';
import { assert, assertEqual, runSuite } from './assert.js';
import { makeGame } from './helpers.js';

function npcSell(game, itemId, price, owner = 'npc_05') {
  const now = game.timeManager.now();
  const o = new Offer({ type: 'sell', itemId, quantity: 2, price, buyoutPrice: price, ownerId: owner, durationDays: 1, quality: 50, perfection: 50, createdAt: now, msPerGameDay: game.timeManager.msPerGameDay });
  game.offers.push(o);
  return o;
}

export function run() {
  return runSuite('suivi-ordres', [
    ['liste de suivi : alerte déclenchée une seule fois au franchissement', async () => {
      const { game, restore } = await makeGame();
      try {
        game.offers.forEach(o => { if (o.itemId === 'item_004') o.status = 'cancelled'; });
        const desk = game.tradingDesk;
        assert(desk.toggleWatch('item_004').watched, 'suivi');
        desk.setAlert('item_004', '10,00', null);
        assertEqual(desk.alerts.length, 0, 'rien tant que le prix est haut');
        const o = npcSell(game, 'item_004', 9.5);
        desk.checkAlerts();
        assertEqual(desk.alerts.length, 1, 'alerte');
        assertEqual(desk.alerts[0].kind, 'below');
        desk.checkAlerts();
        assertEqual(desk.alerts.length, 1, 'pas de doublon');
        o.status = 'cancelled';
        desk.checkAlerts();
        npcSell(game, 'item_004', 9.2);
        desk.checkAlerts();
        assertEqual(desk.alerts.length, 2, 'se réarme après remontée');
        assertEqual(desk.unreadCount(), 2);
        desk.markAlertsRead();
        assertEqual(desk.unreadCount(), 0);
      } finally { restore(); }
    }],
    ['ordre d\'achat permanent : placé, rempli, renouvelé chaque jour', async () => {
      const { game, restore } = await makeGame();
      try {
        game.offers.forEach(o => { if (o.itemId === 'item_012') o.status = 'cancelled'; });
        const desk = game.tradingDesk;
        const res = desk.addStandingOrder({ itemId: 'item_012', price: 4, quantity: 3 });
        assert(res.success, res.error);
        const order = res.order;
        const first = game.offers.find(o => o.id === order.lastOfferId);
        assert(first && first.status === 'active' && first.type === 'buy' && first.ownerId === 'player', 'offre du jour');
        // Un marchand vend dans l'ordre
        game.npcController.executeFulfill(first, 'npc_03', 2);
        assertEqual(order.filledTotal, 2, 'remplissage suivi');
        assert(game.player.inventory.count('item_012') >= 2, 'bois reçu');
        // Lendemain : nouvelle offre
        game.timeManager.gameTimeMs += game.timeManager.msPerGameDay * 1.1;
        game.checkExpirations();
        desk.renewOrders();
        assert(order.lastOfferId !== first.id, 'renouvelé');
        // Places limitées
        desk.addStandingOrder({ itemId: 'item_010', price: 7, quantity: 1 });
        const third = desk.addStandingOrder({ itemId: 'item_004', price: 10, quantity: 1 });
        assert(!third.success && /ordres permanents/.test(third.error), 'limite de places');
        // Pause → offre annulée et remboursée
        const live = game.offers.find(o => o.id === order.lastOfferId);
        desk.toggleStandingOrder(order.id);
        assertEqual(live.status, 'cancelled');
      } finally { restore(); }
    }],
    ['bilan : marge réalisée, atelier, contrats, frais', async () => {
      const { game, restore } = await makeGame();
      try {
        const desk = game.tradingDesk;
        game.offers.forEach(o => { if (o.itemId === 'item_013') o.status = 'cancelled'; });
        const sell = npcSell(game, 'item_013', 80, 'npc_10');
        assert(game.buyout(sell.id, 1).success, 'achat');
        const now = game.timeManager.now();
        const buy = new Offer({ type: 'buy', itemId: 'item_013', quantity: 1, price: 100, ownerId: 'npc_04', durationDays: 1, createdAt: now, msPerGameDay: game.timeManager.msPerGameDay });
        game.offers.push(buy);
        assert(game.fulfillBuyOffer(buy.id, 1).success, 'vente');
        desk.recordWorkshopCost(5);
        desk.recordJob({ kind: 'contract', itemId: 'item_002', quantity: 1, amount: 50, costBasis: 30 });
        const v = desk.getView().journal;
        const row = v.rows.find(r => r.itemId === 'item_013');
        assertEqual(row.bought, 1);
        assertEqual(row.sold, 1);
        assertEqual(row.realized, 20, 'marge 100 − 80');
        assertEqual(v.workshop, 5);
        assertEqual(v.jobRealized, 20);
        assertEqual(v.net, Math.round((v.realized + 20 - 5 - v.fees) * 100) / 100);
        assert(v.daily.length >= 1, 'série quotidienne');
      } finally { restore(); }
    }],
    ['sauvegarde du suivi et des ordres', async () => {
      const { game, restore } = await makeGame();
      try {
        game.tradingDesk.toggleWatch('item_001');
        game.tradingDesk.setAlert('item_001', 100, 250);
        game.save();
        const data = JSON.parse(localStorage.getItem('commerce_tycoon_save'));
        assert(data.trading && data.trading.watchlist.length === 1, 'sauvegardé avec la partie');
        const desk2 = new TradingDesk(game, data.trading);
        assertEqual(desk2.watchlist[0].alertBelow, 100);
        assertEqual(desk2.watchlist[0].alertAbove, 250);
        const empty = new TradingDesk(game, undefined);
        assertEqual(empty.watchlist.length, 0, 'ancienne sauvegarde : vide');
      } finally { restore(); }
    }]
  ]);
}
