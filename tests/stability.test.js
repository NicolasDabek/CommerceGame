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
    ['Rentabilité et classement des robots (analyse GD passe 2, §4.3–4.4) : honnête ≥ +3 €/j, trader ≥ +1 €/j et ≥ 80 % de l\'honnête (passe 4), marchandeur entre honnête +20 % et +60 % (passe 3, 5 graines), exploit et mauvais payeur perdants', async () => {
      const quiet = console.error;
      console.error = () => {};
      try {
        const r = {};
        const sums = {};
        for (const mode of ['honest', 'haggler', 'trader', 'exploit', 'defaulter']) {
          const { summary } = await runSimulation({ days: 120, seeds: 5, bot: mode });
          r[mode] = summary.bot;
          sums[mode] = summary;
        }
        const gain = (b) => (b.worthEnd - b.worthStart) / 120;
        const g = Object.fromEntries(Object.entries(r).map(([k, b]) => [k, Math.round(gain(b) * 100) / 100]));
        assert(g.honest >= 3, `honnête : ${g.honest} €/jour (cible ≥ 3)`);
        assert(r.honest.worthEnd >= 1600, `honnête : valeur finale ${r.honest.worthEnd} (cible ≥ 1 600)`);
        assert(g.trader >= 1, `trader : ${g.trader} €/jour (cible ≥ 1)`);
        // GD passe 4 : le crédit (taux « contrat » −30 %) rend le trader rentable : ≥ 80 % de l'honnête
        assert(g.trader >= g.honest * 0.8, `trader ${g.trader} €/jour ≥ honnête ${g.honest} × 0,8`);
        // GD passe 4 : prime de démarrage → l'honnête gagne ≥ 2,5 €/jour en début de partie
        assert(r.honest.gainPerDayEarly >= 2.5, `honnête début de partie : ${r.honest.gainPerDayEarly} €/jour (cible ≥ 2,5)`);
        assert(g.haggler >= g.honest * 1.2, `marchandeur ${g.haggler} €/jour ≥ honnête ${g.honest} × 1,2`);
        // Passe 3 : le marchandage aide sans devenir la seule stratégie viable
        assert(g.haggler <= g.honest * 1.6, `marchandeur ${g.haggler} €/jour ≤ honnête ${g.honest} × 1,6`);
        assert(r.trader.loans >= 1, `trader : ${r.trader.loans} prêt(s) par partie (cible ≥ 1)`);
        assert(g.exploit < 0, `exploit : ${g.exploit} €/jour (doit rester négatif)`);
        assert(r.defaulter.worthEnd < r.defaulter.worthStart && r.defaulter.worthEnd < r.honest.worthEnd, `mauvais payeur ${r.defaulter.worthStart} → ${r.defaulter.worthEnd} (honnête ${r.honest.worthEnd})`);
        // GD passe 4 : masse monétaire ≥ 0,90 pour TOUS les robots (stock saisi au prix courant)
        for (const mode of Object.keys(sums)) {
          assert(sums[mode].moneyBand[0] >= 0.9, `${mode} : masse monétaire min ${sums[mode].moneyBand[0]} (cible ≥ 0,90)`);
        }
        for (const mode of ['honest', 'haggler', 'trader']) {
          const band = sums[mode].moneyBand;
          assert(band[0] >= 0.95 && band[1] <= 1.05, `${mode} : masse monétaire ${band} (±5 %)`);
        }
        // Passe 3b : moins de subventions → les pénalités et la dette impayée du mauvais payeur finissent détruites
        // au-delà du plafond du Comptoir : la masse peut baisser jusqu'à −10 %, jamais monter
        const bandD = sums.defaulter.moneyBand;
        assert(bandD[0] >= 0.9 && bandD[1] <= 1.05, `defaulter : masse monétaire ${bandD} (−10 % / +5 %)`);
        // L'exploit paie beaucoup d'intérêts, détruits au-delà du plafond du Comptoir : la masse peut baisser, jamais monter
        assert(sums.exploit.moneyBand[1] <= 1.05, `exploit : aucune création d'argent ${sums.exploit.moneyBand}`);
      } finally {
        console.error = quiet;
      }
    }],
    ['Comptoir passe 2–4 : bande de prix élargie, subventions ≤ 25 k€, pénuries chroniques ≤ 12 jours (passe 3), demande non servie ≤ 1/jour, ≤ 6 interventions/jour (passe 4)', async () => {
      const quiet = console.error;
      console.error = () => {};
      try {
        const { summary: s, runs } = await runSimulation({ days: 120, seeds: 3 });
        // Passe 3b : subventions ≤ 25 k€ par partie (part reversée 0,15, 16 commandes/jour à 95 %)
        const subs = runs.reduce((t, r) => t + (r.reserveStats?.subsidies || 0), 0) / runs.length;
        assert(subs <= 25000, `subventions ${Math.round(subs)} € par partie (cible ≤ 25 000)`);
        assert(s.priceLateBand[0] >= 0.75 && s.priceLateBand[1] <= 1.5, `bande tardive ${s.priceLateBand}`);
        assert(s.moneyBand[0] >= 0.95 && s.moneyBand[1] <= 1.05, `masse monétaire ${s.moneyBand}`);
        assert(s.shortageLongest <= 12, `plus longue pénurie ${s.shortageLongest} j`);
        assert(s.cityUnmetPerDay <= 1, `demande non servie ${s.cityUnmetPerDay}/jour`);
        // GD passe 4 : le Comptoir régule rarement (écart > 15 % deux jours de suite) : ≤ 6 interventions/jour
        const reg = runs.reduce((t, r) => t + (r.reserveStats?.regulations || 0), 0) / runs.length / 120;
        assert(reg <= 6, `interventions de régulation ${reg.toFixed(2)}/jour (cible ≤ 6)`);
      } finally {
        console.error = quiet;
      }
    }]
  ]);
}
