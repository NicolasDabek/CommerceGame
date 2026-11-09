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
    ['GD passe 11 : branche « approvisionneur » (livraisons rentables) aux rangs 3 et 4 — même récompense, jamais deux fois par palier', async () => {
      const { game, restore } = await makeGame({ reputation: 20 });
      try {
        const totalXp = () => { let t = game.player.xp; for (let l = 1; l < game.player.level; l++) t += 100 + (l - 1) * 50; return t; };
        const goal = (id) => game.getGoals().find(g => g.id === id);
        const s20 = goal('supply_deliveries_20'); const h10 = goal('haggle_sells_10');
        assert(s20 && goal('supply_deliveries_40'), 'objectifs présents');
        assertEqual(s20.xpReward, h10.xpReward, 'même XP'); assertEqual(s20.inventoryReward, h10.inventoryReward, 'même capacité');
        assert(!s20.reputationReward && !goal('supply_deliveries_40').reputationReward, 'ni réputation ni prime');
        // livraison au coût inconnu : non comptée ; marge < 5 % : non comptée
        game.player.recordDelivery(100, 'Nourriture', 1, null);
        game.player.recordDelivery(100, 'Nourriture', 1, 98);
        assertEqual(game.player.stats.profitableDeliveries || 0, 0, 'coût inconnu ou marge < 5 % : pas rentable');
        for (let i = 0; i < 25; i++) game.player.recordDelivery(100, ['Nourriture', 'Outils'][i % 2], 1, 80);
        assertEqual(goal('supply_deliveries_20').progress, 19, 'rang 2 : bloqué à 19/20');
        game._checkGoals();
        assert(!game.completedGoals.includes('supply_deliveries_20'), 'pas validé avant le rang 3');
        // rang 3 : la branche marchandage est validée d'abord, puis l'approvisionneur — un seul palier récompensé
        game.player.reputation = 40;
        game.negotiation.stats.sellDeals = 10;
        let xp = totalXp(); let size = game.player.inventory.size;
        game._checkGoals();
        assert(game.completedGoals.includes('haggle_sells_10') && game.completedGoals.includes('supply_deliveries_20'), 'les deux validés');
        assertEqual(totalXp() - xp >= 250 && totalXp() - xp < 500, true, `XP du palier 3 une seule fois (${totalXp() - xp})`);
        assertEqual(game.player.inventory.size - size, 1, 'une seule case');
        // rang 4 : 40 livraisons dans 3 catégories requises
        game.player.reputation = 65;
        for (let i = 0; i < 20; i++) game.player.recordDelivery(100, 'Outils', 1, 80);
        assertEqual(goal('supply_deliveries_40').progress, 39, '2 catégories : bloqué à 39/40');
        game.player.recordDelivery(100, 'Vêtements', 1, 80);
        xp = totalXp(); size = game.player.inventory.size;
        game._checkGoals();
        assert(game.completedGoals.includes('supply_deliveries_40'), 'palier 4 validé');
        assertEqual(game.player.inventory.size - size, 2, 'palier 4 : +2 cases');
        game.negotiation.stats.sellDeals = 30;
        xp = totalXp(); size = game.player.inventory.size;
        game._checkGoals();
        assert(game.completedGoals.includes('haggle_sells_30'), 'marchandage 30 validé');
        assertEqual(totalXp() - xp, 0, 'palier 4 déjà récompensé : pas d\'XP');
        assertEqual(game.player.inventory.size, size, 'pas de case de plus');
        // sauvegarde / rechargement : paliers récompensés conservés ; sauvegarde GD10 : déduits des objectifs validés
        game.save();
        assert(game.load(), 'rechargement');
        assertEqual([...game.rewardedTiers].sort().join(','), 'mastery_3,mastery_4', 'paliers conservés');
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
    ['GD passe 11 : clients d\'étal — 12 cycles sauvegarde/rechargement (avant/après visite, après refus) = partie continue', async () => {
      const { Storage } = await import('../js/utils/storage.js');
      const { NpcRequests } = await import('../js/systems/NpcRequests.js');
      const play = async (reload) => {
        const { game, restore } = await makeGame({ reputation: 20 });
        try {
          const trace = [];
          let cycles = 0;
          const cycle = () => {
            if (!reload) return;
            game.save();
            const data = Storage.load();
            game.npcRequests = new NpcRequests(game, JSON.parse(JSON.stringify(data.npcRequests)));
            cycles += 1;
          };
          const tm = game.timeManager;
          for (let d = 2; d <= 5; d++) {
            tm.gameTimeMs = (d - 1) * tm.msPerGameDay + 1000;
            game.player.inventory.items = [];
            game.npcRequests._postStallBids(d);
            assertEqual(game.getStallBids().length, 0, 'étal vide : la visite est différée');
            trace.push(`J${d} attente ${game.npcRequests.stallPending}`);
            cycle(); // avant la première visite (visite différée)
            game.player.inventory.add('item_004', 3, 60, 50, 5);
            game.player.inventory.add('item_008', 2, 55, 50, 40);
            const bids = game.getStallBids();
            trace.push(...bids.map(b => `${b.npcId}|${b.itemId}|${b.bid}|${b.base}|${b.cost}`), `reste ${game.npcRequests.stallPending}`);
            cycle(); // après la première visite
            if (bids[0]) trace.push(game.answerStallBid(bids[0].id, 'refuse').outcome);
            cycle(); // après un refus
            const after = game.getStallBids();
            trace.push(`après refus ${after.length} ${game.npcRequests.stallPending}`);
            for (const b of after) { const r = game.answerStallBid(b.id, 'haggle', Math.round(b.bid * 1.02 * 100) / 100); trace.push(`${r.outcome}:${r.price ?? r.counter ?? ''}`); }
          }
          trace.push(`ventes ${game.npcRequests.stats.stallSold}/${game.npcRequests.stats.stallBids}`, `argent ${game.player.money.toFixed(2)}`);
          trace.push(...game.transactions.filter(t => t.type === 'stall').map(t => `${t.buyerId}:${t.price}`));
          return { trace, cycles };
        } finally { restore(); }
      };
      const a = await play(false);
      const b = await play(true);
      assert(b.cycles >= 10, `${b.cycles} cycles`);
      assert(a.trace.some(t => /^stall|:/.test(t)), 'des clients sont passés');
      assertEqual(b.trace.join('\n'), a.trace.join('\n'), 'mêmes clients, prix, visites restantes et transactions');
    }],
    ['GD passe 11 : migration d\'une sauvegarde GD10 (sans graine ni visite du jour) — ni client bonus ni client perdu', async () => {
      const { NpcRequests } = await import('../js/systems/NpcRequests.js');
      const { game, restore } = await makeGame({ reputation: 20 });
      try {
        const day = game.npcRequests._day();
        const none = new NpcRequests(game, { list: [], stats: { stallBids: 4, stallSold: 2 }, stallBids: [] });
        assertEqual(none.stallDay, day, 'jour courant');
        assertEqual(none.stallPending, 1, 'aucun client aujourd\'hui : un client garanti reste attendu');
        assert(none._stallSeed !== 0x9E3779B9 && none.migratedGd10, 'graine dérivée, pas la constante');
        const one = new NpcRequests(game, { list: [], stats: { stallBids: 5 }, stallBids: [{ id: 's1', day, npcId: NPCS[0].id, itemId: 'item_004', quality: 60, perfection: 50, base: 10, bid: 9.4, max: 9.8, counter: null, status: 'open' }] });
        assertEqual(one.stallPending, 0, 'déjà un client aujourd\'hui : pas de client bonus');
        const json = one.toJSON();
        assert(Number.isFinite(json.stallSeed) && json.stallDay === day && json.stallPending === 0, JSON.stringify(json).slice(0, 200));
        const fresh = new NpcRequests(game, {});
        assert(fresh.stallDay === undefined && !fresh.migratedGd10, 'nouvelle partie : pas de migration');
      } finally { restore(); }
    }],
    ['GD passe 11 : client d\'étal — montant affiché = transaction au centime (stock, annonce, coût inconnu, contre-offre), perte signalée', async () => {
      const { stallBidItemHtml } = await import('../js/ui/MarketTools.js');
      const { game, restore } = await makeGame({ reputation: 20 });
      try {
        const nr = game.npcRequests;
        const inv = game.player.inventory;
        const sellBid = (b, action, price) => {
          const before = game.player.money;
          const r = game.answerStallBid(b.id, action, price);
          const tx = game.transactions[0];
          return { r, tx, delta: Math.round((game.player.money - before) * 100) / 100 };
        };
        const fresh = (setup) => {
          inv.items = [];
          game.offers.filter(o => o.ownerId === 'player').forEach(o => { o.status = 'cancelled'; });
          nr.stallBids = [];
          setup();
          nr._postStallBids(nr._day());
          nr.stallPending = 1;
          return game.getStallBids()[0];
        };
        // 1. stock en inventaire, coût connu
        let b = fresh(() => inv.add('item_004', 2, 60, 50, 5));
        assertEqual(b.cost, 5, 'coût connu'); assertEqual(b.qtyLeft, 2, 'quantité restante');
        assertEqual(b.net, Math.round((b.bid - 5) * 100) / 100, 'bénéfice net');
        assert(stallBidItemHtml(b).includes('coût 5,00 €') && stallBidItemHtml(b).includes('expire en fin de journée'), 'coût et expiration affichés');
        assert(!stallBidItemHtml(b).includes(String(nr.stallBids[0].max).replace('.', ',')) || nr.stallBids[0].max === b.base, 'max caché non affiché');
        let s = sellBid(b, 'accept');
        assertEqual(s.tx.price, b.offer, 'prix affiché = transaction'); assertEqual(s.delta, b.offer, 'argent reçu = prix affiché');
        assertEqual(s.tx.playerMargin, b.net, 'bénéfice affiché = marge enregistrée');
        // 2. coût inconnu : jamais 0
        b = fresh(() => inv.add('item_004', 1, 60, 50));
        assertEqual(b.cost, null, 'coût inconnu'); assertEqual(b.net, null);
        assert(stallBidItemHtml(b).includes('coût inconnu') && !stallBidItemHtml(b).includes('data-stall-loss'), 'dit « inconnu », pas 0');
        // 3. en annonce : une unité prélevée sur l'annonce, les autres restent en vente
        b = fresh(() => { inv.add('item_004', 3, 60, 50, 6); game.createSellOffer({ itemId: 'item_004', quantity: 3, price: 15, buyoutPrice: 15, durationDays: 2, quality: 60, perfection: 50 }); });
        const lst = game.offers.find(o => o.ownerId === 'player' && o.status === 'active' && o.itemId === 'item_004');
        assert(lst && lst.quantity === 3 && inv.count('item_004') === 0, 'tout est en annonce');
        assertEqual(b.cost, 6, 'coût de l\'annonce'); assert(b.fromListing && b.qtyLeft === 3, 'prélevé sur l\'annonce');
        // contre-offre
        const raw = nr.stallBids.find(x => x.id === b.id);
        const c = game.answerStallBid(b.id, 'haggle', b.base);
        if (c.outcome === 'counter') {
          const v = game.getStallBids().find(x => x.id === b.id);
          assertEqual(v.offer, raw.counter, 'contre-offre affichée');
          s = sellBid(v, 'accept');
          assertEqual(s.tx.price, v.offer, 'contre-offre = transaction'); assertEqual(s.tx.playerMargin, v.net);
        } else assertEqual(c.outcome, 'accepted');
        assertEqual(lst.quantity, 2, 'les 2 autres restent en vente'); assertEqual(inv.count('item_004'), 0, 'rien ne revient en inventaire');
        // 4. vente à perte : confirmation
        b = fresh(() => inv.add('item_008', 1, 55, 50, 500));
        assert(b.loss && b.net < 0, 'perte calculée');
        const html = stallBidItemHtml(b);
        assert(html.includes('data-stall-loss') && html.includes('Vente à perte') && html.includes('perte −'), 'confirmation de vente à perte');
      } finally { restore(); }
    }],
    ['GD passe 11 : client d\'étal — expiration, double clic, enchère active, inventaire disparu : aucun transfert ni duplication', async () => {
      const { game, restore } = await makeGame({ reputation: 20 });
      try {
        const nr = game.npcRequests;
        const inv = game.player.inventory;
        inv.add('item_004', 1, 60, 50, 5);
        nr._postStallBids(nr._day());
        const b = game.getStallBids()[0];
        assert(b, 'un client');
        const m0 = totalMoney(game);
        // double clic : une seule vente
        const r1 = game.answerStallBid(b.id, 'accept');
        const money1 = game.player.money;
        const r2 = game.answerStallBid(b.id, 'accept');
        assert(r1.success && !r2.success, 'second clic refusé');
        assertEqual(game.player.money, money1, 'pas de second paiement');
        assertEqual(game.transactions.filter(t => t.type === 'stall').length, 1, 'une transaction');
        assert(Math.abs(totalMoney(game) - m0) < 0.01, 'masse monétaire conservée');
        // expiration : le lendemain, 0 transfert
        inv.add('item_004', 1, 60, 50, 5);
        nr.stallBids = [];
        nr._postStallBids(nr._day()); nr.stallPending = 1;
        const e = game.getStallBids()[0];
        const tm = game.timeManager;
        tm.gameTimeMs += tm.msPerGameDay;
        const mE = game.player.money;
        const rE = game.answerStallBid(e.id, 'accept');
        assert(!rE.success && game.player.money === mE && inv.count('item_004') === 1, 'expirée : aucun transfert');
        // inventaire disparu entre l'affichage et le clic
        nr.stallBids = [];
        nr._postStallBids(nr._day()); nr.stallPending = 1;
        const g = game.getStallBids()[0];
        inv.items = [];
        const mG = game.player.money;
        const rG = game.answerStallBid(g.id, 'accept');
        assert(!rG.success && game.player.money === mG, 'objet disparu : aucun paiement');
        // seul exemplaire en annonce avec enchère active : ni vendu à l'étal ni dupliqué
        inv.add('item_004', 1, 60, 50, 5);
        nr.stallBids = [];
        nr._postStallBids(nr._day()); nr.stallPending = 1;
        const h = game.getStallBids()[0];
        game.createSellOffer({ itemId: 'item_004', quantity: 1, price: 12, buyoutPrice: 20, durationDays: 2, quality: 60, perfection: 50 });
        const o = game.offers.find(x => x.ownerId === 'player' && x.status === 'active' && x.itemId === 'item_004');
        o.currentBid = 12; o.currentBidderId = NPCS[1].id;
        const mH = game.player.money;
        const rH = game.answerStallBid(h.id, 'accept');
        assert(!rH.success && game.player.money === mH && o.status === 'active' && o.quantity === 1, 'enchère active : rien ne bouge');
        assertEqual(inv.count('item_004'), 0, 'pas de duplication');
      } finally { restore(); }
    }],
    ['GD passe 11 : anti-flip à l\'étal (désactivé par défaut, STALL_TUNING.flipCap) — activé : produit acheté le jour même → marge du client ≤ 3 %', async () => {
      const { STALL_TUNING } = await import('../js/systems/NpcRequests.js');
      const { game, restore } = await makeGame({ reputation: 20 });
      const prevCap = STALL_TUNING.flipCap;
      try {
        assertEqual(prevCap, false, 'désactivé par défaut (conflit mesuré, voir reports/gd11-hybride.md)');
        STALL_TUNING.flipCap = true;
        const nr = game.npcRequests;
        // achat réel le jour même (achat immédiat d'une annonce de marchand), puis client d'étal sur cet objet
        game.player.inventory.items = [];
        game.player.money = 5000;
        const { Offer } = await import('../js/models/Offer.js');
        const o = new Offer({ type: 'sell', itemId: 'item_004', quantity: 1, price: 11, buyoutPrice: 11, quality: 60, perfection: 50, ownerId: NPCS[2].id, durationDays: 1, createdAt: game.timeManager.now(), msPerGameDay: game.timeManager.msPerGameDay });
        game.offers.push(o);
        const buy = game.buyout(o.id, 1);
        assert(buy?.success !== false && game.player.inventory.count(o.itemId) >= 1, 'achat immédiat');
        nr._postStallBids(nr._day());
        const b = game.getStallBids()[0];
        assert(b && b.itemId === o.itemId, 'client sur l\'objet acheté');
        const raw = nr.stallBids.find(x => x.id === b.id);
        raw.max = Math.round(raw.bid * 1.07 * 100) / 100;
        assert(game.getStallBids()[0].flip, 'revente rapide signalée');
        const r = game.answerStallBid(b.id, 'haggle', raw.max);
        assertEqual(r.outcome, 'counter', 'la marge pleine n\'est plus accessible');
        assert(r.counter <= Math.round(raw.bid * 1.03 * 100) / 100 + 0.001, `contre-offre ${r.counter} ≤ offre × 1,03`);
        const s = game.answerStallBid(b.id, 'accept');
        assert(s.success && s.price === r.counter, 'vente au prix plafonné');
      } finally { STALL_TUNING.flipCap = prevCap; restore(); }
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
