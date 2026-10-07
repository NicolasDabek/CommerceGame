import { SupplyDemand, SD_TUNING, seasonForDay, SEASONS } from '../js/core/SupplyDemand.js';
import { conditionMultiplier, conditionLabel, repairMaterials, isRepairable } from '../js/core/condition.js';
import { assert, assertEqual, runSuite } from './assert.js';
import { makeGame, drainItem } from './helpers.js';

export function run() {
  return runSuite('offre-demande', [
    ['état des objets : Q50/P50 = valeur normale, abîmé ≈ −35 %, excellent ≈ +20 %', () => {
      assertEqual(Math.round(conditionMultiplier(50, 50) * 1000), 1000, 'neutre');
      assert(conditionMultiplier(10, 30) < 0.7, 'abîmé nettement moins cher');
      assert(conditionMultiplier(90, 80) > 1.15, 'excellent plus cher');
      assertEqual(conditionLabel(20).label, 'Abîmé');
      assertEqual(conditionLabel(85).label, 'Excellent état');
      assert(isRepairable('item_001') && !isRepairable('item_004'), 'électronique oui, café non');
      assertEqual(repairMaterials('item_001', 15, 'quick').itemId, 'item_010', 'petite réparation = cuivre');
      assertEqual(repairMaterials('item_003', 70, 'refurbish').itemId, 'item_011', 'remise à neuf laptop = composants');
      assertEqual(repairMaterials('item_006', 40, 'refurbish'), null, 'vêtements : fournitures seulement');
    }],
    ['saisons de 7 jours et demande saisonnière', () => {
      assertEqual(seasonForDay(1).id, 'printemps');
      assertEqual(seasonForDay(8).id, 'ete');
      assertEqual(seasonForDay(22).id, 'hiver');
      assertEqual(seasonForDay(29).id, 'printemps', 'cycle de 28 jours');
      const sd = new SupplyDemand();
      assert(sd.dailyDemand('item_006', 22) > sd.dailyDemand('item_006', 8) * 1.3, 'vestes : hiver > été');
      assertEqual(SEASONS.length, 4);
    }],
    ['stock vide → pénurie et prix en hausse ; stock abondant → surplus et prix en baisse', async () => {
      const { game, restore } = await makeGame();
      try {
        drainItem(game, 'item_004');
        for (let d = 2; d < 6; d++) game.supplyDemand.update(game, d);
        const short = game.getSupplyView('item_004');
        assertEqual(short.status, 'shortage', 'pénurie');
        assert(short.unmet > 0, 'demande non servie');
        assert(game.economy.scarcity.item_004 > 1.05, `rareté ${game.economy.scarcity.item_004}`);
        const fairShort = game.economy.getFairValue('item_004');

        game.npcController.giveItemToNpc('npc_05', 'item_004', 400, 60, 50);
        for (let d = 6; d < 16; d++) game.supplyDemand.update(game, d);
        const flood = game.getSupplyView('item_004');
        assertEqual(flood.status, 'surplus', 'surplus');
        assert(game.economy.scarcity.item_004 < 1, `rareté ${game.economy.scarcity.item_004}`);
        assert(game.economy.getFairValue('item_004') < fairShort, 'prix plus bas après réapprovisionnement');
        assert(game.economy.scarcity.item_004 >= SD_TUNING.scarcityMin, 'borne basse respectée');
        assert(game.supplyDemand.resolved.length >= 1, 'durée de pénurie enregistrée');
        const expl = game.economy.explainPrice('item_004');
        assert(expl.factors.some(f => f.kind === 'scarcity'), 'le facteur stock apparaît dans « pourquoi ce prix »');
      } finally { restore(); }
    }],
    ['la ville consomme le stock des marchands et rend des objets usés', async () => {
      const { game, restore } = await makeGame();
      try {
        const stock = () => Object.values(game.npcController.npcStates).reduce((t, s) => t + s.inventory.reduce((a, b) => a + b.quantity, 0), 0);
        const before = stock();
        for (let d = 2; d < 12; d++) game.supplyDemand.update(game, d);
        assert(game.supplyDemand.stats.consumed > 30, `consommé ${game.supplyDemand.stats.consumed}`);
        assert(stock() < before, 'le stock baisse');
        assert(game.supplyDemand.stats.worn > 0, 'des objets abîmés reviennent sur le marché');
        const damaged = Object.values(game.npcController.npcStates).some(s => s.inventory.some(sl => sl.quality < 35));
        assert(damaged, 'un marchand détient un objet abîmé');
      } finally { restore(); }
    }],
    ['achats du joueur mémorisés quelques jours (les PNJ réagissent)', () => {
      const sd = new SupplyDemand();
      sd.notePlayerTrade('item_001', 3, true);
      assertEqual(sd.getView('item_001').playerFlow, 3);
      assert(/vous achetez/.test(sd.getView('item_001').why), 'raison lisible');
      sd.playerFlow.item_001 = 0.25;
      sd.update({ economy: { eventMultiplier: () => 1, scarcity: {} }, npcController: { npcStates: {} }, offers: [], reserve: { stock: {} } }, 2);
      assertEqual(sd.playerFlow.item_001, undefined, 's\'efface avec le temps');
    }],
    ['sauvegarde : offre / demande et rareté conservées, anciennes sauvegardes migrées', async () => {
      const { game, restore } = await makeGame();
      try {
        drainItem(game, 'item_002');
        game.supplyDemand.update(game, 2);
        game.supplyDemand.notePlayerTrade('item_002', 2, true);
        game.save();
        const { Game } = await import('../js/core/Game.js');
        const g2 = new Game();
        assert(g2.load(), 'chargé');
        assertEqual(g2.supplyDemand.playerFlow.item_002, 2);
        assertEqual(g2.economy.scarcity.item_002, game.economy.scarcity.item_002);
        // Ancienne sauvegarde : pas de supplyDemand ni de scarcity
        const raw = JSON.parse(localStorage.getItem('commerce_tycoon_save'));
        delete raw.supplyDemand;
        delete raw.economy.scarcity;
        localStorage.setItem('commerce_tycoon_save', JSON.stringify(raw));
        const g3 = new Game();
        assert(g3.load(), 'ancienne sauvegarde chargée');
        assert(g3.getSupplyView('item_004').coverage != null, 'couverture recalculée');
        assertEqual(g3.economy.scarcity.item_004 ?? 1, 1, 'rareté neutre');
      } finally { restore(); }
    }]
  ]);
}
