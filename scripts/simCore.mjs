/**
 * Cœur de la simulation headless de l'économie (PNJ seuls, sans navigateur ni réseau).
 * Utilisé par `npm run sim` (scripts/sim.mjs) et par le test de stabilité (tests/stability.test.js).
 *
 * L'environnement est simulé le temps du calcul puis restauré :
 *  - localStorage en mémoire, horloge virtuelle (Date.now), hasard déterministe (Math.random).
 */

const TICK_MS = 8000; // même cadence que main.js

function mulberry32(seed) {
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
export async function runSimulation({ days = 120, seeds = 3, seedBase = 1000 } = {}) {
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
  try {
    const { Game } = await import('../js/core/Game.js');
    const { enhanceGame } = await import('../js/core/GamePatch.js');
    const { ITEMS } = await import('../js/data/items.js');

    for (let i = 0; i < seeds; i++) {
      const seed = seedBase + i * 7919;
      Math.random = mulberry32(seed);
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
      const start = { money: moneySupply(game), stock: stock(game), price: priceIndex(game, ITEMS) };

      for (let day = 1; day <= days; day++) {
        const end = virtualNow + msPerDay;
        while (virtualNow < end) {
          virtualNow += TICK_MS;
          game.tick();
        }
        if (game.offers.length > 400) game.offers = game.offers.filter(o => o.status === 'active');
        if (game.transactions.length > 2000) game.transactions.length = 2000;
        const p = priceIndex(game, ITEMS);
        const m = moneySupply(game);
        const s = stock(game);
        // Opportunités pour un joueur : annonces au moins 10 % sous la valeur normale (ajustée Q/P)
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
          tx: txCount - txBefore
        });
        txBefore = txCount;
      }
      runs.push({ seed, start, series, reserveStats: game.reserve ? { ...game.reserve.stats } : null });
    }
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
    console.warn = realConsoleWarn;
    if (hadStorage) globalThis.localStorage = realStorage;
    else delete globalThis.localStorage;
  }

  return { summary: summarize(runs, days, seeds, realNow() - t0), runs };
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
    elapsedMs
  };
}
