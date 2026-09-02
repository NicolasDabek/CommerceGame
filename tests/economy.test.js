import { Economy } from '../js/core/Economy.js';
import { assert, assertEqual, runSuite } from './assert.js';

export function run() {
  return runSuite('economy', [
    ['evenement revert', () => {
      const eco = new Economy();
      const before = eco.categoryModifiers['Électronique'];
      const event = { id: 'test', name: 'Test', category: 'Électronique', modifier: 1.25, expiresAt: 10 };
      eco._applyEvent(event);
      eco.activeEvents.push(event);
      eco.expireEvents(11);
      const after = Math.round(eco.categoryModifiers['Électronique'] * 1000) / 1000;
      assertEqual(after, before);
      assertEqual(eco.activeEvents.length, 0);
    }],
    ['historique cap', () => {
      const eco = new Economy();
      for (let i = 0; i < 120; i++) eco.recordTransaction('item_001', 100 + i, i);
      assert(eco.priceHistory.item_001.length <= 80);
    }]
  ]);
}
