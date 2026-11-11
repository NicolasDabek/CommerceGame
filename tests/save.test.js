import { assert, assertEqual, runSuite } from './assert.js';
import { installMemoryStorage, makeGame } from './helpers.js';

/** 1.0.0 : format de sauvegarde versionné, migration des sauvegardes 0.x, sauvegarde illisible mise de côté. */
export function run() {
  return runSuite('sauvegarde versionnée (1.0.0)', [
    ['version du jeu et du format exposées ; package.json à la même version', async () => {
      const { GAME_VERSION, SAVE_VERSION } = await import('../js/version.js');
      const { readFileSync } = await import('node:fs');
      const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
      assertEqual(GAME_VERSION, pkg.version, 'js/version.js = package.json');
      assert(/^\d+\.\d+\.\d+$/.test(GAME_VERSION), `version sémantique ${GAME_VERSION}`);
      assert(Number.isInteger(SAVE_VERSION) && SAVE_VERSION >= 1, `format ${SAVE_VERSION}`);
      const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
      assert(changelog.includes(`## [${GAME_VERSION}]`), 'CHANGELOG : section de la version courante');
    }],
    ['une partie sauvegardée porte saveVersion / gameVersion et se recharge à l\'identique', async () => {
      const { SAVE_VERSION, GAME_VERSION } = await import('../js/version.js');
      const { Storage } = await import('../js/utils/storage.js');
      const { Game } = await import('../js/core/Game.js');
      const { enhanceGame } = await import('../js/core/GamePatch.js');
      const { game, restore } = await makeGame({ reputation: 20 });
      try {
        game.player.money = 1234.56;
        game.save();
        const raw = JSON.parse(localStorage.getItem('commerce_tycoon_save'));
        assertEqual(raw.saveVersion, SAVE_VERSION, 'saveVersion');
        assertEqual(raw.gameVersion, GAME_VERSION, 'gameVersion');
        assert(raw.npcRequests && raw.credit && raw.career && raw.jobs, 'sous-systèmes sauvegardés');
        const g2 = new Game();
        assert(g2.load(), 'rechargement');
        enhanceGame(g2);
        assertEqual(g2.player.money, 1234.56, 'argent');
        assertEqual(g2.player.reputation, 20, 'réputation');
        assertEqual(g2.saveMigratedFrom, null, 'aucune migration');
        assertEqual(Storage.load().saveVersion, SAVE_VERSION, 'format courant');
      } finally { restore(); }
    }],
    ['migration 0 → 1 : sauvegarde 0.x (sans saveVersion), joueur plat + inventaire séparé, champs manquants', async () => {
      const { migrateSave } = await import('../js/core/game/saveMigration.js');
      const { SAVE_VERSION } = await import('../js/version.js');
      const old = { player: { money: 321, reputation: 9, name: 'Ancien' }, inventory: { size: 12, items: [{ itemId: 'item_004', quantity: 2, quality: 50, perfection: 50 }] }, currentDay: 7, credit: 'cassé' };
      const { data, from, migrated, newer } = migrateSave(old);
      assertEqual(from, 0, 'format 0');
      assert(migrated && !newer, 'migrée');
      assertEqual(data.saveVersion, SAVE_VERSION, 'format courant');
      assertEqual(data.player.inventory.size, 12, 'inventaire rattaché au joueur');
      assert(data.inventory === undefined && Array.isArray(data.offers) && Array.isArray(data.transactions) && Array.isArray(data.completedGoals), 'champs normalisés');
      assert(data.credit === undefined, 'sous-système invalide ignoré');
      assertEqual(old.saveVersion, undefined, 'l\'original n\'est pas modifié');
      assertEqual(migrateSave(data).migrated, false, 'idempotente');
    }],
    ['sauvegarde 0.x réelle (GD 11, sans saveVersion) : chargée, migrée, copie de secours, puis réécrite au format 1', async () => {
      const { Game } = await import('../js/core/Game.js');
      const { enhanceGame } = await import('../js/core/GamePatch.js');
      const { game, restore } = await makeGame({ reputation: 20 });
      try {
        game.player.money = 777;
        game.save();
        const raw = JSON.parse(localStorage.getItem('commerce_tycoon_save'));
        delete raw.saveVersion; delete raw.gameVersion;
        localStorage.setItem('commerce_tycoon_save', JSON.stringify(raw));
        const g2 = new Game();
        assert(g2.load(), 'chargée');
        enhanceGame(g2);
        assertEqual(g2.saveMigratedFrom, 0, 'migrée depuis le format 0');
        assertEqual(g2.player.money, 777, 'argent conservé');
        assert(localStorage.getItem('commerce_tycoon_save_backup'), 'copie de secours');
        g2.save();
        assertEqual(JSON.parse(localStorage.getItem('commerce_tycoon_save')).saveVersion, 1, 'réécrite au format 1');
      } finally { restore(); }
    }],
    ['joueur « plat » des premières versions : chargé par Game.load', async () => {
      const restore = installMemoryStorage();
      try {
        localStorage.setItem('commerce_tycoon_save', JSON.stringify({ player: { money: 55, reputation: 3 }, inventory: { size: 10, items: [{ itemId: 'item_004', quantity: 1, quality: 50, perfection: 50 }] }, currentDay: 3 }));
        const { Game } = await import('../js/core/Game.js');
        const { enhanceGame } = await import('../js/core/GamePatch.js');
        const g = new Game();
        assert(g.load(), 'chargée');
        enhanceGame(g);
        assertEqual(g.player.money, 55, 'argent');
        assertEqual(g.player.inventory.count('item_004'), 1, 'inventaire');
        assertEqual(g.currentDay, 3, 'jour');
      } finally { restore(); }
    }],
    ['sauvegarde illisible : mise de côté (pas perdue), nouvelle partie ; version future : chargée au mieux + copie', async () => {
      const restore = installMemoryStorage();
      try {
        const { Storage } = await import('../js/utils/storage.js');
        const warn = console.warn; console.warn = () => {};
        try {
          localStorage.setItem('commerce_tycoon_save', '{pas du json');
          assertEqual(Storage.load(), null, 'illisible → null');
        } finally { console.warn = warn; }
        assertEqual(localStorage.getItem('commerce_tycoon_save_corrupt'), '{pas du json', 'copie conservée');
        assertEqual(localStorage.getItem('commerce_tycoon_save'), null, 'clé libérée');
        localStorage.setItem('commerce_tycoon_save', JSON.stringify({ saveVersion: 99, player: { money: 1, inventory: { size: 10, items: [] } } }));
        const d = Storage.load();
        assert(d && d.__newer && d.saveVersion === 99, 'version future signalée');
        assert(localStorage.getItem('commerce_tycoon_save_backup'), 'copie de secours');
      } finally { restore(); }
    }],
    ['« Effacer la sauvegarde » n\'efface que les clés de ce jeu (origine partagée)', async () => {
      const restore = installMemoryStorage();
      try {
        const { Storage, GAME_KEYS } = await import('../js/utils/storage.js');
        for (const k of GAME_KEYS) localStorage.setItem(k, 'x');
        localStorage.setItem('autre_jeu_save', 'garde-moi');
        Storage.clearAll();
        for (const k of GAME_KEYS) assertEqual(localStorage.getItem(k), null, `${k} effacée`);
        assertEqual(localStorage.getItem('autre_jeu_save'), 'garde-moi', 'autre jeu intact');
      } finally { restore(); }
    }]
  ]);
}
