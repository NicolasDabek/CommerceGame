import { AuctionHouse } from '../js/systems/AuctionHouse.js';
import { Offer } from '../js/models/Offer.js';
import { assert, assertEqual, runSuite } from './assert.js';

export function run() {
  return runSuite('auction', [
    ['rembourse precedent', () => {
      const balances = { player: 100, npc_01: 100 };
      const house = new AuctionHouse({
        lockFunds: (id, amount) => {
          if (balances[id] < amount) return false;
          balances[id] -= amount;
          return true;
        },
        unlockFunds: (id, amount) => { balances[id] += amount; }
      });
      const offer = new Offer({ type: 'sell', itemId: 'item_001', quantity: 1, price: 10, ownerId: 'seller', durationDays: 1 });
      assert(house.placeBid(offer, 'player', 12).success);
      assertEqual(Math.round(balances.player), 88);
      assert(house.placeBid(offer, 'npc_01', 13).success);
      assertEqual(Math.round(balances.player), 100);
      assertEqual(offer.currentBidderId, 'npc_01');
    }],
    ['enchere trop basse', () => {
      const house = new AuctionHouse({ lockFunds: () => true, unlockFunds: () => {} });
      const offer = new Offer({ type: 'sell', itemId: 'item_001', quantity: 1, price: 10, ownerId: 'seller', durationDays: 1 });
      house.placeBid(offer, 'player', 10);
      assert(!house.placeBid(offer, 'npc_01', 10).success);
    }]
  ]);
}
