/**
 * Cœur de la simulation headless de l'économie (PNJ seuls, sans navigateur ni réseau).
 * Utilisé par `npm run sim` (scripts/sim.mjs) et par le test de stabilité (tests/stability.test.js).
 *
 * L'environnement est simulé le temps du calcul puis restauré :
 *  - localStorage en mémoire, horloge virtuelle (Date.now), hasard déterministe (Math.random).
 */

const TICK_MS = 8000; // même cadence que main.js

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r3 = (n) => Math.round(n * 1000) / 1000;

/* Demande de référence (unités / jour) pour mesurer la couverture de façon identique avant / après */
const REF_CAT = { 'Nourriture': 1.6, 'Ressources': 1.0, 'Outils': 0.5, 'Vêtements': 0.6, 'Électronique': 0.5, 'Divers': 0.3 };
const REF_RARITY = { 'Commun': 1, 'Rare': 0.5, 'Épique': 0.25 };
function refDemand(item) {
  return (REF_CAT[item.category] ?? 0.5) * (REF_RARITY[item.rarity] ?? 1);
}

/** Pénuries : objet sans aucune annonce (hors Comptoir) ou couverture < 1 jour de demande. */
function supplyByItem(game, ITEMS) {
  const units = {};
  const listed = {};
  ITEMS.forEach(i => { units[i.id] = 0; listed[i.id] = 0; });
  Object.values(game.npcController.npcStates).forEach(st => st.inventory.forEach(sl => { units[sl.itemId] = (units[sl.itemId] || 0) + sl.quantity; }));
  game.offers.forEach(o => {
    if (o.status !== 'active' || o.type !== 'sell') return;
    units[o.itemId] = (units[o.itemId] || 0) + o.quantity;
    if (o.ownerId !== 'city') listed[o.itemId] = (listed[o.itemId] || 0) + o.quantity;
  });
  return ITEMS.map(i => ({ id: i.id, units: units[i.id] || 0, listed: listed[i.id] || 0, coverage: (units[i.id] || 0) / refDemand(i) }));
}
const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

function moneySupply(game) {
  const npcCash = Object.values(game.npcController.npcStates).reduce((s, st) => s + (st.capital || 0), 0);
  let locked = 0;
  game.offers.forEach(o => {
    if (o.status !== 'active') return;
    if (o.type === 'buy') locked += o.price * o.quantity;
    if (o.type === 'sell' && o.currentBid != null) locked += o.currentBid * o.quantity;
  });
  const vault = game.jobBoard?.feeVault || 0;
  const treasury = game.reserve?.treasury || 0;
  return { total: npcCash + locked + vault + treasury + game.player.money, npcCash, locked, vault, treasury };
}

function stock(game) {
  let npc = 0;
  Object.values(game.npcController.npcStates).forEach(st => st.inventory.forEach(sl => { npc += sl.quantity; }));
  let listed = 0;
  game.offers.forEach(o => { if (o.status === 'active' && o.type === 'sell') listed += o.quantity; });
  const reserve = game.reserve ? game.reserve.stockTotal() : 0;
  return { npc, listed, reserve, total: npc + listed };
}

function priceIndex(game, ITEMS) {
  const ratios = ITEMS.map(i => game.economy.getAveragePrice(i.id) / i.basePrice);
  const geo = Math.exp(avg(ratios.map(r => Math.log(Math.max(1e-6, r)))));
  return { mean: avg(ratios), geo, min: Math.min(...ratios), max: Math.max(...ratios) };
}

/**
 * @param {{days?:number, seeds?:number, seedBase?:number}} options
 * @returns {Promise<{summary:object, runs:Array}>}
 */
export async function runSimulation({ days = 120, seeds = 3, seedBase = 1000, bot = null } = {}) {
  const realNow = Date.now;
  const realRandom = Math.random;
  const hadStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const realStorage = globalThis.localStorage;
  const realConsoleWarn = console.warn;
  const mem = new Map();
  let virtualNow = Date.UTC(2026, 0, 1);

  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear()
  };
  Date.now = () => virtualNow;

  const t0 = realNow();
  const runs = [];
  let botLogs = [];
  try {
    const { Game } = await import('../js/core/Game.js');
    const { enhanceGame } = await import('../js/core/GamePatch.js');
    const { ITEMS } = await import('../js/data/items.js');
    const { createBot } = bot ? await import('./exploitBot.mjs') : {};
    const { resetOfferCounter } = await import('../js/models/Offer.js');
    const { resetTxCounter } = await import('../js/models/Transaction.js');

    for (let i = 0; i < seeds; i++) {
      const seed = seedBase + i * 7919;
      Math.random = mulberry32(seed);
      // Passe 3 : identifiants remis à zéro → une partie donne le même résultat quel que soit l'ordre des simulations
      resetOfferCounter();
      resetTxCounter();
      mem.clear();
      virtualNow = Date.UTC(2026, 0, 1);
      const game = new Game();
      game.timeManager.startTimestamp = virtualNow;
      game.timeManager._lastReal = virtualNow;
      game.startTimestamp = virtualNow;
      enhanceGame(game);
      // Matching immédiat (le jeu le diffère de 12 s réelles via setTimeout)
      game.npcController.runMatching = (offer) => {
        if (offer && offer.status === 'active') game.matchingEngine.match(offer, game.offers);
      };
      game.save = () => {};
      let txCount = 0;
      const handle = game._handleTransaction.bind(game);
      game._handleTransaction = (tx) => { txCount += 1; return handle(tx); };
      game.matchingEngine.onTransaction = (tx) => game._handleTransaction(tx);

      const series = [];
      const msPerDay = game.timeManager.msPerGameDay / game.timeManager.speed;
      let txBefore = 0;
      const shortSince = {};
      const shortByItem = {};
      const shortNoListing = {};
      const shortDurations = [];
      const start = { money: moneySupply(game), stock: stock(game), price: priceIndex(game, ITEMS) };
      const botPlayer = bot ? createBot(game, bot) : null;
      if (botPlayer) botLogs.push(botPlayer.log);

      for (let day = 1; day <= days; day++) {
        const end = virtualNow + msPerDay;
        // Le robot joue en milieu de journée (ou plusieurs fois par jour s'il le demande : actsPerDay)
        const acts = botPlayer?.actsPerDay || 1;
        let botActs = 0;
        while (virtualNow < end) {
          virtualNow += TICK_MS;
          game.tick();
          const slot = acts === 1 ? end - msPerDay / 2 : end - msPerDay + (msPerDay / acts) * (botActs + 0.5);
          if (botPlayer && botActs < acts && virtualNow >= slot) { botPlayer.act(day, botActs === acts - 1); botActs += 1; }
        }
        if (game.offers.length > 400) game.offers = game.offers.filter(o => o.status === 'active');
        if (game.transactions.length > 2000) game.transactions.length = 2000;
        const p = priceIndex(game, ITEMS);
        const m = moneySupply(game);
        const s = stock(game);
        // Opportunités pour un joueur : annonces au moins 10 % sous la valeur normale (ajustée Q/P)
        const sup = supplyByItem(game, ITEMS);
        let shortNow = 0;
        sup.forEach(x => {
          const short = x.listed === 0 || x.coverage < 1;
          if (short) {
            shortNow += 1;
            shortByItem[x.id] = (shortByItem[x.id] || 0) + 1;
            if (x.listed === 0) shortNoListing[x.id] = (shortNoListing[x.id] || 0) + 1;
            if (shortSince[x.id] == null) shortSince[x.id] = day;
          } else if (shortSince[x.id] != null) {
            shortDurations.push(day - shortSince[x.id]);
            delete shortSince[x.id];
          }
        });
        const covs = sup.map(x => x.coverage).sort((a, b) => a - b);
        const deals = game.offers.filter(o => {
          if (o.status !== 'active' || o.type !== 'sell') return false;
          const fair = game.economy.getFairValue(o.itemId);
          const adj = game.economy.applyConditionModifier(fair, o.quality, o.perfection);
          return (o.buyoutPrice ?? o.price) <= adj * 0.9;
        }).length;
        series.push({
          day,
          price: r3(p.mean),
          priceGeo: r3(p.geo),
          priceMin: r3(p.min),
          priceMax: r3(p.max),
          inflation: r3(game.economy.globalInflation),
          money: Math.round(m.total),
          npcCash: Math.round(m.npcCash),
          treasury: Math.round(m.treasury),
          stock: s.total,
          reserveStock: s.reserve,
          offers: game.offers.filter(o => o.status === 'active').length,
          deals,
          shortages: shortNow,
          coverageMedian: r3(covs[Math.floor(covs.length / 2)]),
          // Demande de la ville non servie (SupplyDemand) et rareté extrême
          unmet: game.supplyDemand ? Object.values(game.supplyDemand.items).reduce((t, it) => t + (it.unmet || 0), 0) : null,
          consumed: game.supplyDemand ? Object.values(game.supplyDemand.items).reduce((t, it) => t + (it.consumed || 0), 0) : null,
          cityShort: game.supplyDemand ? Object.keys(game.supplyDemand.items).filter(id => game.supplyDemand.getView(id).status === 'shortage').length : null,
          scarcityMin: game.economy.scarcity ? r3(Math.min(1, ...Object.values(game.economy.scarcity))) : 1,
          scarcityMax: game.economy.scarcity ? r3(Math.max(1, ...Object.values(game.economy.scarcity))) : 1,
          tx: txCount - txBefore
        });
        txBefore = txCount;
      }
      Object.values(shortSince).forEach(since => shortDurations.push(days + 1 - since));
      // IA des marchands (v6) : bilans, prudence, objectifs du jour, rivalités
      const minds = Object.values(game.npcController.npcStates).map(st => st.mind).filter(Boolean);
      const npcMind = {
        pnlPositive: minds.filter(m => m.pnl.reduce((t, v) => t + v, 0) > 0).length,
        pnlNegative: minds.filter(m => m.pnl.reduce((t, v) => t + v, 0) < 0).length,
        cautious: minds.filter(m => m.caution > 0.12).length,
        rivals: minds.filter(m => Object.values(m.rivals).some(v => v >= 2)).length,
        goals: minds.reduce((acc, m) => { const g = m.goal?.id || 'none'; acc[g] = (acc[g] || 0) + 1; return acc; }, {})
      };
      runs.push({ seed, start, series, npcMind, shortDurations, shortByItem, shortNoListing, cityResolved: game.supplyDemand ? [...game.supplyDemand.resolved] : null, reserveStats: game.reserve ? { ...game.reserve.stats } : null, creditStats: game.credit ? { ...game.credit.stats } : null });
    }
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
    console.warn = realConsoleWarn;
    if (hadStorage) globalThis.localStorage = realStorage;
    else delete globalThis.localStorage;
  }

  const summary = summarize(runs, days, seeds, realNow() - t0);
  if (bot) {
    const { summarizeBot } = await import('./exploitBot.mjs');
    summary.bot = summarizeBot(botLogs);
  }
  return { summary, runs };
}

export function summarize(runs, days, seeds, elapsedMs) {
  const last = runs.map(r => r.series[r.series.length - 1]);
  const allPrices = runs.flatMap(r => r.series.map(p => p.price));
  const late = runs.flatMap(r => r.series.slice(Math.floor(r.series.length / 2)).map(p => p.price));
  const tx = runs.flatMap(r => r.series.map(p => p.tx));
  const moneyRatios = runs.flatMap(r => r.series.map(p => p.money / r.start.money.total));
  return {
    days,
    seeds,
    priceStart: 1,
    npcMind: runs[0]?.npcMind ? {
      pnlPositive: r3(avg(runs.map(r => r.npcMind.pnlPositive))),
      pnlNegative: r3(avg(runs.map(r => r.npcMind.pnlNegative))),
      cautious: r3(avg(runs.map(r => r.npcMind.cautious))),
      withRival: r3(avg(runs.map(r => r.npcMind.rivals))),
      goals: runs.reduce((acc, r) => { Object.entries(r.npcMind.goals).forEach(([g, n]) => { acc[g] = (acc[g] || 0) + n; }); return acc; }, {})
    } : null,
    priceEnd: r3(avg(last.map(l => l.price))),
    priceEndMax: r3(Math.max(...last.map(l => l.priceMax))),
    priceEndMin: r3(Math.min(...last.map(l => l.priceMin))),
    pricePeak: r3(Math.max(...allPrices)),
    priceLow: r3(Math.min(...allPrices)),
    priceLateBand: [r3(Math.min(...late)), r3(Math.max(...late))],
    moneyStart: Math.round(avg(runs.map(r => r.start.money.total))),
    moneyEnd: Math.round(avg(last.map(l => l.money))),
    moneyBand: [r3(Math.min(...moneyRatios)), r3(Math.max(...moneyRatios))],
    stockStart: Math.round(avg(runs.map(r => r.start.stock.total))),
    stockEnd: Math.round(avg(last.map(l => l.stock))),
    txPerDay: Math.round(avg(tx) * 10) / 10,
    zeroTxDays: tx.filter(v => v === 0).length,
    offersEnd: Math.round(avg(last.map(l => l.offers))),
    dealsPerDay: Math.round(avg(runs.flatMap(r => r.series.map(p => p.deals ?? 0))) * 10) / 10,
    shortagesPerDay: Math.round(avg(runs.flatMap(r => r.series.map(p => p.shortages ?? 0))) * 10) / 10,
    shortageDays: Math.round(avg(runs.flatMap(r => r.shortDurations || [])) * 10) / 10,
    shortageLongest: Math.max(0, ...runs.flatMap(r => r.shortDurations || [])),
    coverageMedian: Math.round(avg(runs.flatMap(r => r.series.map(p => p.coverageMedian ?? 0))) * 10) / 10,
    cityConsumedPerDay: runs[0]?.series[0]?.consumed == null ? null : Math.round(avg(runs.flatMap(r => r.series.map(p => p.consumed || 0))) * 10) / 10,
    cityUnmetPerDay: runs[0]?.series[0]?.unmet == null ? null : Math.round(avg(runs.flatMap(r => r.series.map(p => p.unmet || 0))) * 10) / 10,
    cityShortagesPerDay: runs[0]?.series[0]?.cityShort == null ? null : Math.round(avg(runs.flatMap(r => r.series.map(p => p.cityShort || 0))) * 10) / 10,
    cityShortageResolveDays: runs[0]?.cityResolved == null ? null : Math.round(avg(runs.flatMap(r => r.cityResolved)) * 10) / 10,
    scarcityBand: [r3(Math.min(...runs.flatMap(r => r.series.map(p => p.scarcityMin ?? 1)))), r3(Math.max(...runs.flatMap(r => r.series.map(p => p.scarcityMax ?? 1))))],
    elapsedMs
  };
}

/**
 * Analyse GD passe 3 : récapitulatif par robot, au format CSV, pour comparer les passes.
 * Une ligne par robot (et « aucun » = PNJ seuls) : €/jour en début et fin de partie, gain total,
 * subventions et interventions du Comptoir (moyenne par partie), pénuries, masse monétaire.
 */
export async function botSummaryCsv({ days = 120, seeds = 3, bots = ['none', 'honest', 'haggler', 'trader', 'trader_no_loan', 'exploit', 'defaulter'] } = {}) {
  const head = ['bot', 'days', 'seeds', 'eur_per_day', 'eur_per_day_early', 'eur_per_day_late', 'worth_start', 'worth_end', 'haggle_deals_per_day', 'loans', 'contracts', 'subsidies', 'interventions', 'interventions_per_day', 'procurement_orders_per_day', 'public_orders_per_day', 'shortages_per_day', 'shortage_longest', 'price_end', 'money_min', 'money_max', 'trader_no_loan'];
  const lines = [head.join(',')];
  const num = (v) => (v == null || Number.isNaN(v) ? '' : String(v));
  // Passe 5 : « trader_no_loan » = même trader (4 actions/jour) sans aucun prêt ; colonne trader_no_loan sur la ligne trader
  const noLoanGain = {};
  const prevParams = globalThis.__BOT_PARAMS;
  for (const bot of bots) {
    const mode = bot === 'none' ? null : bot === 'trader_no_loan' ? 'trader' : bot;
    globalThis.__BOT_PARAMS = bot === 'trader_no_loan' ? { ...(prevParams || {}), traderMaxLoans: 0 } : prevParams;
    let sim;
    try { sim = await runSimulation({ days, seeds, bot: mode }); } finally { globalThis.__BOT_PARAMS = prevParams; }
    const { summary, runs } = sim;
    if (bot === 'trader_no_loan' && summary.bot) noLoanGain.v = r2c((summary.bot.worthEnd - summary.bot.worthStart) / days);
    const b = summary.bot;
    const rs = runs.map(r => r.reserveStats || {});
    const avgOf = (k) => Math.round(rs.reduce((t, x) => t + (x[k] || 0), 0) / Math.max(1, rs.length));
    const avgRaw = (k) => rs.reduce((t, x) => t + (x[k] || 0), 0) / Math.max(1, rs.length);
    const contracts = b ? r2c(b.diag.reduce((t, d) => t + (d.contracts || 0), 0) / Math.max(1, b.diag.length)) : '';
    lines.push([
      bot, days, seeds,
      b ? r2c((b.worthEnd - b.worthStart) / days) : '', b ? b.gainPerDayEarly : '', b ? b.gainPerDayLate : '',
      b ? b.worthStart : '', b ? b.worthEnd : '', b ? b.haggleDealsPerDay : '', b ? b.loans : '', contracts,
      avgOf('subsidies'), avgOf('interventions'), r2c(avgRaw('regulations') / days), r2c(avgRaw('procureOrders') / days), r2c((avgRaw('procureOrders') + avgRaw('publicOrders')) / days), summary.shortagesPerDay, summary.shortageLongest, summary.priceEnd,
      summary.moneyBand[0], summary.moneyBand[1], ''
    ].map(num).join(','));
  }
  // la ligne trader porte le €/jour du trader sans prêt (calculé après)
  const iT = bots.indexOf('trader');
  if (iT >= 0 && noLoanGain.v != null) lines[iT + 1] = lines[iT + 1].replace(/,$/, ',' + noLoanGain.v);
  if (bots.includes('trader_no_loan')) { const iN = bots.indexOf('trader_no_loan'); lines[iN + 1] = lines[iN + 1].replace(/,$/, ',' + noLoanGain.v); }
  return lines.join('\n') + '\n';
}
function r2c(n) { return Math.round(n * 100) / 100; }
