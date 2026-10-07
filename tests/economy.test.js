import { Economy, ECONOMY_TUNING } from '../js/core/Economy.js';
import { getItemById } from '../js/data/items.js';
import { assert, assertEqual, runSuite } from './assert.js';

const near = (a, b, tol) => Math.abs(a - b) <= tol;

export function run() {
  return runSuite('economy', [
    ['evenement revert', () => {
      const eco = new Economy();
      const before = eco.categoryModifiers['Électronique'];
      const event = { id: 'test', name: 'Test', category: 'Électronique', modifier: 1.25, expiresAt: 10 };
      eco._applyEvent(event);
      eco.activeEvents.push(event);
      eco.expireEvents(11);
      const after = Math.round(eco.categoryModifiers['Électronique'] * 1000) / 1000;
      assertEqual(after, before);
      assertEqual(eco.activeEvents.length, 0);
    }],
    ['historique cap', () => {
      const eco = new Economy();
      for (let i = 0; i < 120; i++) eco.recordTransaction('item_001', 100 + i, i);
      assert(eco.priceHistory.item_001.length <= 80);
    }],
    ['pas de dérive quand on vend au prix affiché (tendance +30 %)', () => {
      const eco = new Economy();
      eco.categoryModifiers['Électronique'] = 1.3;
      const base = getItemById('item_001').basePrice;
      // Avant la v2, chaque vente au prix affiché (base × 1,3) faisait monter la base de 30 % → emballement.
      for (let i = 0; i < 200; i++) eco.recordTransaction('item_001', eco.getAveragePrice('item_001'), i);
      assert(near(eco.averagePrices.item_001, base, base * 0.02), `base stable (${eco.averagePrices.item_001})`);
    }],
    ['la qualité ne déplace pas le prix moyen', () => {
      const eco = new Economy();
      const base = getItemById('item_004').basePrice;
      const premium = eco.applyConditionModifier(base, 95, 95);
      for (let i = 0; i < 100; i++) eco.recordTransaction('item_004', premium, i, { quality: 95, perfection: 95 });
      assert(near(eco.averagePrices.item_004, base, 0.2), `prix moyen ${eco.averagePrices.item_004}`);
    }],
    ['une vente absurde est amortie', () => {
      const eco = new Economy();
      const base = getItemById('item_002').basePrice;
      eco.recordTransaction('item_002', base * 50, 1);
      const max = base * (1 - ECONOMY_TUNING.emaWeight) + base * ECONOMY_TUNING.outlierHigh * ECONOMY_TUNING.emaWeight;
      assert(eco.averagePrices.item_002 <= max + 0.01, `plafonné (${eco.averagePrices.item_002})`);
      eco.recordTransaction('item_002', 0.01, 2);
      assert(eco.averagePrices.item_002 > base * 0.8, 'pas d\'effondrement');
    }],
    ['rappel quotidien vers la valeur normale', () => {
      const eco = new Economy();
      const base = getItemById('item_001').basePrice;
      eco.averagePrices.item_001 = base * 2;
      let previous = eco.averagePrices.item_001;
      for (let d = 0; d < 30; d++) {
        eco.applyMeanReversion();
        assert(eco.averagePrices.item_001 <= previous, 'baisse monotone');
        previous = eco.averagePrices.item_001;
      }
      assert(eco.averagePrices.item_001 < base * 1.3, `revenu près de la base (${eco.averagePrices.item_001})`);
    }],
    ['tendances et inflation restent bornées', () => {
      const eco = new Economy();
      eco.clock = () => 0;
      for (let d = 0; d < 500; d++) eco.tickDaily(d);
      assert(eco.globalInflation >= ECONOMY_TUNING.inflationMin && eco.globalInflation <= ECONOMY_TUNING.inflationMax, 'inflation bornée');
      Object.values(eco.categoryModifiers).forEach(m => {
        assert(m >= ECONOMY_TUNING.categoryMin && m <= ECONOMY_TUNING.categoryMax, `tendance ${m}`);
      });
    }],
    ['les événements ne sont pas « cuits » et s\'expliquent', () => {
      const eco = new Economy();
      let now = 1000;
      eco.clock = () => now;
      const before = eco.getAveragePrice('item_001');
      eco.activeEvents.push({ id: 'x', name: 'Pénurie de composants', category: 'Électronique', modifier: 1.25, expiresAt: 5000 });
      assert(near(eco.getAveragePrice('item_001'), before * 1.25, 0.05), 'prix affiché majoré');
      assertEqual(eco.categoryModifiers['Électronique'], 1.0);
      const why = eco.explainPrice('item_001');
      assert(why.factors.some(f => f.label === 'Pénurie de composants' && f.pct === 25), 'facteur expliqué');
      assert(/Pénurie/.test(why.summary), 'résumé lisible');
      now = 6000;
      assert(near(eco.getAveragePrice('item_001'), before, 0.01), 'retour au prix après expiration');
    }],
    ['migration des anciennes sauvegardes (v1)', () => {
      const eco = Economy.fromJSON({
        averagePrices: { item_001: 180 * 40 },
        categoryModifiers: { 'Électronique': 1.25 },
        globalInflation: 1.0,
        activeEvents: [{ id: 'x', name: 'Pénurie', category: 'Électronique', modifier: 1.25, expiresAt: Date.now() + 1e9 }]
      });
      assert(near(eco.categoryModifiers['Électronique'], 1.0, 0.001), 'événement retiré de la tendance');
      assert(eco.averagePrices.item_001 <= 180 * ECONOMY_TUNING.hardBandHigh, 'prix emballé ramené dans la bande');
      assertEqual(eco.version, 2);
    }],
    ['instantanés limités à 60 jours', () => {
      const eco = new Economy();
      for (let d = 0; d < 90; d++) eco.recordSnapshot({ day: d, priceIndex: 1 });
      assertEqual(eco.snapshots.length, 60);
      assertEqual(eco.snapshots[0].day, 30);
      assert(near(eco.getPriceLevel(), 1, 0.001), 'niveau des prix = 1 au départ');
    }]
  ]);
}
