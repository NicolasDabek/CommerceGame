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
    }]
  ]);
}
