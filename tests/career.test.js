import { Offer } from '../js/models/Offer.js';
import { Transaction } from '../js/models/Transaction.js';
import { CHAPTERS } from '../js/systems/Career.js';
import { rankFor, getRankView, RANKS } from '../js/core/Ranks.js';
import { assert, assertEqual, runSuite } from './assert.js';
import { makeGame, totalMoney, installMemoryStorage } from './helpers.js';

function npcBuy(game, itemId, price, qty, owner) {
  const o = new Offer({ type: 'buy', itemId, quantity: qty, price, ownerId: owner, durationDays: 1, createdAt: game.timeManager.now(), msPerGameDay: game.timeManager.msPerGameDay });
  game.offers.push(o);
  return o;
}

export function run() {
  return runSuite('parcours-rangs', [
    ['rangs : paliers, avantages et résumé de progression corrigé', async () => {
      assertEqual(rankFor(0).title, 'Nouveau venu');
      assertEqual(rankFor(18).title, 'Commerçant fiable');
      assertEqual(rankFor(60).title, 'Maison reconnue');
      assertEqual(rankFor(-3).creditLimit, 0, 'pas de crédit si réputation négative');
      const v = getRankView(10);
      assertEqual(v.next.title, 'Commerçant fiable');
      assertEqual(v.toNext, 8);
      assertEqual(v.table.length, RANKS.length);
      const { game, restore } = await makeGame();
      try {
        const slots = game.tradingDesk.slots();
        game.player.reputation = 18;
        assertEqual(game.tradingDesk.slots(), slots + 1, 'ordre permanent en plus au rang 2');
        const s = game.getProgressSummary();
        assertEqual(s.reputationTitle, 'Commerçant fiable');
        assert(s.feeMultiplier < 1, 'frais réduits');
      } finally { restore(); }
    }],
    ['parcours : chapitre 1 terminé → récompense versée une seule fois, chapitre 2 débloqué', async () => {
      const { game, restore } = await makeGame();
      try {
        const c = game.career;
        let v = c.getView();
        assertEqual(v.current, 0);
        assertEqual(v.nextStep.id, 'visit_market');
        game.notePanel('market');
        game.player.stats.totalSales = 1;
        game.player.stats.totalPurchases = 1;
        game.tradingDesk.toggleWatch('item_004');
        const rep = game.player.reputation;
        const done = c.check();
        assertEqual(done.length, 1);
        assertEqual(game.player.reputation, rep + CHAPTERS[0].reward.reputation);
        assertEqual(c.check().length, 0, 'pas de double récompense');
        v = c.getView();
        assertEqual(v.current, 1);
        assertEqual(v.chapters[0].status, 'done');
        assertEqual(v.chapters[1].status, 'current');
        assertEqual(v.chapters[2].status, 'locked');
      } finally { restore(); }
    }],
    ['compteurs : achat sous la moyenne, vente avec marge, pénurie approvisionnée, partenaires', async () => {
      const { game, restore } = await makeGame();
      try {
        const c = game.career;
        c.counters.shortageSales = 0;
        game.getSupplyView = () => ({ status: 'normal' });
        c.onTransaction(new Transaction({ itemId: 'item_004', quantity: 1, price: 5, sellerId: 'npc_01', buyerId: 'player', type: 'buyout', priceDeltaPct: -10 }));
        c.onTransaction(new Transaction({ itemId: 'item_004', quantity: 1, price: 9, sellerId: 'player', buyerId: 'npc_02', type: 'matching', playerMarginPct: 20 }));
        game.getSupplyView = () => ({ status: 'shortage' });
        c.onTransaction(new Transaction({ itemId: 'item_004', quantity: 1, price: 9, sellerId: 'player', buyerId: 'npc_03', type: 'matching' }));
        const m = c.metrics();
        assertEqual(m.buysBelow, 1);
        assertEqual(m.sellsMargin, 1);
        assertEqual(m.shortageSales, 1, 'seule la vente en pénurie compte');
        assertEqual(m.partners, 3);
      } finally { restore(); }
    }],
    ['patrimoine : argent + stock au prix du marché + offres − crédit', async () => {
      const { game, restore } = await makeGame();
      try {
        game.player.inventory.items = [];
        game.player.money = 1000;
        game.player.inventory.add('item_004', 2, 50, 50, 5);
        const unit = game.getAdjustedMarketPrice('item_004', 50, 50);
        let w = game.getNetWorth();
        assertEqual(w.cash, 1000);
        assert(Math.abs(w.stock - unit * 2) < 0.02, 'stock valorisé');
        game.reserve.treasury = 1500;
        game.borrow(200, 7);
        w = game.getNetWorth();
        assert(w.debt >= 200, 'dette déduite');
        assert(Math.abs(w.total - (1200 + unit * 2 - w.debt)) < 0.05, 'emprunter n\'enrichit pas');
      } finally { restore(); }
    }],
    ['vente groupée : remplit les offres les mieux payées d\'abord, argent conservé', async () => {
      const { game, restore } = await makeGame();
      try {
        game.offers.forEach(o => { if (o.itemId === 'item_004') o.status = 'cancelled'; });
        game.player.inventory.items = [];
        game.player.inventory.add('item_004', 5, 50, 50, 4);
        npcBuy(game, 'item_004', 6, 2, 'npc_01');
        npcBuy(game, 'item_004', 7, 2, 'npc_02');
        npcBuy(game, 'item_004', 3, 5, 'npc_03');
        const plan = game.getBulkSellPlan('item_004', 5);
        assertEqual(plan.sold, 4, 'les offres sous le prix mini sont ignorées');
        assertEqual(plan.total, 26);
        assertEqual(plan.lines[0].price, 7, 'meilleure offre d\'abord');
        assertEqual(plan.margin, 10);
        const before = totalMoney(game);
        const r = game.bulkSell('item_004', 5);
        assert(r.success, r.error);
        assertEqual(r.sold, 4);
        assertEqual(game.player.inventory.count('item_004'), 1);
        assert(Math.abs(totalMoney(game) - before) < 0.02, 'argent conservé');
      } finally { restore(); }
    }],
    ['nouvelle partie : les marchands ouvrent boutique immédiatement', async () => {
      const restore = installMemoryStorage();
      try {
        const { Game } = await import('../js/core/Game.js');
        const { enhanceGame } = await import('../js/core/GamePatch.js');
        const game = new Game();
        game.npcController.runMatching = () => {};
        game.__newGame = true;
        const before = game.offers.filter(o => o.status === 'active' && o.ownerId.startsWith('npc')).length;
        enhanceGame(game);
        const after = game.offers.filter(o => o.status === 'active' && o.ownerId.startsWith('npc')).length;
        assert(after >= before + 8, `annonces des marchands dès le départ (${before} → ${after})`);
      } finally { restore(); }
    }],
    ['sauvegarde : marchandage, crédit et parcours rechargés ; ancienne sauvegarde migrée', async () => {
      const { game, restore } = await makeGame();
      try {
        game.reserve.treasury = 1500;
        game.borrow(100, 7);
        game.notePanel('market');
        game.negotiation.stats.deals = 3;
        game.save();
        const { Game } = await import('../js/core/Game.js');
        const { enhanceGame } = await import('../js/core/GamePatch.js');
        const g2 = new Game();
        g2.load();
        enhanceGame(g2);
        assert(g2.credit.loan && g2.credit.loan.principal === 100, 'crédit rechargé');
        assertEqual(g2.negotiation.stats.deals, 3);
        assert(g2.career.visited.includes('market'));
        // Ancienne sauvegarde : aucun des nouveaux champs
        const raw = JSON.parse(localStorage.getItem('commerce_tycoon_save'));
        delete raw.credit; delete raw.negotiation; delete raw.career;
        raw.transactions = [{ id: 't1', itemId: 'item_004', quantity: 1, price: 3, total: 3, sellerId: 'npc_01', buyerId: 'player', type: 'buyout', priceDeltaPct: -12 }];
        localStorage.setItem('commerce_tycoon_save', JSON.stringify(raw));
        const g3 = new Game();
        g3.load();
        enhanceGame(g3);
        assertEqual(g3.credit.loan, null);
        assertEqual(g3.career.counters.buysBelow, 1, 'compteurs reconstitués depuis l\'historique');
        assert(g3.getCareerView().chapters.length === 5);
      } finally { restore(); }
    }]
  ]);
}
