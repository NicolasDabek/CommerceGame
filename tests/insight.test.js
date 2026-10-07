import { Game } from '../js/core/Game.js';
import { assert, assertEqual, runSuite } from './assert.js';

export function run() {
  return runSuite('insight', [
    ['getItemInsight expose carnet et historique', () => {
      const game = new Game();
      game.giveStarterItems();
      game.economy.recordTransaction('item_001', 200, Date.now());
      game.economy.recordTransaction('item_001', 190, Date.now());
      const insight = game.getItemInsight('item_001');
      assert(insight.item, 'item présent');
      assert(insight.average > 0, 'moyenne > 0');
      assertEqual(insight.ownedQty, 2);
      assert(insight.history.length >= 2, 'historique');
      assert(insight.high >= insight.low, 'haut >= bas');
      const rows = game.getMarketRows();
      assert(rows.some(r => r.item.id === 'item_001' && r.high != null), 'market rows enrichies');
    }]
  ]);
}
