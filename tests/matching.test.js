import { MatchingEngine } from '../js/systems/MatchingEngine.js';
import { Offer } from '../js/models/Offer.js';
import { assert, assertEqual, runSuite } from './assert.js';

export function run() {
  return runSuite('matching', [
    ['achat >= vente', () => {
      const txs = [];
      const engine = new MatchingEngine({ onTransaction: tx => txs.push(tx) });
      const sell = new Offer({ type: 'sell', itemId: 'item_001', quantity: 2, price: 10, ownerId: 'a', durationDays: 1 });
      const buy = new Offer({ type: 'buy', itemId: 'item_001', quantity: 2, price: 12, ownerId: 'b', durationDays: 1 });
      engine.match(sell, [sell, buy]);
      assertEqual(txs.length, 1);
      assertEqual(txs[0].price, 10);
      assertEqual(sell.status, 'completed');
    }],
    ['pas auto-trade', () => {
      const txs = [];
      const engine = new MatchingEngine({ onTransaction: tx => txs.push(tx) });
      const sell = new Offer({ type: 'sell', itemId: 'item_001', quantity: 1, price: 10, ownerId: 'a', durationDays: 1 });
      const buy = new Offer({ type: 'buy', itemId: 'item_001', quantity: 1, price: 12, ownerId: 'a', durationDays: 1 });
      engine.match(sell, [sell, buy]);
      assertEqual(txs.length, 0);
    }],
    ['FIFO', () => {
      const txs = [];
      const engine = new MatchingEngine({ onTransaction: tx => txs.push(tx) });
      const oldBuy = new Offer({ type: 'buy', itemId: 'item_001', quantity: 1, price: 12, ownerId: 'b', durationDays: 1, createdAt: 1 });
      const newBuy = new Offer({ type: 'buy', itemId: 'item_001', quantity: 1, price: 15, ownerId: 'c', durationDays: 1, createdAt: 2 });
      const sell = new Offer({ type: 'sell', itemId: 'item_001', quantity: 1, price: 10, ownerId: 'a', durationDays: 1, createdAt: 3 });
      engine.match(sell, [sell, newBuy, oldBuy]);
      assertEqual(txs[0].buyerId, 'b');
    }]
  ]);
}
