import { Offer } from '../js/models/Offer.js';
import { NEGOTIATION_TUNING } from '../js/systems/Negotiation.js';
import { assert, assertEqual, runSuite } from './assert.js';
import { makeGame, totalMoney } from './helpers.js';

const NPC = 'npc_05';

function npcListing(game, itemId, price, { buyout = true, qty = 3, owner = NPC } = {}) {
  const now = game.timeManager.now();
  const o = new Offer({ type: 'sell', itemId, quantity: qty, price, buyoutPrice: buyout ? price : null, ownerId: owner, durationDays: 1, quality: 50, perfection: 50, createdAt: now, msPerGameDay: game.timeManager.msPerGameDay });
  game.offers.push(o);
  return o;
}

function npcBuyOffer(game, itemId, price, qty = 3, owner = NPC) {
  const now = game.timeManager.now();
  const o = new Offer({ type: 'buy', itemId, quantity: qty, price, ownerId: owner, durationDays: 1, createdAt: now, msPerGameDay: game.timeManager.msPerGameDay });
  game.offers.push(o);
  return o;
}

/** Cherche le prix le plus bas accepté (sans consommer d'essais : on remet le compteur à zéro). */
function lowestAccepted(game, offer) {
  const neg = game.negotiation;
  const ctx = neg._context(offer.id);
  return neg._limit(ctx);
}

export function run() {
  return runSuite('marchandage', [
    ['achat : refus, contre-offre puis accord — argent conservé, objet reçu', async () => {
      const { game, restore } = await makeGame();
      try {
        game.player.money = 5000;
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const offer = npcListing(game, 'item_004', Math.round(ref * 1.12 * 100) / 100);
        game.npcController.npcStates[NPC].trust = 0.5;
        const before = totalMoney(game);
        const lim = lowestAccepted(game, offer);
        assert(lim.limit < lim.ask, 'le marchand a une marge');
        assert(lim.limit >= ref * NEGOTIATION_TUNING.floorRef - 0.01, 'jamais sous 90 % de la référence');

        const low = game.negotiate(offer.id, Math.round(lim.limit * 0.7 * 100) / 100, 1);
        assertEqual(low.outcome, 'refused', 'proposition trop basse');
        assert(low.insulted, 'vexé');
        assert(game.npcController.npcStates[NPC].trust < 0.5, 'confiance en baisse');

        const near = game.negotiate(offer.id, Math.round((lim.limit - lim.ask * 0.03) * 100) / 100, 1);
        assertEqual(near.outcome, 'counter', 'contre-offre si proche');
        assert(near.counter >= lim.limit && near.counter < lim.ask, 'contre-offre entre plancher et prix demandé');

        const ok = game.negotiate(offer.id, near.counter, 1, { acceptCounter: true });
        assertEqual(ok.outcome, 'accepted');
        assertEqual(ok.transaction.type, 'negotiated');
        assertEqual(game.player.inventory.count('item_004') >= 1, true, 'objet dans le sac');
        assertEqual(offer.quantity, 2, 'annonce diminuée');
        assert(Math.abs(totalMoney(game) - before) < 0.02, `argent conservé (${before} → ${totalMoney(game)})`);
        assertEqual(game.negotiation.stats.deals, 1);
      } finally { restore(); }
    }],
    ['plancher : confiance et rang maximum ne descendent jamais sous 90 % de la référence', async () => {
      const { game, restore } = await makeGame();
      try {
        game.player.money = 5000;
        game.player.reputation = 120;
        const st = game.npcController.npcStates[NPC];
        st.trust = 1; st.mood = 1; st.capital = 1;
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const offer = npcListing(game, 'item_004', Math.round(ref * 0.95 * 100) / 100);
        const lim = lowestAccepted(game, offer);
        assert(lim.limit >= Math.round(ref * NEGOTIATION_TUNING.floorRef * 100) / 100 - 0.01, `${lim.limit} ≥ ${ref * 0.9}`);
        const r = game.negotiate(offer.id, Math.round(ref * 0.85 * 100) / 100, 1);
        assert(r.outcome !== 'accepted', 'refus sous le plancher');
      } finally { restore(); }
    }],
    ['essais limités par marchand et par jour, puis remis à zéro le lendemain', async () => {
      const { game, restore } = await makeGame();
      try {
        game.player.money = 5000;
        const offer = npcListing(game, 'item_004', 20);
        const tries = game.negotiation.triesPerDay();
        for (let i = 0; i < tries; i++) {
          const r = game.negotiate(offer.id, 1, 1);
          assertEqual(r.outcome, 'refused');
        }
        const blocked = game.negotiate(offer.id, 1, 1);
        assertEqual(blocked.success, false, 'plus d\'essais');
        assert(/ne veut plus discuter/.test(blocked.error));
        game.negotiation.byNpc[NPC].day -= 1;
        assertEqual(game.negotiation.triesLeft(NPC), tries, 'nouveau jour');
      } finally { restore(); }
    }],
    ['vente : le marchand paie un peu plus, plafonné à 104 % de la référence, argent conservé', async () => {
      const { game, restore } = await makeGame();
      try {
        game.player.inventory.add('item_004', 5, 50, 50, 3);
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const st = game.npcController.npcStates[NPC];
        st.trust = 1; st.capital = 2000;
        const offer = npcBuyOffer(game, 'item_004', Math.round(ref * 0.92 * 100) / 100, 3);
        const before = totalMoney(game);
        const lim = lowestAccepted(game, offer);
        assert(lim.limit > offer.price, 'peut payer plus');
        assert(lim.limit <= ref * NEGOTIATION_TUNING.ceilRef + 0.01, 'plafond 104 %');
        const tooHigh = game.negotiate(offer.id, Math.round(ref * 1.5 * 100) / 100, 1);
        assertEqual(tooHigh.outcome, 'refused');
        const capBefore = st.capital;
        const lim2 = lowestAccepted(game, offer);
        const ok = game.negotiate(offer.id, lim2.limit, 2);
        assertEqual(ok.outcome, 'accepted');
        assertEqual(game.player.inventory.count('item_004'), 3);
        assert(st.capital < capBefore, 'le supplément est payé par le marchand');
        assertEqual(offer.quantity, 1);
        assert(Math.abs(totalMoney(game) - before) < 0.02, 'argent conservé');
      } finally { restore(); }
    }],
    ['Comptoir et enchères en cours : pas de marchandage ; 2 accords max par marchand et par jour', async () => {
      const { game, restore } = await makeGame();
      try {
        game.player.money = 5000;
        const city = npcListing(game, 'item_004', 20, { owner: 'city' });
        assertEqual(game.negotiate(city.id, 10, 1).success, false, 'Comptoir à prix fixe');
        const bidOn = npcListing(game, 'item_001', 50, { buyout: false });
        bidOn.currentBid = 51; bidOn.currentBidderId = 'npc_02';
        assert(game.getNegotiationQuote(bidOn.id).blocked, 'enchère en cours');
        const o = npcListing(game, 'item_004', 20, { qty: 5 });
        const lim = lowestAccepted(game, o);
        assertEqual(game.negotiate(o.id, lim.limit, 1).outcome, 'accepted');
        assertEqual(game.negotiate(o.id, lim.limit, 1).outcome, 'accepted');
        const third = game.negotiate(o.id, lim.limit, 1);
        assertEqual(third.success, false, 'troisième accord refusé');
      } finally { restore(); }
    }],
    ['annonce sans achat immédiat : prix demandé au-dessus du départ, achat direct possible', async () => {
      const { game, restore } = await makeGame();
      try {
        game.player.money = 5000;
        const ref = game.npcController.refPrice('item_004', 50, 50);
        const o = npcListing(game, 'item_004', Math.round(ref * 100) / 100, { buyout: false });
        const q = game.getNegotiationQuote(o.id);
        assert(q.ok && !q.blocked, 'négociable');
        assert(q.ask > o.price, 'prix demandé > départ');
        const lim = lowestAccepted(game, o);
        const r = game.negotiate(o.id, lim.limit, 1);
        assertEqual(r.outcome, 'accepted', JSON.stringify({ r: r.error, lim }));
        // Annonce déjà bradée : pas de rabais, mais achat direct au prix demandé (sans compter d'essai)
        const cheap = npcListing(game, 'item_004', Math.round(ref * 0.4 * 100) / 100, { buyout: false, owner: 'npc_08' });
        const cq = game.getNegotiationQuote(cheap.id);
        assert(cq.noRoom, 'aucune marge');
        const d = game.negotiate(cheap.id, cq.ask, 1);
        assert(d.success && d.direct, 'achat direct');
        assertEqual(game.negotiation.triesLeft('npc_08'), game.negotiation.triesPerDay(), 'aucun essai consommé');
      } finally { restore(); }
    }]
  ]);
}
