/**
 * Analyse GD passe 3, §3 : contrats et crédit doivent avoir un intérêt économique démontré.
 *  - un contrat livré rapporte au moins 10 % de plus que la vente des mêmes objets à l'étal du Comptoir ;
 *  - un prêt remboursé permet un achat en gros rentable qu'on n'aurait pas pu financer.
 */
import { Offer } from '../js/models/Offer.js';
import { NPCS } from '../js/data/npcs.js';
import { assert, runSuite } from './assert.js';
import { makeGame } from './helpers.js';

const r2 = (n) => Math.round(n * 100) / 100;
function nextDay(game) { game.timeManager.gameTimeMs += game.timeManager.msPerGameDay; }

/** Contrat ouvert le moins cher à honorer (objet commun de préférence). */
function cheapContract(game) {
  game.jobBoard.ensureContracts();
  return game.jobBoard.contracts.filter(j => j.status === 'open')
    .sort((a, b) => a.reward - b.reward)[0];
}

export function run() {
  return runSuite('rentabilité contrats et crédit (passe 3)', [
    ['contrat livré ≥ vente à l\'étal du Comptoir + 10 %', async () => {
      const { game, restore } = await makeGame({ reputation: 0 });
      try {
        const job = cheapContract(game);
        assert(job, 'au moins un contrat ouvert');
        const unitStall = r2(game.getAdjustedMarketPrice(job.itemId, 50, 50) * 0.9);
        const stallValue = r2(unitStall * job.quantity);
        game.player.inventory.add(job.itemId, job.quantity, 50, 50);
        const r = game.completeJob(job.id);
        assert(r.success, r.error);
        assert(r.payout >= stallValue * 1.1, `contrat ${r.payout} € contre étal ${stallValue} € (×${(r.payout / stallValue).toFixed(2)})`);
      } finally { restore(); }
    }],
    ['prêt remboursé : achat en gros pour un contrat, bénéfice net après intérêts', async () => {
      const { game, restore } = await makeGame({ reputation: 18 });
      try {
        game.reserve.treasury = 3000;
        const job = cheapContract(game);
        assert(job, 'au moins un contrat ouvert');
        const fair = game.economy.getFairValue(job.itemId);
        // Un marchand vend le lot entier à 95 % de la valeur normale
        const unit = r2(fair * 0.95);
        const cost = r2(unit * job.quantity);
        const seller = NPCS[0].id;
        const offer = new Offer({ type: 'sell', itemId: job.itemId, quantity: job.quantity, price: unit, buyoutPrice: unit, ownerId: seller, durationDays: 2, quality: 50, perfection: 50, createdAt: game.timeManager.now(), msPerGameDay: game.timeManager.msPerGameDay });
        game.offers.push(offer);
        // Sans crédit, le joueur n'a pas de quoi acheter le lot
        game.player.money = r2(cost * 0.3);
        const start = game.player.money;
        assert(game.player.money < cost, 'trésorerie insuffisante sans prêt');
        const need = Math.max(50, Math.ceil(cost - game.player.money + 1));
        const loan = game.borrow(need, 3);
        assert(loan.success, loan.error);
        const buy = game.buyout(offer.id, job.quantity);
        assert(buy && buy.success !== false, buy?.error || 'achat du lot');
        assert(game.player.inventory.count(job.itemId) >= job.quantity, 'lot reçu');
        const done = game.completeJob(job.id);
        assert(done.success, done.error);
        nextDay(game);
        const due = game.credit.outstanding();
        const rep = game.credit.repay();
        assert(rep.success, rep.error);
        const gain = r2(game.player.money - start);
        assert(gain > 0, `bénéfice net ${gain} € (contrat ${done.payout} €, lot ${cost} €, remboursé ${due} € pour ${need} € empruntés)`);
        assert(due - need < gain, 'les intérêts ne mangent pas tout le bénéfice');
      } finally { restore(); }
    }],
    ['Comptoir (passe 3) : une intervention au plus par produit et par jour', async () => {
      const { game, restore } = await makeGame({ reputation: 0 });
      try {
        for (let d = 0; d < 10; d++) {
          game.reserve.treasury = 3500; // excédent → commandes publiques et achats possibles
          const actions = game.reserve.dailyIntervene(game);
          const ids = actions.map(a => a.itemId);
          assert(new Set(ids).size === ids.length, `jour ${d} : ${ids.length} interventions pour ${new Set(ids).size} produits`);
          nextDay(game);
        }
      } finally { restore(); }
    }]
  ]);
}
