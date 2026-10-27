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
          // Passe 5 : les gros contrats à crédit font gagner le trader plus vite en début de partie → 12 €/jour pour lui
          const capDay = mode === 'trader' ? 12 : 10;
          assert(b.bestRunGainPerDay < capDay, `${mode} : gain ${b.bestRunGainPerDay} €/jour (< ${capDay})`);
          assert(b.worthEnd < b.worthStart * (mode === 'trader' ? 1.45 : 1.3), `${mode} : patrimoine ${b.worthStart} → ${b.worthEnd}`);
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
        // Passe 5 : honnête et marchandeur sur 10 graines (comparaison moitié par moitié, moins sensible au hasard)
        for (const mode of ['honest', 'haggler', 'trader', 'exploit', 'defaulter']) {
          const { summary } = await runSimulation({ days: 120, seeds: mode === 'honest' || mode === 'haggler' ? 10 : 5, bot: mode });
          r[mode] = summary.bot;
          sums[mode] = summary;
        }
        const gain = (b) => (b.worthEnd - b.worthStart) / 120;
        const g = Object.fromEntries(Object.entries(r).map(([k, b]) => [k, Math.round(gain(b) * 100) / 100]));
        assert(g.honest >= 3, `honnête : ${g.honest} €/jour (cible ≥ 3)`);
        assert(r.honest.worthEnd >= 1600, `honnête : valeur finale ${r.honest.worthEnd} (cible ≥ 1 600)`);
        assert(g.trader >= 1, `trader : ${g.trader} €/jour (cible ≥ 1)`);
        // GD passe 4 : le trader joue 4 fois par jour comme l'honnête — c'est ce rythme (et non le taux « contrat »)
        // qui l'a rendu rentable ; passe 5 : le crédit, lui, doit payer (voir le test « trader avec / sans prêts »)
        assert(g.trader >= g.honest * 0.8, `trader ${g.trader} €/jour ≥ honnête ${g.honest} × 0,8`);
        // GD passe 4 : prime de démarrage → l'honnête gagne ≥ 2,5 €/jour en début de partie
        assert(r.honest.gainPerDayEarly >= 2.5, `honnête début de partie : ${r.honest.gainPerDayEarly} €/jour (cible ≥ 2,5)`);
        assert(g.haggler >= g.honest * 1.2, `marchandeur ${g.haggler} €/jour ≥ honnête ${g.honest} × 1,2`);
        // Passe 3 : le marchandage aide sans devenir la seule stratégie viable
        assert(g.haggler <= g.honest * 1.6, `marchandeur ${g.haggler} €/jour ≤ honnête ${g.honest} × 1,6`);
        // Passe 5 : la fourchette +20 % … +60 % tient sur CHAQUE moitié de partie
        for (const [k, label] of [['gainPerDayEarly', '1re moitié'], ['gainPerDayLate', '2de moitié']]) {
          const h = r.haggler[k], o = r.honest[k];
          assert(h >= o * 1.2 && h <= o * 1.6, `marchandeur ${label} : ${h} €/jour pour honnête ${o} (cible ×1,2 … ×1,6)`);
        }
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
    ['Passe 5 : le crédit paie — trader avec prêts (gros contrats) ≥ +15 % / trader sans prêt (4 actions/jour, 5 graines)', async () => {
      const quiet = console.error;
      console.error = () => {};
      const prev = globalThis.__BOT_PARAMS;
      try {
        const res = {};
        for (const [k, params] of [['loans', { traderActs: 4 }], ['noLoan', { traderActs: 4, traderMaxLoans: 0 }]]) {
          globalThis.__BOT_PARAMS = params;
          const { summary } = await runSimulation({ days: 120, seeds: 5, bot: 'trader' });
          res[k] = summary;
        }
        const g = (s) => Math.round((s.bot.worthEnd - s.bot.worthStart) / 120 * 100) / 100;
        assert(res.noLoan.bot.loans === 0, `trader sans prêt : ${res.noLoan.bot.loans} prêt(s)`);
        assert(res.loans.bot.loans >= 1, `trader : ${res.loans.bot.loans} prêt(s)`);
        const big = (res.loans.bot.diag || []).reduce((t, d) => t + (d.bigContracts || 0), 0);
        assert(big >= 5, `gros contrats livrés à crédit : ${big} (cible ≥ 5 sur 5 graines)`);
        assert(g(res.loans) >= g(res.noLoan) * 1.15, `trader avec prêts ${g(res.loans)} €/jour ≥ sans prêt ${g(res.noLoan)} × 1,15`);
        for (const k of Object.keys(res)) assert(res[k].moneyBand[0] >= 0.9 && res[k].moneyBand[1] <= 1.05, `${k} : masse monétaire ${res[k].moneyBand}`);
      } finally {
        globalThis.__BOT_PARAMS = prev;
        console.error = quiet;
      }
    }],
    ['Comptoir passe 2–5 : bande de prix élargie, subventions ≤ 20 k€ et ≤ 6 commandes publiques/jour (passe 5), pénuries chroniques ≤ 12 jours (passe 3), demande non servie ≤ 1/jour, ≤ 6 interventions/jour (passe 4)', async () => {
      const quiet = console.error;
      console.error = () => {};
      try {
        const { summary: s, runs } = await runSimulation({ days: 120, seeds: 3 });
        // Passe 5 : ≤ 6 commandes publiques d'achat par jour (×10 unités, 2 jours, ciblées) et subventions ≤ 20 k€
        const subs = runs.reduce((t, r) => t + (r.reserveStats?.subsidies || 0), 0) / runs.length;
        assert(subs <= 20000, `subventions ${Math.round(subs)} € par partie (cible ≤ 20 000)`);
        const procMax = Math.max(...runs.map(r => r.reserveStats?.procureMaxDay || 0));
        assert(procMax >= 1 && procMax <= 6, `commandes publiques d'achat : au plus ${procMax}/jour (cible ≤ 6)`);
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
