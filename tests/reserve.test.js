import { Game } from '../js/core/Game.js';
import { MarketReserve, RESERVE_ID, RESERVE_TUNING } from '../js/systems/MarketReserve.js';
import { Offer } from '../js/models/Offer.js';
import { Transaction } from '../js/models/Transaction.js';
import { assert, assertEqual, runSuite } from './assert.js';

function quietGame() {
  const game = new Game();
  game.save = () => {};
  return game;
}

export function run() {
  return runSuite('comptoir', [
    ['trésorerie : dépôt, retrait, jamais négative', () => {
      const r = new MarketReserve({ treasury: 100, stock: {} });
      r.deposit(50, 'taxes');
      assertEqual(r.treasury, 150);
      assertEqual(r.stats.taxes, 50);
      assertEqual(r.withdraw(500), 150);
      assertEqual(r.treasury, 0);
    }],
    ['revend son stock quand un objet est en rupture', () => {
      const game = quietGame();
      game.offers = game.offers.filter(o => o.itemId !== 'item_004');
      game.reserve.stock.item_004 = 3;
      game.reserve.dailyIntervene(game);
      const sell = game.offers.find(o => o.ownerId === RESERVE_ID && o.type === 'sell' && o.itemId === 'item_004');
      assert(sell, 'annonce du Comptoir');
      const fair = game.economy.getFairValue('item_004');
      assert(Math.abs(sell.price - fair * RESERVE_TUNING.ceiling) < 0.02, 'au prix plafond');
    }],
    ['rachète quand un objet est bradé', () => {
      const game = quietGame();
      const fair = game.economy.getFairValue('item_002');
      const dumped = new Offer({ type: 'sell', itemId: 'item_002', quantity: 4, price: Math.round(fair * 0.5 * 100) / 100, ownerId: 'npc_02', durationDays: 1 });
      game.offers.push(dumped);
      const before = game.npcController.getCapital('npc_02');
      game.reserve.dailyIntervene(game);
      assert(game.reserve.stock.item_002 >= 2, 'stock racheté');
      assert(game.npcController.getCapital('npc_02') > before, 'le vendeur est payé');
    }],
    ['les transactions avec le Comptoir conservent l\'argent', () => {
      const game = quietGame();
      const t0 = game.reserve.treasury;
      const c0 = game.npcController.getCapital('npc_01');
      const tx = new Transaction({ itemId: 'item_004', quantity: 2, price: 10, sellerId: RESERVE_ID, buyerId: 'npc_01', type: 'buyout' });
      game.npcController.debitNpc('npc_01', 20);
      game._handleTransaction(tx);
      assertEqual(Math.round((game.reserve.treasury - t0) * 100), 2000, 'Comptoir encaissé');
      assertEqual(Math.round((c0 - game.npcController.getCapital('npc_01')) * 100), 2000, 'PNJ débité');
      assertEqual(game.getNpcName(RESERVE_ID), 'Comptoir municipal');
    }],
    ['taxe sur les ventes des PNJ', () => {
      const game = quietGame();
      const t0 = game.reserve.treasury;
      const c0 = game.npcController.getCapital('npc_03');
      game._handleTransaction(new Transaction({ itemId: 'item_004', quantity: 1, price: 100, sellerId: 'npc_03', buyerId: 'player', type: 'buyout' }));
      const tax = 100 * RESERVE_TUNING.npcSalesTax;
      assertEqual(Math.round((game.reserve.treasury - t0) * 100), Math.round(tax * 100));
      assertEqual(Math.round((game.npcController.getCapital('npc_03') - c0) * 100), Math.round((100 - tax) * 100));
    }],
    ['achat immédiat d\'un PNJ : l\'enchérisseur est remboursé', () => {
      const game = quietGame();
      const offer = new Offer({ type: 'sell', itemId: 'item_002', quantity: 1, price: 30, buyoutPrice: 60, ownerId: 'npc_01', durationDays: 1 });
      game.offers.push(offer);
      const m0 = game.player.money;
      assert(game.auctionHouse.placeBid(offer, 'player', 35).success, 'enchère');
      assertEqual(Math.round(game.player.money), Math.round(m0 - 35));
      game.npcController.debitNpc('npc_02', 60);
      const res = game.npcController.executeBuyout(offer, 'npc_02', 1);
      assert(res.success, 'achat');
      assertEqual(Math.round(game.player.money), Math.round(m0), 'enchère rendue');
    }],
    ['subventions : l\'excédent va aux marchands en difficulté', () => {
      const game = quietGame();
      game.reserve.treasury = RESERVE_TUNING.targetTreasury + 1000;
      game.npcController.npcStates.npc_01.capital = 10;
      const paid = game.reserve.subsidize(game.npcController);
      assert(paid > 0, 'versé');
      assert(game.npcController.getCapital('npc_01') > 10, 'PNJ aidé');
    }],
    ['santé de l\'économie lisible', () => {
      const game = quietGame();
      game.recordEconomySnapshot(1);
      const h = game.getEconomyHealth();
      assertEqual(h.status, 'stable');
      assert(h.label && h.explanation, 'textes');
      assert(h.moneySupply > 0 && h.treasury > 0, 'masses');
      assert(Array.isArray(h.history), 'historique');
    }],
    ['sauvegarde / chargement du Comptoir', () => {
      const r = new MarketReserve({ treasury: 321, stock: { item_004: 4 }, stats: { taxes: 7 } });
      const back = MarketReserve.fromJSON(JSON.parse(JSON.stringify(r.toJSON())));
      assertEqual(back.treasury, 321);
      assertEqual(back.stock.item_004, 4);
      assertEqual(back.stats.taxes, 7);
    }]
  ]);
}
