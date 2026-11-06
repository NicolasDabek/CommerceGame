import { ITEMS } from '../js/data/items.js';
import { assert, assertEqual, runSuite } from './assert.js';
import { makeGame, totalMoney } from './helpers.js';
import { NPCS } from '../js/data/npcs.js';

/** GD passe 9 : objectifs atteignables et livraisons comptées comme des ventes. */
export function run() {
  return runSuite('objectifs (GD passe 9 / 10)', [
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
    }],
    ['GD passe 10 : objectif « 10 ventes marchandées » réservé au rang 3, « 30 » au rang 4', async () => {
      const { game, restore } = await makeGame({ reputation: 20 });
      try {
        const g10 = () => game.getGoals().find(g => g.id === 'haggle_sells_10');
        const g30 = () => game.getGoals().find(g => g.id === 'haggle_sells_30');
        assert(g10() && g30(), 'objectifs présents');
        game.negotiation.stats.sellDeals = 12;
        assertEqual(g10().progress, 9, 'rang 2 : bloqué à 9/10');
        game._checkGoals();
        assert(!game.completedGoals.includes('haggle_sells_10'), 'pas validé avant le rang 3');
        game.player.reputation = 40;
        assertEqual(g10().progress, 10, 'rang 3 : 10/10');
        assertEqual(g30().progress, 12, 'rang 3 : progression vers 30');
        const xp = game.player.xp + game.player.level * 1e6;
        game._checkGoals();
        assert(game.completedGoals.includes('haggle_sells_10'), 'validé au rang 3');
        assert(!game.completedGoals.includes('haggle_sells_30'), '30 non validé');
        assert(game.player.xp + game.player.level * 1e6 > xp, 'récompense en XP');
      } finally { restore(); }
    }],
    ['GD passe 10 : client d\'étal — contre-offre, marchandage, vente payée par le PNJ (aucune création d\'argent)', async () => {
      const { game, restore } = await makeGame({ reputation: 20 });
      try {
        const nr = game.npcRequests;
        game.player.inventory.add('item_004', 2, 60, 50, 5);
        assertEqual(game.getStallBids().length, 0, 'pas de client avant le début de journée');
        nr._postStallBids(nr._day());
        const bids = game.getStallBids();
        assert(bids.length >= 1 && bids.length <= 2, `1 à 2 clients (${bids.length})`);
        const b = bids[0];
        assert(b.bid < b.base && b.bid >= b.base * 0.9, `offre ${b.bid} sous le prix ${b.base}`);
        const raw = nr.stallBids.find(x => x.id === b.id);
        const before = totalMoney(game);
        const deals = game.negotiation.stats.sellDeals;
        const r = game.answerStallBid(b.id, 'haggle', raw.max);
        assert(r.success && r.outcome === 'accepted', JSON.stringify(r));
        assert(r.haggled && r.gain > 0, 'vente marchandée');
        assertEqual(game.negotiation.stats.sellDeals, deals + 1, 'comptée comme vente marchandée');
        assert(Math.abs(totalMoney(game) - before) < 0.01, `masse monétaire ${before} → ${totalMoney(game)}`);
        // trop haut : dernière offre puis départ
        if (bids[1]) {
          const r2 = game.answerStallBid(bids[1].id, 'haggle', bids[1].base);
          const raw2 = nr.stallBids.find(x => x.id === bids[1].id);
          if (bids[1].base > raw2.max) {
            assertEqual(r2.outcome, 'counter', 'dernière offre');
            assertEqual(game.answerStallBid(bids[1].id, 'haggle', bids[1].base).outcome, 'walked', 'il s\'en va');
          }
        }
        // rang 1 : aucun client
        game.player.reputation = 10;
        nr._postStallBids(nr._day());
        assertEqual(game.getStallBids().length, 0, 'rang < 2 : pas de client d\'étal');
      } finally { restore(); }
    }],
    ['GD passe 10 : humeur du marchand lisible avant l\'offre (essais, lassitude)', async () => {
      const { game, restore } = await makeGame({ reputation: 20 });
      try {
        const npc = NPCS[0];
        const m = game.negotiation.merchantMood(npc.id);
        assert(m.canHaggle && m.triesLeft > 0 && /essai/.test(m.label), JSON.stringify(m));
        game.negotiation._npcDay(npc.id).tries = 99;
        const m2 = game.negotiation.merchantMood(npc.id);
        assert(!m2.canHaggle && /ne discute plus/.test(m2.label), JSON.stringify(m2));
        assertEqual(game.negotiation.merchantMood('player'), null, 'pas d\'humeur pour le joueur');
      } finally { restore(); }
    }]
  ]);
}
