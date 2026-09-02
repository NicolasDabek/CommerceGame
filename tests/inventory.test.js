import { Inventory } from '../js/models/Inventory.js';
import { assert, assertEqual, runSuite } from './assert.js';

export function run() {
  return runSuite('inventory', [
    ['add remove', () => {
      const inv = new Inventory(10);
      assert(inv.add('item_001', 3, 50, 50, 10));
      assertEqual(inv.count('item_001'), 3);
      assertEqual(inv.remove('item_001', 2), 2);
    }],
    ['rollback partiel', () => {
      const inv = new Inventory(10);
      inv.add('item_001', 1, 50, 50);
      assertEqual(inv.remove('item_001', 5), 1);
    }],
    ['cases pleines', () => {
      const inv = new Inventory(1);
      assert(inv.add('item_001', 1, 50, 50));
      assert(!inv.add('item_002', 1, 50, 50));
    }]
  ]);
}
