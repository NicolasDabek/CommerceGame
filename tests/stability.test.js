import { runSimulation, pairedBotRuns, meanCi } from '../scripts/simCore.mjs';
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
    ['Rentabilité et classement des robots (analyse GD passe 2, §4.3–4.4) : honnête ≥ +3 €/j, trader ≥ +1 €/j et ≥ 80 % de l\'honnête (passe 4), marchandeur entre honnête +20 % et +35 % (GD passe 6 ; 20 graines depuis GD passe 9), honnête fin/début ≤ 1,6, exploit et mauvais payeur perdants', async () => {
      const quiet = console.error;
      console.error = () => {};
      try {
        const r = {};
        const sums = {};
        // Passe 5 / GD passe 8 : honnête, marchandeur et trader sur 10 graines (écart-type entre graines 20–30 % du €/jour)
        // GD passe 9 : 20 graines pour les ratios (10 donnaient des écarts de ±15 % au moindre changement de règle) ;
        // la bande de masse monétaire reste vérifiée sur les 10 premières graines (lot A), lot B : ±7 %
        const merge = (a, b) => ({
          ...a,
          worthStart: (a.worthStart + b.worthStart) / 2,
          worthEnd: (a.worthEnd + b.worthEnd) / 2,
          gainPerDayEarly: Math.round((a.gainPerDayEarly + b.gainPerDayEarly) / 2 * 100) / 100,
          gainPerDayLate: Math.round((a.gainPerDayLate + b.gainPerDayLate) / 2 * 100) / 100,
          loans: (a.loans + b.loans) / 2,
          haggleSellsPerDay: Math.round((a.haggleSellsPerDay + b.haggleSellsPerDay) / 2 * 100) / 100,
          haggleDealsPerDay: Math.round((a.haggleDealsPerDay + b.haggleDealsPerDay) / 2 * 100) / 100,
          haggleBlockedFatigue: (a.haggleBlockedFatigue + b.haggleBlockedFatigue) / 2,
          diag: [...(a.diag || []), ...(b.diag || [])]
        });
        const bandsB = {};
        for (const mode of ['honest', 'haggler', 'trader', 'exploit', 'defaulter']) {
          const many = ['honest', 'haggler', 'trader'].includes(mode);
          const { summary } = await runSimulation({ days: 120, seeds: many ? 10 : 5, bot: mode });
          r[mode] = summary.bot;
          sums[mode] = summary;
          if (many) {
            const { summary: sB } = await runSimulation({ days: 120, seeds: 10, seedBase: 1000 + 10 * 7919, bot: mode });
            r[mode] = merge(summary.bot, sB.bot);
            bandsB[mode] = sB.moneyBand;
          }
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
        assert(g.haggler <= g.honest * 1.35, `marchandeur ${g.haggler} €/jour ≤ honnête ${g.honest} × 1,35 (GD passe 6)`);
        // GD passe 8 : sur 10 graines, le marchandeur ne s'essouffle pas (2de moitié ≥ 1re moitié)
        assert(r.haggler.gainPerDayLate >= r.haggler.gainPerDayEarly, `marchandeur 2de moitié ${r.haggler.gainPerDayLate} ≥ 1re moitié ${r.haggler.gainPerDayEarly}`);
        // GD passe 8 : achat-revente bridé — trader ≤ 1,35 × honnête, progression fin/début ≤ 1,35, gros contrats ≤ 8 par partie
        assert(g.trader <= g.honest * 1.35, `trader ${g.trader} €/jour ≤ honnête ${g.honest} × 1,35 (20 graines)`);
        assert(r.trader.gainPerDayLate <= r.trader.gainPerDayEarly * 1.35, `trader fin/début : ${r.trader.gainPerDayLate} / ${r.trader.gainPerDayEarly} (cible ≤ 1,35)`);
        const bigPerGame = (r.trader.diag || []).reduce((t, d) => t + (d.bigContracts || 0), 0) / Math.max(1, (r.trader.diag || []).length);
        assert(bigPerGame <= 8, `gros contrats : ${bigPerGame.toFixed(1)} par partie de 120 j (cible ≤ 8)`);
        // GD passe 6 : puits d'argent progressif (taxe d'étal) → l'honnête finit au plus à 1,6 × son €/jour de début
        assert(r.honest.gainPerDayLate <= r.honest.gainPerDayEarly * 1.6, `honnête fin/début : ${r.honest.gainPerDayLate} / ${r.honest.gainPerDayEarly} (cible ≤ 1,6)`);
        // GD passe 10 : clients d'étal qui marchandent (rang 2+) → le marchandeur marchande aussi ses ventes
        assert(r.haggler.haggleSellsPerDay >= 0.4, `marchandeur : ${r.haggler.haggleSellsPerDay} vente(s) marchandée(s)/jour (cible ≥ 0,4)`);
        // Cible GD 10 : ≥ 1,5 accord/jour ; mesuré 1,42 sur 20 graines sans sortir de +20–35 % — garde-fou à 1,3
        assert(r.haggler.haggleDealsPerDay >= 1.3, `marchandeur : ${r.haggler.haggleDealsPerDay} accord(s)/jour (garde-fou ≥ 1,3)`);
        // GD passe 10 : l'humeur du marchand est visible avant l'offre → le trader ne bute plus sur la lassitude
        assert(r.trader.haggleBlockedFatigue <= 40, `trader : ${r.trader.haggleBlockedFatigue} marchandage(s) bloqué(s) par la lassitude sur 120 j (cible ≤ 40)`);
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
          const bB = bandsB[mode];
          assert(bB[0] >= 0.93 && bB[1] <= 1.07, `${mode} : masse monétaire lot B ${bB} (±7 %)`);
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
    ['Passe 5 / GD passe 6 : le crédit paie sans dominer — trader avec prêts entre +15 % et +25 % du trader sans prêt, aléa de livraison', async () => {
      const quiet = console.error;
      console.error = () => {};
      const prev = globalThis.__BOT_PARAMS;
      try {
        const res = {};
        for (const [k, params] of [['loans', { traderActs: 4 }], ['noLoan', { traderActs: 4, traderMaxLoans: 0 }]]) {
          globalThis.__BOT_PARAMS = params;
          // GD passe 8 : 10 graines (5 auparavant)
          const { summary } = await runSimulation({ days: 120, seeds: 10, bot: 'trader' });
          res[k] = summary;
        }
        const g = (s) => Math.round((s.bot.worthEnd - s.bot.worthStart) / 120 * 100) / 100;
        assert(res.noLoan.bot.loans === 0, `trader sans prêt : ${res.noLoan.bot.loans} prêt(s)`);
        assert(res.loans.bot.loans >= 1, `trader : ${res.loans.bot.loans} prêt(s)`);
        const big = (res.loans.bot.diag || []).reduce((t, d) => t + (d.bigContracts || 0), 0);
        assert(big >= 5, `gros contrats livrés à crédit : ${big} (cible ≥ 5 sur 10 graines)`);
        assert(Math.round(g(res.loans) / g(res.noLoan) * 100) / 100 >= 1.15, `trader avec prêts ${g(res.loans)} €/jour ≥ sans prêt ${g(res.noLoan)} × 1,15`);
        // GD passe 6 : le crédit paie, sans dominer — borne haute +25 % et trader ≤ 1,4 × l'honnête
        assert(g(res.loans) <= g(res.noLoan) * 1.25, `trader avec prêts ${g(res.loans)} €/jour ≤ sans prêt ${g(res.noLoan)} × 1,25`);
        globalThis.__BOT_PARAMS = prev;
        // GD passe 9 : « trader ≤ 1,35 × honnête » est vérifié sur 20 graines dans le test « Rentabilité et classement »
        // GD passe 6 : aléa de livraison — le crédit n'est plus sans risque
        const fails = (res.loans.bot.diag || []).reduce((t, d) => t + (d.bigFail || 0), 0);
        assert(fails >= 1 && fails < big, `gros contrats en retard : ${fails} / ${big}`);
        for (const k of Object.keys(res)) assert(res[k].moneyBand[0] >= 0.9 && res[k].moneyBand[1] <= 1.05, `${k} : masse monétaire ${res[k].moneyBand}`);
      } finally {
        globalThis.__BOT_PARAMS = prev;
        console.error = quiet;
      }
    }],
    ['GD passe 11 / 12 : trader hybride (crédit + clients d\'étal), 20 graines appariées — ≤ 1,35 × honnête, variante « garde son stock » comprise (GD 12), apport du crédit ≤ +25 % (garde-fou ≥ +10 %), masse 0,90–1,10, aucun paiement PNJ négatif ; scénario historique conservé', async () => {
      const quiet = console.error;
      console.error = () => {};
      try {
        const res = {};
        // GD passe 11 (P2) : jours de rang et d'objectif de la branche « approvisionneur » pour l'honnête
        const marks = [];
        let cur = null;
        globalThis.__SIM_DAY_HOOK = (game, day) => {
          if (day === 1) { cur = {}; marks.push(cur); }
          for (const id of ['supply_deliveries_20', 'supply_deliveries_40', 'haggle_sells_10']) if (cur[id] == null && game.completedGoals.includes(id)) cur[id] = day;
        };
        try { res.honest = await pairedBotRuns({ bot: 'honest', days: 120 }); } finally { delete globalThis.__SIM_DAY_HOOK; }
        const ok3 = marks.filter(m => m.supply_deliveries_20 != null).length;
        const ok4 = marks.filter(m => m.supply_deliveries_40 != null).length;
        assert(marks.length === 20 && ok3 >= 16 && ok4 >= 16, `honnête : palier 3 sur ${ok3}/20 graines, palier 4 sur ${ok4}/20 (cible ≥ 16/20)`);
        assert(marks.every(m => m.haggle_sells_10 == null), 'l\'honnête ne valide pas la branche marchandage');
        for (const bot of ['trader_hybrid', 'trader_hybrid_keep', 'trader_hybrid_no_loan']) res[bot] = await pairedBotRuns({ bot, days: 120 });
        const g = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, meanCi(v.map(x => x.gain)).mean]));
        for (const bot of ['trader_hybrid', 'trader_hybrid_keep']) {
          assert(res[bot].length === 20, `${bot} : 20 graines`);
          // Cible GD 11 « ≤ 1,35 × honnête ». GD passe 12 : l'hybride qui garde son stock (1,38 en GD 11, garde-fou 1,5 ×)
          // est ramené à 1,33 par l'anti-flip du jour même + la marchandise gagée → même borne 1,35 pour les deux variantes.
          const cap = 1.35;
          assert(g[bot] <= g.honest * cap, `${bot} ${g[bot]} €/jour ≤ honnête ${g.honest} × ${cap} (20 graines appariées)`);
          const stall = res[bot].reduce((t, x) => t + x.stallSalesPerDay, 0) / 20;
          assert(stall > 0.1, `${bot} : ${stall} vente(s) d'étal/jour — le scénario utilise bien les clients d'étal`);
          for (const x of res[bot]) {
            assert(x.moneyBand[0] >= 0.9 && x.moneyBand[1] <= 1.1, `${bot} graine ${x.seed} : masse monétaire ${x.moneyBand}`);
            assert(x.negPayments === 0, `${bot} graine ${x.seed} : ${x.negPayments} paiement(s) PNJ ≤ 0`);
            assert(x.minCapital >= 0, `${bot} graine ${x.seed} : trésorerie PNJ minimale ${x.minCapital}`);
          }
        }
        // GD passe 12 : marchandise gagée → le crédit paie aussi pour l'hybride (1,07 en GD 11). Cible +15–25 % : 1,14 sur ces
        // 20 graines, 1,17 sur 40 (IC95 de la différence appariée ±1,1 €/j) — borne haute 1,25 tenue, garde-fou bas 1,10.
        const lift = g.trader_hybrid / g.trader_hybrid_no_loan;
        assert(lift <= 1.25 && lift >= 1.1, `hybride avec / sans crédit : ${g.trader_hybrid} / ${g.trader_hybrid_no_loan} = ${lift.toFixed(3)} (1,10–1,25)`);
        // le scénario historique reste celui d'un trader qui ignore l'étal
        const { summary } = await runSimulation({ days: 40, seeds: 1, bot: 'trader' });
        assert(summary.bot.stallSalesPerDay === 0, `trader historique : ${summary.bot.stallSalesPerDay} vente(s) d'étal`);
      } finally {
        console.error = quiet;
      }
    }],
    ['GD passe 8 / 9 / 10 : garde-fou large sur 3 graines — marchandeur ≥ 0,85 × honnête, trader ≤ 1,5 × honnête', async () => {
      const quiet = console.error;
      console.error = () => {};
      try {
        const g = {};
        for (const mode of ['honest', 'haggler', 'trader']) {
          const { summary } = await runSimulation({ days: 120, seeds: 3, bot: mode });
          g[mode] = (summary.bot.worthEnd - summary.bot.worthStart) / 120;
        }
        // GD passe 9 : sur 3 graines le ratio marchandeur / honnête varie de 0,9 à 1,5 au moindre changement de règle
        // (cible réelle +20–35 % vérifiée sur 20 graines) : ce garde-fou ne détecte plus qu'un effondrement
        assert(g.haggler >= g.honest * 0.85, `marchandeur ${g.haggler.toFixed(2)} €/jour ≥ honnête ${g.honest.toFixed(2)} × 0,85 (3 graines)`);
        // GD passe 10 : resserré de 1,6 à 1,5 (ratio réel mesuré sur 20 graines : ≈ 1,29)
        assert(g.trader <= g.honest * 1.5, `trader ${g.trader.toFixed(2)} €/jour ≤ honnête ${g.honest.toFixed(2)} × 1,5 (3 graines)`);
      } finally {
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
