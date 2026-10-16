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
    }],
    ['Robots joueurs (marchandage, crédit en boucle) : aucune richesse infinie', async () => {
      const quiet = console.error;
      console.error = () => {};
      try {
        for (const mode of ['trader', 'exploit', 'honest']) {
          const { summary } = await runSimulation({ days: 40, seeds: 1, bot: mode });
          const b = summary.bot;
          assert(b.bestRunGainPerDay < 10, `${mode} : gain ${b.bestRunGainPerDay} €/jour`);
          assert(b.worthEnd < b.worthStart * 1.3, `${mode} : patrimoine ${b.worthStart} → ${b.worthEnd}`);
          assert(summary.moneyBand[0] >= 0.85 && summary.moneyBand[1] <= 1.15, `${mode} : masse monétaire ${summary.moneyBand}`);
        }
      } finally {
        console.error = quiet;
      }
    }],
    ['Classement des robots (analyse GD, §3) : honnête rentable > trader ≥ mauvais payeur > exploit', async () => {
      const quiet = console.error;
      console.error = () => {};
      try {
        const r = {};
        for (const mode of ['honest', 'trader', 'exploit']) r[mode] = (await runSimulation({ days: 120, seeds: 2, bot: mode })).summary.bot;
        const gain = (b) => (b.worthEnd - b.worthStart) / 120;
        assert(gain(r.honest) > 0.2 && gain(r.honest) < 10, `honnête : ${gain(r.honest).toFixed(2)} €/jour (modeste mais positif)`);
        assert(r.honest.worthEnd > r.trader.worthEnd, `honnête ${r.honest.worthEnd} > trader ${r.trader.worthEnd}`);
        assert(r.trader.worthEnd > r.exploit.worthEnd, `trader ${r.trader.worthEnd} > exploit ${r.exploit.worthEnd}`);
      } finally {
        console.error = quiet;
      }
    }]
  ]);
}
