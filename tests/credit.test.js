import { CREDIT_TUNING } from '../js/systems/Credit.js';
import { rankFor } from '../js/core/Ranks.js';
import { assert, assertEqual, runSuite } from './assert.js';
import { makeGame, totalMoney } from './helpers.js';

function nextDay(game) {
  game.timeManager.gameTimeMs += game.timeManager.msPerGameDay;
}

export function run() {
  return runSuite('crédit', [
    ['emprunt : l\'argent vient du Comptoir et des marchands aisés, rien n\'est créé', async () => {
      const { game, restore } = await makeGame();
      try {
        game.reserve.treasury = 1200;
        const before = totalMoney(game);
        const cash = game.player.money;
        const view = game.getCreditView();
        assertEqual(view.rankLimit, 300, 'plafond Nouveau venu');
        const r = game.borrow(250, 3);
        assert(r.success, r.error);
        assertEqual(game.player.money, Math.round((cash + 250) * 100) / 100);
        assert(Math.abs(totalMoney(game) - before) < 0.02, 'masse monétaire inchangée');
        assertEqual(game.reserve.treasury >= CREDIT_TUNING.reserveKeep, true, 'le Comptoir garde sa réserve');
        assertEqual(game.borrow(50, 3).success, false, 'un seul crédit à la fois');
      } finally { restore(); }
    }],
    ['plafond selon le rang, refus si réputation négative ou montant trop haut', async () => {
      const { game, restore } = await makeGame();
      try {
        game.reserve.treasury = 3000;
        assertEqual(game.borrow(400, 7).success, false, 'au-dessus du plafond du rang');
        game.player.reputation = 18;
        assertEqual(rankFor(18).creditLimit, 1000);
        const ok = game.borrow(900, 7);
        assert(ok.success, ok.error);
        game.credit.loan = null;
        game.player.reputation = -5;
        const no = game.borrow(100, 7);
        assertEqual(no.success, false);
        assert(/négative/.test(no.error));
      } finally { restore(); }
    }],
    ['remboursement anticipé : au moins 1 jour d\'intérêts, payés aux prêteurs (+2 réputation)', async () => {
      const { game, restore } = await makeGame();
      try {
        game.reserve.treasury = 1500;
        const cash = game.player.money;
        const before = totalMoney(game);
        const rep = game.player.reputation;
        game.borrow(300, 7);
        const r = game.repayLoan();
        assert(r.success, r.error);
        const interest = Math.round(300 * rankFor(rep).creditRate * 100) / 100;
        assertEqual(game.player.money, Math.round((cash - interest) * 100) / 100, 'emprunter puis rembourser coûte des intérêts');
        assert(Math.abs(totalMoney(game) - before) < 0.02, 'argent conservé');
        assertEqual(game.player.reputation, rep + CREDIT_TUNING.onTimeRep);
        assertEqual(game.credit.stats.onTime, 1);
        assertEqual(game.credit.loan, null);
      } finally { restore(); }
    }],
    ['échéance : prélèvement automatique si le solde suffit', async () => {
      const { game, restore } = await makeGame();
      try {
        game.reserve.treasury = 1500;
        game.borrow(200, 3);
        for (let i = 0; i < 3; i++) { nextDay(game); game.credit.onNewDay(); }
        assertEqual(game.credit.loan, null, 'soldé');
        assertEqual(game.credit.stats.onTime, 1);
        assertEqual(game.credit.history[0].interest, Math.round(200 * 0.015 * 3 * 100) / 100, 'intérêts sur 3 jours');
      } finally { restore(); }
    }],
    ['retard : pénalité, réputation en baisse, ventes saisies à 50 %, puis prélèvement', async () => {
      const { game, restore } = await makeGame();
      try {
        game.reserve.treasury = 1500;
        game.borrow(300, 3);
        game.player.money = 0;
        const before = totalMoney(game);
        game.credit.loan.dueDay = game.credit._day();
        const ev = game.credit.onNewDay();
        assertEqual(ev.type, 'overdue');
        assertEqual(game.player.reputation, CREDIT_TUNING.lateRepFirst, 'réputation −3');
        const owed = game.credit.outstanding();
        game.credit.onTransaction({ sellerId: 'player', buyerId: 'npc_01', total: 100 });
        // La vente simulée n'a pas crédité le joueur : la saisie ne prend que ce qu'il possède
        assertEqual(game.credit.outstanding(), owed, 'rien à saisir sans argent');
        let added = 100;
        game.player.money = 100;
        game.credit.onTransaction({ sellerId: 'player', buyerId: 'npc_01', total: 100 });
        assertEqual(game.player.money, 50, '50 % saisis');
        assert(game.credit.outstanding() < owed);
        added += 1000 - game.player.money;
        game.player.money = 1000;
        game.credit.onNewDay(); game.credit.onNewDay();
        assertEqual(game.credit.loan, null, 'prélevé au 3ᵉ jour de retard');
        assertEqual(game.credit.stats.late, 1);
        assert(Math.abs(totalMoney(game) - (before + added)) < 0.02, 'argent conservé (hors argent ajouté par le test)');
      } finally { restore(); }
    }],
    ['défaut (analyse GD, P2) : saisie du stock au 5ᵉ jour par le Comptoir, argent conservé, puis 14 jours sans crédit', async () => {
      const { game, restore } = await makeGame();
      try {
        game.reserve.treasury = 3000;
        game.player.inventory.items.length = 0;
        game.player.inventory.add('item_001', 4, 70, 60, 100);
        game.borrow(300, 3);
        game.player.money = 0; // tout l'argent est parti en stock : le prélèvement automatique échoue
        const before = totalMoney(game);
        const stockBefore = game.reserve.stock.item_001 || 0;
        const rep0 = game.player.reputation;
        game.credit.loan.dueDay = game.credit._day();
        let ev;
        for (let d = 0; d < CREDIT_TUNING.seizeStockAfterDays; d++) { ev = game.credit.onNewDay(); nextDay(game); }
        assert(ev.seizedItems > 0, 'stock saisi');
        assert(game.player.inventory.count('item_001') < 4, 'objets retirés du sac');
        assert((game.reserve.stock.item_001 || 0) > stockBefore, 'objets au Comptoir');
        assert(Math.abs(totalMoney(game) - before) < 0.05, `argent conservé (${before} → ${totalMoney(game)})`);
        assert(game.player.reputation <= rep0 + CREDIT_TUNING.lateRepFirst + CREDIT_TUNING.lateRepDaily * (CREDIT_TUNING.seizeStockAfterDays - 1) + 0.001, 'réputation fortement entamée');
        if (game.credit.loan) { game.player.money += 2000; game.credit.repay(); }
        assertEqual(game.credit.loan, null, 'dette soldée');
        assertEqual(game.credit.stats.late, 1, 'compté en retard');
        assertEqual(game.credit.limit(), 0, 'plus de crédit');
        assertEqual(game.borrow(100, 3).success, false, 'emprunt refusé');
        for (let d = 0; d < CREDIT_TUNING.banDaysAfterLate; d++) nextDay(game);
        assertEqual(game.credit.banned(), false, 'interdiction levée après 14 jours');
        game.player.reputation = Math.max(game.player.reputation, rep0);
        assert(game.credit.limit() > 0, 'crédit à nouveau possible');
      } finally { restore(); }
    }],
    ['défaut : le mauvais payeur finit derrière le commerçant honnête (simulation)', async () => {
      const { runSimulation } = await import('../scripts/simCore.mjs');
      const quiet = console.error; console.error = () => {};
      try {
        const res = {};
        for (const mode of ['honest', 'defaulter']) res[mode] = (await runSimulation({ days: 120, seeds: 2, bot: mode })).summary.bot;
        assert(res.honest.worthEnd > res.honest.worthStart, `honnête rentable : ${res.honest.worthStart} → ${res.honest.worthEnd}`);
        assert(res.defaulter.worthEnd < res.honest.worthEnd - 200, `mauvais payeur ${res.defaulter.worthEnd} < honnête ${res.honest.worthEnd}`);
        assert(res.defaulter.worthEnd < res.defaulter.worthStart, `le défaut ne rapporte pas : ${res.defaulter.worthStart} → ${res.defaulter.worthEnd}`);
      } finally { console.error = quiet; }
    }],
    ['ancienne sauvegarde de crédit (sans interdiction) : chargée', async () => {
      const { Credit } = await import('../js/systems/Credit.js');
      const { game, restore } = await makeGame();
      try {
        const c = new Credit(game, { loan: null, history: [], stats: { taken: 2, repaid: 2 }, seq: 3 });
        assertEqual(c.bannedUntil, null);
        assertEqual(c.banned(), false);
        assertEqual(c.stats.seized, 0);
      } finally { restore(); }
    }]
  ]);
}
