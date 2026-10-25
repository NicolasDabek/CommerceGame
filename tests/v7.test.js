import { Offer } from '../js/models/Offer.js';
import { Negotiation } from '../js/systems/Negotiation.js';
import { NpcRequests, REQUEST_TUNING } from '../js/systems/NpcRequests.js';
import { pickGoal, GOALS } from '../js/systems/NpcMind.js';
import { priceChartSvg } from '../js/ui/MarketTools.js';
import { NPCS } from '../js/data/npcs.js';
import { assert, assertEqual, runSuite } from './assert.js';
import { makeGame, totalMoney, UNLOCK_ALL_REP } from './helpers.js';

function listing(game, owner, price, { qty = 3, quality = 50, itemId = 'item_004' } = {}) {
  const o = new Offer({ type: 'sell', itemId, quantity: qty, price, buyoutPrice: price, ownerId: owner, durationDays: 1, quality, perfection: 50, createdAt: game.timeManager.now(), msPerGameDay: game.timeManager.msPerGameDay });
  game.offers.push(o);
  return o;
}
const npcOf = (pers) => NPCS.find(n => n.personality === pers);

export function run() {
  return runSuite('v7', [
    ['argument vrai (quantité) : marge en plus, jamais sous le plancher, un seul par discussion', async () => {
      const { game, restore } = await makeGame({ reputation: UNLOCK_ALL_REP });
      try {
        const npc = npcOf('agressif');
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const offer = listing(game, npc.id, Math.round(ref * 1.1 * 100) / 100);
        const neg = game.negotiation;
        const before = neg._limit(neg._context(offer.id), 2);
        const r = game.useHaggleTactic(offer.id, 'bulk', 2);
        assert(r.success && r.valid, r.message || r.error);
        const after = neg._limit(neg._context(offer.id), 2);
        assert(after.flex > before.flex, `flex ${before.flex} → ${after.flex}`);
        assert(after.limit >= after.hardFloor - 1e-9, 'plancher respecté');
        assert(after.reasons.some(x => x.includes('argument')), 'raison affichée');
        const again = game.useHaggleTactic(offer.id, 'loyalty', 2);
        assertEqual(again.success, false, 'un seul argument');
      } finally { restore(); }
    }],
    ['GD passe 4 : confiance 1 — la marge monte encore avec l\'argument « quantité » et avec le lot entier (plafond 11 %)', async () => {
      const { game, restore } = await makeGame({ reputation: UNLOCK_ALL_REP });
      try {
        const npc = npcOf('épicier');
        const st = game.npcController.npcStates[npc.id];
        st.trust = 1; st.mood = 1;
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const offer = listing(game, npc.id, Math.round(ref * 1.3 * 100) / 100, { qty: 4 });
        const neg = game.negotiation;
        const T = (await import('../js/systems/Negotiation.js')).NEGOTIATION_TUNING;
        const base = neg._limit(neg._context(offer.id), 2);
        assert(base.flex <= T.maxFlex + 1e-9, `marge personnelle plafonnée à 8 % (${base.flex})`);
        const r = game.useHaggleTactic(offer.id, 'bulk', 2);
        assert(r.success && r.valid, r.message || r.error);
        const arg = neg._limit(neg._context(offer.id), 2);
        assert(arg.flex > base.flex, `argument : ${base.flex} → ${arg.flex}`);
        const lot = neg._limit(neg._context(offer.id), 4);
        assert(lot.flex > arg.flex, `lot entier : ${arg.flex} → ${lot.flex}`);
        assert(lot.flex <= T.maxFlexTotal + 1e-9, `plafond absolu 11 % (${lot.flex})`);
        assert(lot.limit >= lot.hardFloor - 1e-9, 'plancher respecté');
      } finally { restore(); }
    }],
    ['argument faux (défaut sur un objet en bon état) : confiance, humeur et patience en baisse', async () => {
      const { game, restore } = await makeGame({ reputation: UNLOCK_ALL_REP });
      try {
        const npc = npcOf('épicier');
        const st = game.npcController.npcStates[npc.id];
        st.trust = 0.2; st.mood = 0;
        const ref = game.npcController.refPrice('item_004', 80, 50);
        const offer = listing(game, npc.id, Math.round(ref * 1.1 * 100) / 100, { quality: 80 });
        const p0 = game.negotiation.quote(offer.id).patience;
        const r = game.useHaggleTactic(offer.id, 'defect', 1);
        assert(r.success && !r.valid, 'bluff détecté');
        assert(st.trust < 0.2 && st.mood < 0, 'confiance et humeur en baisse');
        assertEqual(r.patience, p0 - 2, 'risque élevé : patience −2');
        assert(game.negotiation._memory(npc.id).bluffs >= 1, 'mémorisé');
      } finally { restore(); }
    }],
    ['concurrent moins cher : vrai seulement si un autre marchand vend moins cher', async () => {
      const { game, restore } = await makeGame({ reputation: UNLOCK_ALL_REP });
      try {
        const [a, b] = [npcOf('agressif'), npcOf('prudent')];
        const ref = game.npcController.refPrice('item_004', 50, 50);
        game.offers = game.offers.filter(o => o.itemId !== 'item_004');
        const offer = listing(game, a.id, Math.round(ref * 1.12 * 100) / 100);
        const r1 = game.useHaggleTactic(offer.id, 'competitor', 1);
        assertEqual(r1.valid, false, 'aucun concurrent');
        const offer2 = listing(game, a.id, Math.round(ref * 1.12 * 100) / 100);
        listing(game, b.id, Math.round(ref * 1.0 * 100) / 100);
        const r2 = game.useHaggleTactic(offer2.id, 'competitor', 1);
        assert(r2.valid && r2.bonus > 0 && r2.bonus <= 0.03 * 1.3 + 1e-9, `bonus ${r2.bonus}`);
      } finally { restore(); }
    }],
    ['devis : attitude lisible, arguments proposés, carnet sauvegardé et rechargé', async () => {
      const { game, restore } = await makeGame({ reputation: UNLOCK_ALL_REP });
      try {
        const npc = npcOf('agressif');
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const offer = listing(game, npc.id, Math.round(ref * 1.1 * 100) / 100);
        const q = game.getNegotiationQuote(offer.id);
        assert(q.tell && q.tell.icon && q.tell.text.length > 5, 'attitude');
        assert(q.tactics.some(t => t.id === 'competitor') && !q.tactics.some(t => t.id === 'urgent'), 'arguments d\'achat');
        game.useHaggleTactic(offer.id, 'bulk', 1);
        assert(game.getHaggleJournal(null, 5).length >= 1, 'carnet rempli');
        const reloaded = new Negotiation(game, JSON.parse(JSON.stringify(game.negotiation.toJSON())));
        assertEqual(reloaded.getJournal().length, game.negotiation.getJournal().length, 'carnet persistant');
        assertEqual(new Negotiation(game, {}).getJournal().length, 0, 'ancienne sauvegarde sans carnet');
      } finally { restore(); }
    }],
    ['demande de marchand : livrer conserve l\'argent, +réputation, +confiance', async () => {
      const { game, restore } = await makeGame({ reputation: UNLOCK_ALL_REP });
      try {
        const npc = NPCS[0];
        const ctl = game.npcController;
        const st = ctl.npcStates[npc.id];
        st.capital = 5000; st.trust = 0;
        const reqs = game.npcRequests;
        const day = reqs._day();
        reqs.list.push({ id: 'req_t', npcId: npc.id, itemId: 'item_004', qty: 2, price: 10, day, until: day + 2, status: 'open', reason: 'test' });
        const fail = game.deliverNpcRequest('req_t');
        assertEqual(fail.success, false, 'sans objets');
        game.player.inventory.add('item_004', 3, 70, 50);
        const m0 = totalMoney(game); const rep0 = game.player.reputation; const pm0 = game.player.money;
        const r = game.deliverNpcRequest('req_t');
        assert(r.success, r.error);
        assert(Math.abs(totalMoney(game) - m0) < 0.011, 'argent conservé');
        assert(Math.abs(game.player.money - pm0 - 20) < 0.001, 'payé 20 €');
        assert(game.player.reputation > rep0 - 1e-9, 'réputation');
        assert(st.trust >= REQUEST_TUNING.trust - 1e-9, 'confiance');
        assertEqual(game.player.inventory.count('item_004'), 1, 'objets livrés');
        assertEqual(game.deliverNpcRequest('req_t').success, false, 'pas deux fois');
      } finally { restore(); }
    }],
    ['demandes : publiées en pénurie, bornées, expirent ; ancienne sauvegarde OK', async () => {
      const { game, restore } = await makeGame({ reputation: UNLOCK_ALL_REP });
      try {
        const ctl = game.npcController;
        const orig = ctl.marketSignal.bind(ctl);
        ctl.marketSignal = (id) => ({ ...orig(id), view: { status: 'shortage' } });
        const reqs = new NpcRequests(game, { __rand: () => 0 });
        for (let d = 1; d <= 6; d++) reqs.onNewDay(1);
        const act = reqs.active();
        assert(act.length >= 1 && act.length <= REQUEST_TUNING.maxActive, `actives ${act.length}`);
        assertEqual(new Set(act.map(r => r.npcId)).size, act.length, 'une par marchand');
        for (const r of act) {
          assert(r.qty >= 1 && r.qty <= 3, 'quantité bornée');
          assert(r.price <= game.economy.getFairValue(r.itemId) * REQUEST_TUNING.fairCap + 0.01, 'prix plafonné');
        }
        reqs.onNewDay(1 + REQUEST_TUNING.days + 1);
        assert(act.every(r => r.status === 'expired'), 'expirées');
        const old = new NpcRequests(game, {});
        assertEqual(old.view().length, 0, 'sauvegarde v6');
      } finally { restore(); }
    }],
    ['IA : un événement sur sa spécialité change son objectif (vendre en hausse, racheter en baisse)', async () => {
      const { game, restore } = await makeGame({ reputation: UNLOCK_ALL_REP });
      try {
        const ctl = game.npcController;
        const npc = NPCS.find(n => n.preferredCategories.length);
        const st = ctl.npcStates[npc.id];
        st.capital = npc.capital; // trésorerie normale
        const target = ctl.stockTarget(npc);
        while (ctl._stockQty(st) > target * 1.2 && st.inventory.length) st.inventory.pop();
        ctl.marketSignal = (id) => ({ shortage: false, view: { status: 'balanced' }, book: {} });
        ctl.getActiveEvents = () => [{ name: 'Foire', category: npc.preferredCategories[0], modifier: 1.2 }];
        if (ctl._stockQty(st) >= target * 0.5) {
          assertEqual(pickGoal(ctl, npc, st, 3).id, 'sellEvent');
          ctl.getActiveEvents = () => [{ name: 'Krach', category: npc.preferredCategories[0], modifier: 0.8 }];
          assertEqual(pickGoal(ctl, npc, st, 3).id, 'buyEvent');
        }
        ctl.getActiveEvents = () => [{ name: 'Ailleurs', category: '__autre__', modifier: 1.3 }];
        assert(!['sellEvent', 'buyEvent'].includes(pickGoal(ctl, npc, st, 3).id), 'pas concerné');
        assert(GOALS.sellEvent.bumps.sell > 0 && GOALS.buyEvent.bumps.buy > 0, 'bonus bornés');
      } finally { restore(); }
    }],
    ['IA : ne casse pas les prix d\'un marchand du même clan, s\'aligne', async () => {
      const { game, restore } = await makeGame({ reputation: UNLOCK_ALL_REP });
      try {
        const ctl = game.npcController;
        const a = NPCS.find(n => n.clanId && NPCS.some(m => m.id !== n.id && m.clanId === n.clanId));
        const b = NPCS.find(m => m.id !== a.id && m.clanId === a.clanId);
        const st = ctl.npcStates[a.id];
        const slot = { itemId: 'item_004', quality: 50, perfection: 50, quantity: 2 };
        const ref = ctl.refPrice('item_004', 50, 50);
        const orig = ctl.marketSignal.bind(ctl);
        ctl.marketSignal = (id) => { const s = orig(id); return { ...s, shortage: false, anticipate: false, surplus: false, playerFlow: 0, book: { bestSell: Math.round(ref * 0.95 * 100) / 100, bestSellerId: b.id } }; };
        let aligned = 0;
        for (let i = 0; i < 20; i++) {
          const r = ctl.listingPrice(a, st, slot);
          if (r.clanAligned) { aligned++; assert(r.price >= Math.round(ref * 0.95 * 100) / 100 - 0.011, 'pas sous le clan'); }
        }
        assert(aligned > 0, 's\'aligne au moins parfois (quand il serait plus cher)');
      } finally { restore(); }
    }],
    ['interface : comparateur trié, courbe SVG avec zoom', async () => {
      const { game, restore } = await makeGame({ reputation: UNLOCK_ALL_REP });
      try {
        const [a, b] = [npcOf('agressif'), npcOf('prudent')];
        const ref = game.npcController.refPrice('item_004', 50, 50);
        listing(game, a.id, Math.round(ref * 1.1 * 100) / 100);
        listing(game, b.id, Math.round(ref * 1.02 * 100) / 100);
        const c = game.getMerchantComparison('item_004');
        assert(c.sells.length >= 2, 'annonces');
        for (let i = 1; i < c.sells.length; i++) assert(c.sells[i].price >= c.sells[i - 1].price, 'tri croissant');
        assert(c.sells[0].style && c.sells[0].tell, 'style et attitude');
        const series = Array.from({ length: 40 }, (_, i) => ({ day: i - 39, price: 10 + (i % 5) }));
        const all = priceChartSvg(series, { days: null, fair: 12 });
        const week = priceChartSvg(series, { days: 7 });
        assert(all.includes('<svg') && all.includes('chart-fair'), 'svg + prix juste');
        assert((week.match(/<circle/g) || []).length === 8 && (all.match(/<circle/g) || []).length === 40, 'zoom 7 j');
        assert(priceChartSvg([], {}).includes('Pas encore'), 'vide');
      } finally { restore(); }
    }]
  ]);
}
