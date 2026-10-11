import { Offer } from '../js/models/Offer.js';
import { NEGOTIATION_TUNING, styleFor, HAGGLE_STYLES } from '../js/systems/Negotiation.js';
import { NPCS } from '../js/data/npcs.js';
import { assert, assertEqual, runSuite } from './assert.js';
import { makeGame, totalMoney } from './helpers.js';

function listing(game, owner, price, qty = 3) {
  const o = new Offer({ type: 'sell', itemId: 'item_004', quantity: qty, price, buyoutPrice: price, ownerId: owner, durationDays: 1, quality: 50, perfection: 50, createdAt: game.timeManager.now(), msPerGameDay: game.timeManager.msPerGameDay });
  game.offers.push(o);
  return o;
}
const npcOf = (pers) => NPCS.find(n => n.personality === pers);

export function run() {
  return runSuite('marchandage-ia', [
    ['styles : chaque personnalité a un style (têtu, arrangeant, gourmand, pressé)', async () => {
      assertEqual(styleFor(npcOf('prudent')).id, 'stubborn');
      assertEqual(styleFor(npcOf('épicier')).id, 'generous');
      assertEqual(styleFor(npcOf('agressif')).id, 'greedy');
      assertEqual(styleFor(npcOf('opportuniste')).id, 'impatient');
      assert(HAGGLE_STYLES.generous.patience > HAGGLE_STYLES.stubborn.patience, 'arrangeant plus patient');
    }],
    ['plusieurs tours : concessions de plus en plus petites, jamais sous la limite', async () => {
      const { game, restore } = await makeGame();
      try {
        game.player.money = 5000;
        const npc = npcOf('épicier');
        game.npcController.npcStates[npc.id].trust = 0.6;
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const offer = listing(game, npc.id, Math.round(ref * 1.12 * 100) / 100);
        const neg = game.negotiation;
        const lim = neg._limit(neg._context(offer.id));
        const lowNear = Math.round((lim.limit - lim.ask * 0.02) * 100) / 100;
        const counters = [];
        for (let i = 0; i < 3; i++) {
          const r = game.negotiate(offer.id, lowNear, 1);
          assertEqual(r.outcome, 'counter', `tour ${i + 1}`);
          counters.push(r.counter);
        }
        const steps = [lim.ask - counters[0], counters[0] - counters[1], counters[1] - counters[2]];
        assert(steps[0] > steps[1] && steps[1] >= steps[2], `concessions décroissantes ${steps.map(s => s.toFixed(2))}`);
        assert(counters.every(c => c >= lim.limit - 0.001), 'jamais sous la limite');
        const q = neg.quote(offer.id);
        assertEqual(q.rounds.length, 3, 'historique des tours');
        assert(q.patience < q.patienceMax, 'patience entamée');
      } finally { restore(); }
    }],
    ['patience épuisée : il coupe court, mais sa dernière contre-offre reste valable', async () => {
      const { game, restore } = await makeGame();
      try {
        game.player.money = 5000;
        const npc = npcOf('opportuniste');
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const offer = listing(game, npc.id, Math.round(ref * 1.12 * 100) / 100);
        const neg = game.negotiation;
        const lim = neg._limit(neg._context(offer.id));
        const near = Math.round((lim.limit - lim.ask * 0.02) * 100) / 100;
        let last;
        for (let i = 0; i < 6; i++) { last = game.negotiate(offer.id, near, 1); if (last.walked || !last.success) break; }
        assert(last.walked, 'il a coupé court');
        const again = game.negotiate(offer.id, near, 1);
        assertEqual(again.success, false, 'plus de proposition');
        assert(/coupé court/.test(again.error));
        const before = totalMoney(game);
        const ok = game.negotiate(offer.id, neg.quote(offer.id).counter, 1, { acceptCounter: true });
        assertEqual(ok.outcome, 'accepted', 'dernière contre-offre acceptable');
        assert(Math.abs(totalMoney(game) - before) < 0.02, 'argent conservé');
        assertEqual(game.negotiate(offer.id, lim.ask, 1).outcome, 'accepted', 'prix demandé toujours possible');
      } finally { restore(); }
    }],
    ['mémoire : les offres trop basses réduisent sa marge, oubliées peu à peu, sauvegardées', async () => {
      const { game, restore } = await makeGame();
      try {
        game.player.money = 5000;
        const npc = npcOf('agressif');
        const st = game.npcController.npcStates[npc.id];
        st.trust = 0.5;
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const neg = game.negotiation;
        const base = neg.flexFor(npc, st, 'item_004', 'buy').flex;
        for (let i = 0; i < 3; i++) { const o = listing(game, npc.id, Math.round(ref * 1.12 * 100) / 100); game.negotiate(o.id, 0.5, 1); }
        st.trust = 0.5; // on isole l'effet mémoire
        const after = neg.flexFor(npc, st, 'item_004', 'buy');
        assert(after.flex < base - 0.01, `marge réduite ${base} → ${after.flex}`);
        assert(after.reasons.some(r => /souvient/.test(r)), 'raison affichée');
        const json = JSON.parse(JSON.stringify(neg.toJSON()));
        assert(json.memory[npc.id].bluffs >= 3, 'mémoire sauvegardée');
        neg.memory[npc.id].day -= 3;
        assert(neg._memory(npc.id).bluffs < 1.2, 'mémoire estompée');
      } finally { restore(); }
    }],
    ['chance estimée : croissante avec le prix, ~100 % au prix demandé ; prix conseillés', async () => {
      const { game, restore } = await makeGame();
      try {
        const npc = npcOf('artisan');
        game.npcController.npcStates[npc.id].trust = 0.5;
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const offer = listing(game, npc.id, Math.round(ref * 1.12 * 100) / 100);
        const neg = game.negotiation;
        const q = neg.quote(offer.id);
        const prices = [0.85, 0.9, 0.95, 0.99].map(k => Math.round(q.ask * k * 100) / 100);
        const ch = prices.map(p => neg.estimateChance(offer.id, p).chance);
        assert(ch[0] <= ch[1] && ch[1] <= ch[2] && ch[2] <= ch[3], `croissante ${ch}`);
        assertEqual(neg.estimateChance(offer.id, q.ask).chance, 1);
        assert(q.suggested <= q.ask && q.suggested >= neg._limit(neg._context(offer.id)).hardFloor, 'prix conseillé dans la fourchette');
        assert(q.fair > 0 && q.fairReasons.length >= 1, 'prix juste avec raisons');
        assertEqual(q.bundleQty, 3, 'lot entier proposé');
      } finally { restore(); }
    }],
    ['lot entier : marge +2 %, plancher de 90 % toujours respecté', async () => {
      const { game, restore } = await makeGame();
      try {
        const npc = npcOf('épicier');
        const st = game.npcController.npcStates[npc.id];
        st.trust = 1;
        game.player.reputation = 80;
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const offer = listing(game, npc.id, Math.round(ref * 1.3 * 100) / 100, 4);
        const neg = game.negotiation;
        const ctx = neg._context(offer.id);
        const one = neg._limit(ctx, 1);
        const lot = neg._limit(ctx, 4);
        assert(lot.flex > one.flex || lot.flex === NEGOTIATION_TUNING.maxFlex, 'plus de marge pour le lot');
        assert(lot.limit >= ref * NEGOTIATION_TUNING.floorRef - 0.01, 'plancher 90 %');
      } finally { restore(); }
    }]
  ]);
}
