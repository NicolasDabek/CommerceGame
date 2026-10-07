import { AuctionHouse } from '../js/systems/AuctionHouse.js';
import { Offer } from '../js/models/Offer.js';
import { MatchingEngine } from '../js/systems/MatchingEngine.js';
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
    }],
    ['achat immédiat : enchère remboursée et effacée', () => {
      const balances = { player: 100, buyer: 1000 };
      const engine = new MatchingEngine({ onTransaction: () => {} });
      const house = new AuctionHouse({
        matchingEngine: engine,
        getPlayerMoney: () => balances.player,
        removePlayerMoney: (a) => { balances.player -= a; return true; },
        addPlayerMoney: (a) => { balances.player += a; },
        lockFunds: (id, amount) => { if (balances[id] < amount) return false; balances[id] -= amount; return true; },
        unlockFunds: (id, amount) => { balances[id] += amount; }
      });
      const offer = new Offer({ type: 'sell', itemId: 'item_002', quantity: 2, price: 10, buyoutPrice: 30, ownerId: 'seller', durationDays: 1 });
      assert(house.placeBid(offer, 'buyer', 12).success);
      assertEqual(balances.buyer, 976);
      assert(house.buyout(offer, 'player', 1).success, 'achat partiel');
      assertEqual(balances.buyer, 1000, 'enchérisseur remboursé');
      assertEqual(offer.currentBid, null, 'enchère effacée (sinon objet gratuit à l\'échéance)');
      assertEqual(offer.currentBidderId, null);
      assertEqual(offer.quantity, 1);
    }]
  ]);
}
