import { JobBoard, professionLevel, PROFESSION_LEVELS } from '../js/systems/JobBoard.js';
import { Offer } from '../js/models/Offer.js';
import { assert, assertEqual, runSuite } from './assert.js';
import { makeGame, drainItem } from './helpers.js';

const hours = (game, h) => { game.timeManager.gameTimeMs += game.timeManager.msPerGameDay / 24 * h; };

export function run() {
  return runSuite('metiers-atelier', [
    ['niveaux de métier et migration des anciennes sauvegardes', async () => {
      assertEqual(professionLevel(0), 1);
      assertEqual(professionLevel(39), 1);
      assertEqual(professionLevel(40), 2);
      assertEqual(professionLevel(PROFESSION_LEVELS[4]), 5);
      const { game, restore } = await makeGame();
      try {
        const jb = new JobBoard(game, { stats: { crafts: 6, repairs: 2, contracts: 3, scavenges: 0, stalls: 0, services: 0, salvages: 0, earned: 0 } });
        assertEqual(jb.level('craft'), 2, 'artisan niv. 2 (comme l\'ancien atelier)');
        assertEqual(jb.workshopLevel(), 2);
        assertEqual(jb.professions.repair.xp, 20);
        assertEqual(jb.professions.trade.xp, 45);
        assert(Array.isArray(jb.bench) && jb.bench.length === 0, 'établi vide');
      } finally { restore(); }
    }],
    ['devis : matériaux, fournitures, durée, profit attendu ; verrous par niveau', async () => {
      const { game, restore } = await makeGame();
      try {
        const jb = game.jobBoard;
        const q = jb.repairQuote('item_001', 20, 40, 'quick');
        assert(q.ok, q.error);
        assertEqual(q.materials.itemId, 'item_010');
        assert(q.supplies > 2 && q.hours === 4, `${q.supplies} € · ${q.hours} h`);
        assertEqual(Math.round((q.valueAfter - q.valueBefore - q.totalCost) * 100) / 100, q.profit, 'profit = gain − coûts');
        assert(!jb.repairQuote('item_001', 20, 40, 'refurbish').ok, 'remise à neuf verrouillée au niv. 1');
        assert(/rare/.test(jb.repairQuote('item_003', 20, 40, 'quick').error), 'objet rare verrouillé');
        assert(!jb.repairQuote('item_004', 20, 40, 'quick').ok, 'le café ne se répare pas');
        jb.professions.repair.xp = 120; // niv. 3
        const r = jb.repairQuote('item_003', 20, 40, 'refurbish');
        assert(r.ok && r.toQuality === 91, `Q${r.toQuality}`);
        const q3 = jb.repairQuote('item_001', 20, 40, 'quick');
        assert(q3.supplies < q.supplies && q3.hours < q.hours, 'moins cher et plus rapide au niv. 3');
        assertEqual(jb.benchSlots(), 2);
      } finally { restore(); }
    }],
    ['établi minuté : l\'objet revient réparé, les coûts vont au Comptoir', async () => {
      const { game, restore } = await makeGame();
      try {
        const jb = game.jobBoard;
        const inv = game.player.inventory;
        inv.add('item_008', 1, 20, 40, 15);
        inv.add('item_012', 2, 50, 50, 4);
        const treasury = game.reserve.treasury;
        const money = game.player.money;
        const res = jb.startRepair('item_008', 20, 40, 'quick');
        assert(res.success, res.error);
        assertEqual(inv.getStacks('item_008').filter(s => s.quality === 20).length, 0, 'objet sur l\'établi');
        assertEqual(inv.count('item_012'), 1, '1 bois consommé');
        assert(game.reserve.treasury > treasury && game.reserve.stats.workshop > 0, 'fournitures au Comptoir');
        assert(Math.abs(money - game.player.money - res.quote.supplies) < 0.01, 'fournitures débitées');
        assert(!jb.startRepair('item_008', 20, 40, 'quick').success, 'plus d\'objet / établi plein');
        hours(game, 2);
        assertEqual(jb.collectReady().length, 0, 'pas encore prêt');
        hours(game, 2.1);
        const done = jb.collectReady();
        assertEqual(done.length, 1, 'récupéré');
        const stack = inv.getStacks('item_008').find(s => s.quality === res.quote.toQuality);
        assert(stack, 'qualité améliorée');
        assert(stack.avgBuyPrice > 15, `prix de revient inclut la réparation (${stack.avgBuyPrice})`);
        assert(jb.professions.repair.xp >= 8, 'XP réparateur');
      } finally { restore(); }
    }],
    ['bonnes affaires à retaper : annonce abîmée rentable détectée', async () => {
      const { game, restore } = await makeGame();
      try {
        const fair = game.economy.getFairValue('item_001');
        const now = game.timeManager.now();
        const o = new Offer({ type: 'sell', itemId: 'item_001', quantity: 1, price: fair * 0.3, buyoutPrice: Math.round(fair * 0.35 * 100) / 100, ownerId: 'npc_06', durationDays: 1, quality: 12, perfection: 30, createdAt: now, msPerGameDay: game.timeManager.msPerGameDay });
        game.offers.push(o);
        const deals = game.jobBoard.getRefurbishDeals();
        const d = deals.find(x => x.offerId === o.id);
        assert(d && d.profit > 0, 'affaire détectée');
        assert(d.valueAfter > d.price + d.totalCost, 'revente > achat + coûts');
      } finally { restore(); }
    }],
    ['contrats : la pénurie passe en premier, payée par le Comptoir, livrée à son stock', async () => {
      const { game, restore } = await makeGame();
      try {
        drainItem(game, 'item_002');
        game.supplyDemand.update(game, 2);
        const jb = game.jobBoard;
        jb.contracts = jb._roll(3, 2);
        const c = jb.contracts[0];
        assertEqual(c.itemId, 'item_002', 'objet en pénurie en tête');
        assert(/Pénurie/.test(c.reason) && c.rush, c.reason);
        assert(c.premiumPct >= 30, `prime ${c.premiumPct} %`);
        game.player.inventory.add('item_002', c.quantity, 60, 50, 30);
        const treasury = game.reserve.treasury;
        const stock = game.reserve.stock.item_002 || 0;
        const money = game.player.money;
        const res = jb.complete(c.id);
        assert(res.success, res.error);
        assert(game.player.money - money >= c.reward - 0.01, 'récompense versée');
        assert(game.reserve.treasury < treasury && game.reserve.stats.contracts > 0, 'payé par le Comptoir');
        assertEqual(game.reserve.stock.item_002, stock + c.quantity, 'objets au Comptoir');
        assert(jb.professions.trade.xp >= 15, 'XP négociant');
      } finally { restore(); }
    }],
    ['commande d\'un marchand : payée avec son argent, objets livrés', async () => {
      const { game, restore } = await makeGame();
      try {
        const jb = game.jobBoard;
        jb._rollNpcOrders(game.timeManager.getCurrentDay());
        const o = jb.npcOrders[0];
        assert(o, 'commande générée');
        assert(!jb.deliverNpcOrder(o.id).success, 'refusée sans stock');
        game.player.inventory.add(o.itemId, o.quantity, 70, 50, 1);
        const cap = game.npcController.npcStates[o.npcId].capital;
        const money = game.player.money;
        const res = jb.deliverNpcOrder(o.id);
        assert(res.success, res.error);
        assert(Math.abs(game.npcController.npcStates[o.npcId].capital - (cap - o.pay)) < 0.01, 'débité au marchand');
        assert(Math.abs(game.player.money - money - o.pay) < 0.01, 'payé au joueur');
        assertEqual(o.status, 'done');
      } finally { restore(); }
    }],
    ['sauvegarde de l\'atelier : métiers, établi, commandes', async () => {
      const { game, restore } = await makeGame();
      try {
        game.jobBoard.professions.repair.xp = 77;
        game.jobBoard.bench.push({ id: 'b1', itemId: 'item_001', quality: 10, perfection: 20, toQuality: 26, toPerfection: 28, mode: 'quick', startedAt: 0, readyAt: 1e15, costBasis: null, spent: 5 });
        const data = JSON.parse(JSON.stringify(game.jobBoard.toJSON()));
        const jb2 = new JobBoard(game, data);
        assertEqual(jb2.professions.repair.xp, 77);
        assertEqual(jb2.bench.length, 1);
        assertEqual(jb2.level('repair'), 2);
      } finally { restore(); }
    }]
  ]);
}
