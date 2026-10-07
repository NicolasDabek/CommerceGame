import { runSimulation } from '../scripts/simCore.mjs';
import { assert, runSuite } from './assert.js';

export function run() {
  return runSuite('stabilité', [
    ['60 jours de PNJ : prix et masse monétaire restent dans la bande', async () => {
      const quiet = console.error;
      console.error = () => {};
      let result;
      try {
        result = await runSimulation({ days: 60, seeds: 2 });
      } finally {
        console.error = quiet;
      }
      const s = result.summary;
      assert(s.priceLow >= 0.75 && s.pricePeak <= 1.3, `niveau des prix ${s.priceLow}–${s.pricePeak}`);
      assert(s.priceEndMin >= 0.4 && s.priceEndMax <= 2, `objets extrêmes ${s.priceEndMin}–${s.priceEndMax}`);
      assert(s.moneyBand[0] >= 0.85 && s.moneyBand[1] <= 1.15, `masse monétaire ${s.moneyBand}`);
      assert(s.txPerDay >= 5, `activité ${s.txPerDay} tx/jour`);
      assert(Date.now() > 1.7e12, 'horloge restaurée');
    }]
  ]);
}
