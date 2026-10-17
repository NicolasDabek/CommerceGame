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
    ['Rentabilité et classement des robots (analyse GD passe 2, §4.3–4.4) : honnête ≥ +3 €/j, trader ≥ +1 €/j, marchandeur ≥ honnête +20 %, exploit et mauvais payeur perdants', async () => {
      const quiet = console.error;
      console.error = () => {};
      try {
        const r = {};
        const sums = {};
        for (const mode of ['honest', 'haggler', 'trader', 'exploit', 'defaulter']) {
          const { summary } = await runSimulation({ days: 120, seeds: 3, bot: mode });
          r[mode] = summary.bot;
          sums[mode] = summary;
        }
        const gain = (b) => (b.worthEnd - b.worthStart) / 120;
        const g = Object.fromEntries(Object.entries(r).map(([k, b]) => [k, Math.round(gain(b) * 100) / 100]));
        assert(g.honest >= 3, `honnête : ${g.honest} €/jour (cible ≥ 3)`);
        assert(r.honest.worthEnd >= 1600, `honnête : valeur finale ${r.honest.worthEnd} (cible ≥ 1 600)`);
        assert(g.trader >= 1, `trader : ${g.trader} €/jour (cible ≥ 1)`);
        assert(g.haggler >= g.honest * 1.2, `marchandeur ${g.haggler} €/jour ≥ honnête ${g.honest} × 1,2`);
        assert(g.exploit < 0, `exploit : ${g.exploit} €/jour (doit rester négatif)`);
        assert(r.defaulter.worthEnd < r.defaulter.worthStart && r.defaulter.worthEnd < r.honest.worthEnd, `mauvais payeur ${r.defaulter.worthStart} → ${r.defaulter.worthEnd} (honnête ${r.honest.worthEnd})`);
        for (const mode of ['honest', 'haggler', 'trader', 'defaulter']) {
          const band = sums[mode].moneyBand;
          assert(band[0] >= 0.95 && band[1] <= 1.05, `${mode} : masse monétaire ${band} (±5 %)`);
        }
        // L'exploit paie beaucoup d'intérêts, détruits au-delà du plafond du Comptoir : la masse peut baisser, jamais monter
        assert(sums.exploit.moneyBand[1] <= 1.05, `exploit : aucune création d'argent ${sums.exploit.moneyBand}`);
      } finally {
        console.error = quiet;
      }
    }],
    ['Comptoir passe 2 : bande de prix élargie, pénuries chroniques ≤ 15 jours, demande non servie ≤ 1/jour', async () => {
      const quiet = console.error;
      console.error = () => {};
      try {
        const { summary: s } = await runSimulation({ days: 120, seeds: 3 });
        assert(s.priceLateBand[0] >= 0.75 && s.priceLateBand[1] <= 1.5, `bande tardive ${s.priceLateBand}`);
        assert(s.moneyBand[0] >= 0.95 && s.moneyBand[1] <= 1.05, `masse monétaire ${s.moneyBand}`);
        assert(s.shortageLongest <= 15, `plus longue pénurie ${s.shortageLongest} j`);
        assert(s.cityUnmetPerDay <= 1, `demande non servie ${s.cityUnmetPerDay}/jour`);
      } finally {
        console.error = quiet;
      }
    }]
  ]);
}
