import { NPCController } from '../js/systems/NPCController.js';
import { NPCS, getNpcProfession } from '../js/data/npcs.js';
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

function withRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = real; }
}

export function run() {
  return runSuite('metiers-pnj', [
    ['chaque marchand a un métier', () => {
      assert(NPCS.every(n => getNpcProfession(n)), 'métier défini');
      const counts = {};
      NPCS.forEach(n => { counts[n.profession] = (counts[n.profession] || 0) + 1; });
      assertEqual(counts.reparateur, 3);
      assertEqual(counts.negociant, 3);
      assertEqual(counts.producteur, 6);
    }],
    ['négociant : arbitrage entre hôtel de vente et hôtel d\'achat', () => {
      let ctrl;
      const made = makeController({
        executeBuyout: (offer, npcId, qty) => {
          offer.quantity -= qty;
          if (offer.quantity <= 0) offer.status = 'completed';
          ctrl.giveItemToNpc(npcId, offer.itemId, qty, offer.quality, offer.perfection);
          return { success: true };
        },
        executeFulfill: (buy, npcId, qty) => {
          buy.quantity -= qty;
          ctrl.creditNpc(npcId, buy.price * qty);
          return { success: true };
        }
      });
      ctrl = made.ctrl;
      made.offers.push(new Offer({ type: 'sell', itemId: 'item_010', quantity: 2, price: 5, buyoutPrice: 6, ownerId: 'npc_05', durationDays: 1, quality: 50, perfection: 50 }));
      made.offers.push(new Offer({ type: 'buy', itemId: 'item_010', quantity: 2, price: 9, ownerId: 'npc_08', durationDays: 1 }));
      const trader = npc('npc_02');
      const st = ctrl.npcStates[trader.id];
      const cap = st.capital;
      const qtyBefore = st.inventory.filter(s => s.itemId === 'item_010').reduce((t, s) => t + s.quantity, 0);
      const action = ctrl._tryArbitrage(trader, st);
      assert(action && action.type === 'arbitrage', 'arbitrage réalisé');
      assert(st.capital > cap, `bénéfice ${st.capital - cap}`);
      const qtyAfter = st.inventory.filter(s => s.itemId === 'item_010').reduce((t, s) => t + s.quantity, 0);
      assertEqual(qtyAfter, qtyBefore, 'rien ne reste en stock');
      assert(/Arbitrage/.test(action.intent), action.intent);
    }],
    ['pas d\'arbitrage quand la marge est trop faible', () => {
      const { ctrl, offers } = makeController({ executeBuyout: () => ({ success: true }), executeFulfill: () => ({ success: true }) });
      offers.push(new Offer({ type: 'sell', itemId: 'item_010', quantity: 2, price: 8, buyoutPrice: 8.5, ownerId: 'npc_05', durationDays: 1 }));
      offers.push(new Offer({ type: 'buy', itemId: 'item_010', quantity: 2, price: 8.8, ownerId: 'npc_08', durationDays: 1 }));
      assertEqual(ctrl._tryArbitrage(npc('npc_02'), ctrl.npcStates.npc_02), null);
    }],
    ['réparateur : remet en état ses objets abîmés (matériaux payés au Comptoir)', () => {
      const { ctrl, spent } = makeController();
      const rep = npc('npc_01');
      ctrl.giveItemToNpc(rep.id, 'item_001', 1, 15, 30);
      const done = ctrl._repairOwnStock(rep, ctrl.npcStates[rep.id]);
      assertEqual(done, 1);
      const slots = ctrl.npcStates[rep.id].inventory.filter(s => s.itemId === 'item_001');
      assert(slots.every(s => s.quality >= 35), 'plus d\'objet abîmé');
      assert(spent.some(s => s.reason === 'workshop' && s.amount > 0), 'coût versé au Comptoir');
      // un non-réparateur ne répare pas
      ctrl.giveItemToNpc('npc_02', 'item_001', 1, 15, 30);
      assertEqual(ctrl._repairOwnStock(npc('npc_02'), ctrl.npcStates.npc_02), 0);
    }],
    ['producteur : fabrique d\'abord ce qui manque à la ville', () => {
      const views = { item_004: { status: 'shortage', coverage: 0.4, anticipate: false, playerFlow: 0 } };
      const { ctrl } = makeController({ getSupplyView: (id) => views[id] || { status: 'surplus', coverage: 40, playerFlow: 0 } });
      const prod = npc('npc_05');
      let coffee = 0;
      let total = 0;
      for (let i = 0; i < 40; i++) {
        const st = ctrl.npcStates[prod.id];
        st.inventory = [];
        st.capital = 500;
        ctrl._produce(prod, st);
        st.inventory.forEach(s => { total += s.quantity; if (s.itemId === 'item_004') coffee += s.quantity; });
      }
      assert(coffee / total > 0.6, `part du café ${coffee}/${total}`);
    }],
    ['consommation gérée par la ville : pas de double consommation', () => {
      const { ctrl } = makeController({ externalConsumption: true });
      const before = ctrl.npcStates.npc_05.inventory.reduce((t, s) => t + s.quantity, 0);
      ctrl._consume = () => { throw new Error('ne doit pas être appelé'); };
      ctrl.onNewDay(2);
      const after = ctrl.npcStates.npc_05.inventory.reduce((t, s) => t + s.quantity, 0);
      assert(after >= before, 'pas de consommation interne');
    }],
    ['les PNJ montent leurs prix quand le joueur achète beaucoup', () => {
      let flow = 0;
      const { ctrl } = makeController({ getSupplyView: () => ({ status: 'balanced', coverage: 10, playerFlow: flow }) });
      const seller = npc('npc_06');
      const slot = { itemId: 'item_002', quantity: 1, quality: 50, perfection: 50 };
      const calm = withRandom(0.5, () => ctrl.listingPrice(seller, ctrl.npcStates[seller.id], slot));
      flow = 5;
      const hot = withRandom(0.5, () => ctrl.listingPrice(seller, ctrl.npcStates[seller.id], slot));
      assert(hot.price > calm.price, `${hot.price} > ${calm.price}`);
      assert(hot.why.includes('vous en achetez beaucoup'), 'raison expliquée');
    }]
  ]);
}
