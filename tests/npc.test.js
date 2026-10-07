import { NPCController, NPC_TUNING, PERSONALITY_PROFILES } from '../js/systems/NPCController.js';
import { NPCS } from '../js/data/npcs.js';
import { getItemById } from '../js/data/items.js';
import { Offer } from '../js/models/Offer.js';
import { assert, assertEqual, runSuite } from './assert.js';

function makeController(extra = {}) {
  const offers = [];
  const spent = [];
  const ctrl = new NPCController({
    getOffers: () => offers,
    addOffer: (o) => offers.push(o),
    getAveragePrice: (id) => getItemById(id).basePrice,
    getFairPrice: (id) => getItemById(id).basePrice,
    onNpcSpend: (id, amount, reason) => spent.push({ id, amount, reason }),
    ...extra
  });
  return { ctrl, offers, spent };
}

const npc = (id) => NPCS.find(n => n.id === id);

export function run() {
  return runSuite('ia-pnj', [
    ['prix d\'annonce toujours bornés, même si le marché est absurde', () => {
      const { ctrl, offers } = makeController();
      const seller = npc('npc_02');
      const state = ctrl.npcStates[seller.id];
      // Un concurrent brade à 1 % du prix : le PNJ ne le suit pas sous le plancher
      offers.push(new Offer({ type: 'sell', itemId: 'item_010', quantity: 5, price: 0.08, ownerId: 'npc_05', durationDays: 1 }));
      const slot = { itemId: 'item_010', quantity: 3, quality: 50, perfection: 50 };
      for (let i = 0; i < 50; i++) {
        const { price, ref } = ctrl.listingPrice(seller, state, slot);
        assert(price >= ref * NPC_TUNING.listMin - 0.01, `plancher (${price} / ${ref})`);
        assert(price <= ref * NPC_TUNING.listMax + 0.01, `plafond (${price} / ${ref})`);
      }
    }],
    ['n\'achète jamais une annonce hors de prix', () => {
      const { ctrl, offers } = makeController({ executeBuyout: () => ({ success: true }) });
      const greedy = new Offer({ type: 'sell', itemId: 'item_001', quantity: 1, price: 900, buyoutPrice: 900, ownerId: 'player', durationDays: 1 });
      offers.push(greedy);
      NPCS.forEach(n => {
        const state = ctrl.npcStates[n.id];
        state.capital = 100000;
        assertEqual(ctrl._tryBuyout(n, state), null, `${n.name} n'achète pas à 5× le prix`);
      });
    }],
    ['plafond d\'achat ≤ 115 % (125 % collectionneur sur ses favoris)', () => {
      const { ctrl } = makeController();
      NPCS.forEach(n => {
        const state = ctrl.npcStates[n.id];
        state.mood = 1;
        ['item_001', 'item_004', 'item_007', 'item_010', 'item_014'].forEach(id => {
          const item = getItemById(id);
          const cap = ctrl.maxBuyRatio(n, state, item);
          const hard = n.personality === 'collectionneur' && n.preferredCategories.includes(item.category) ? NPC_TUNING.collectorCap : NPC_TUNING.buyCapMax;
          assert(cap <= hard + 1e-9, `${n.name} ${id} cap ${cap}`);
        });
      });
    }],
    ['production quand le stock est bas (payée au Comptoir)', () => {
      const { ctrl, spent } = makeController();
      const artisan = NPCS.find(n => n.personality === 'artisan');
      const state = ctrl.npcStates[artisan.id];
      state.inventory = [];
      const capitalBefore = state.capital;
      const made = ctrl._produce(artisan, state);
      assert(made >= 1, 'a produit');
      assert(state.capital < capitalBefore, 'a payé');
      assert(spent.some(s => s.id === artisan.id && s.reason === 'production'), 'coût versé au Comptoir');
      const paid = spent.filter(s => s.id === artisan.id).reduce((s, x) => s + x.amount, 0);
      assertEqual(Math.round((capitalBefore - state.capital) * 100), Math.round(paid * 100), 'argent conservé');
    }],
    ['pas de production quand le stock est plein', () => {
      const { ctrl } = makeController();
      const n = NPCS[0];
      const state = ctrl.npcStates[n.id];
      state.inventory = [{ itemId: 'item_002', quantity: 50, quality: 50, perfection: 50 }];
      assertEqual(ctrl._produce(n, state), 0);
    }],
    ['la nourriture est consommée', () => {
      const { ctrl } = makeController();
      const n = NPCS.find(x => x.personality === 'épicier');
      const state = ctrl.npcStates[n.id];
      state.inventory = [{ itemId: 'item_004', quantity: 40, quality: 50, perfection: 50 }];
      let total = 0;
      for (let d = 0; d < 5; d++) total += ctrl._consume(n, state);
      assert(total >= 20, `consommé ${total}`);
    }],
    ['budget d\'actions quotidien respecté', () => {
      const { ctrl, offers } = makeController({
        executeFulfill: () => ({ success: true, transaction: { total: 1 } }),
        executeBid: () => ({ success: true }),
        executeBuyout: () => ({ success: true })
      });
      let now = 1e9;
      const counts = {};
      for (let i = 0; i < 400; i++) {
        now += 30000;
        ctrl.tick(now).forEach(a => { counts[a.npcId] = (counts[a.npcId] || 0) + 1; });
        if (offers.length > 200) offers.length = 0;
      }
      NPCS.forEach(n => {
        assert((counts[n.id] || 0) <= ctrl.actionBudget(n), `${n.name} : ${counts[n.id]} > ${ctrl.actionBudget(n)}`);
      });
      ctrl.onNewDay(2);
      assertEqual(ctrl.npcStates[NPCS[0].id].actionsToday, 0, 'remis à zéro chaque jour');
    }],
    ['intentions lisibles avec une raison', () => {
      const { ctrl } = makeController();
      const n = npc('npc_01');
      const state = ctrl.npcStates[n.id];
      state.inventory = [{ itemId: 'item_002', quantity: 3, quality: 60, perfection: 60 }];
      const res = ctrl._trySell(n, state);
      assert(res && res.type === 'sell', 'met en vente');
      assert(/^Vend 🎧/.test(res.intent), `intention : ${res.intent}`);
      assert(res.intent.length <= 40, 'intention courte');
      assert(/prix normal/.test(res.reason), `raison : ${res.reason}`);
    }],
    ['frais d\'annonce PNJ versés au Comptoir', () => {
      const { ctrl, spent } = makeController();
      const n = npc('npc_01');
      const state = ctrl.npcStates[n.id];
      state.inventory = [{ itemId: 'item_001', quantity: 1, quality: 50, perfection: 50 }];
      ctrl._trySell(n, state);
      assert(spent.some(s => s.reason === 'fees' && s.amount > 0), 'frais payés');
    }],
    ['retire une offre d\'achat devenue trop chère et récupère son argent', () => {
      const { ctrl, offers } = makeController();
      const n = npc('npc_01');
      const state = ctrl.npcStates[n.id];
      const before = state.capital;
      const buy = new Offer({ type: 'buy', itemId: 'item_002', quantity: 2, price: 80, ownerId: n.id, durationDays: 2 });
      offers.push(buy);
      let res = null;
      for (let i = 0; i < 40 && !res; i++) res = ctrl._tryCancelStale(n, state, [], [buy], Date.now());
      assert(res && res.type === 'cancel', 'offre retirée');
      assertEqual(buy.status, 'cancelled');
      assertEqual(Math.round(state.capital), Math.round(before + 160));
    }],
    ['instantané IA complet pour l\'interface', () => {
      const { ctrl } = makeController();
      const snap = ctrl.getAiSnapshot('npc_01');
      ['clanId', 'clanName', 'clanIcon', 'strategy', 'strategyText', 'capitalLabel', 'stockLabel'].forEach(k => assert(snap[k], `champ ${k}`));
      assert(Array.isArray(snap.needs), 'besoins');
      assertEqual(snap.stockTarget, PERSONALITY_PROFILES[npc('npc_01').personality].stockTarget);
    }]
  ]);
}
