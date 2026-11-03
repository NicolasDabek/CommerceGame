import { ITEMS } from '../js/data/items.js';
import { assert, assertEqual, runSuite } from './assert.js';
import { makeGame } from './helpers.js';

/** GD passe 9 : objectifs atteignables et livraisons comptées comme des ventes. */
export function run() {
  return runSuite('objectifs (GD passe 9)', [
    ['une livraison de contrat compte dans les ventes, le chiffre d\'affaires et la catégorie', async () => {
      const { game, restore } = await makeGame();
      try {
        const jb = game.jobBoard;
        jb.ensureContracts();
        const job = jb.contracts.find(c => c.status === 'open' && !c.large);
        assert(job, 'un contrat ouvert');
        const cat = ITEMS.find(i => i.id === job.itemId).category;
        const before = { sales: game.player.stats.totalSales, earned: game.player.stats.totalEarned, cat: game._countPlayerSoldByCategory(cat), rep: game.player.reputation };
        game.player.inventory.size = 80;
        game.player.inventory.add(job.itemId, job.quantity, 60, 50);
        const r = jb.complete(job.id);
        assert(r.success !== false, r.error);
        assertEqual(game.player.stats.totalSales, before.sales + 1, 'vente comptée');
        assert(game.player.stats.totalEarned > before.earned, 'chiffre d\'affaires augmenté');
        assertEqual(game._countPlayerSoldByCategory(cat), before.cat + job.quantity, 'catégorie comptée');
        assertEqual(game.player.stats.deliveries, 1, 'livraison distinguée des ventes au marché');
        assertEqual(game.career.metrics().sales, 0, 'le parcours ne compte pas la livraison comme vente au marché');
      } finally { restore(); }
    }],
    ['aucun objectif hors de portée : vente unique ≤ 2 × l\'objet le plus cher, solde et CA réalistes', async () => {
      const { game, restore } = await makeGame();
      try {
        const goals = game.getGoals();
        const maxBase = Math.max(...ITEMS.map(i => i.basePrice));
        const best = goals.filter(g => g.id.startsWith('best_sale_'));
        best.forEach(g => assert(g.target <= maxBase * 2, `${g.id} : ${g.target} € > 2 × ${maxBase} €`));
        const cash = goals.filter(g => g.id.startsWith('cash_'));
        cash.forEach(g => assert(g.target <= 3500, `${g.id} : ${g.target} €`));
        const earned = goals.filter(g => g.id.startsWith('earned_'));
        earned.forEach(g => assert(g.target <= 12000, `${g.id} : ${g.target} €`));
      } finally { restore(); }
    }]
  ]);
}
