import { NPCS } from '../js/data/npcs.js';
import { dailyReview, ensureMind, scoreBumps, noteAction, noteRival, isPersonalRival, markSold, blocksBuyBack, MIND_TUNING, GOALS } from '../js/systems/NpcMind.js';
import { assert, assertEqual, runSuite } from './assert.js';
import { makeGame } from './helpers.js';

export function run() {
  return runSuite('ia-pnj-v6', [
    ['objectif du jour : trésorerie basse → « Faire de la trésorerie », bonus de vente', async () => {
      const { game, restore } = await makeGame();
      try {
        const ctl = game.npcController;
        const npc = NPCS[0];
        const st = ctl.npcStates[npc.id];
        st.capital = npc.capital * 0.2;
        dailyReview(ctl, npc, st, 2);
        assertEqual(st.mind.goal.id, 'cash');
        assert(scoreBumps(st).fulfill >= GOALS.cash.bumps.fulfill, 'bonus vente aux offres');
        st.capital = npc.capital * 2; st.inventory = st.inventory.slice(0, 1);
        dailyReview(ctl, npc, st, 3);
        assert(['hunt', 'restock', 'supply'].includes(st.mind.goal.id), `objectif ${st.mind.goal.id}`);
        assert(st.mind.goal.reason.length > 5, 'raison lisible');
      } finally { restore(); }
    }],
    ['apprentissage borné : gains répétés en vendant → plus de ventes, plafonné', async () => {
      const { game, restore } = await makeGame();
      try {
        const ctl = game.npcController;
        const npc = NPCS[1];
        const st = ctl.npcStates[npc.id];
        dailyReview(ctl, npc, st, 1);
        for (let d = 2; d < 40; d++) {
          noteAction(st, 'sell'); noteAction(st, 'sell');
          st.capital += npc.capital * 0.05; // la journée a rapporté
          dailyReview(ctl, npc, st, d);
        }
        assert(st.mind.learn.sell > 0.05, `appris ${st.mind.learn.sell}`);
        assert(st.mind.learn.sell <= MIND_TUNING.learnMax + 1e-9, 'plafonné');
        assert(st.mind.pnl.length <= MIND_TUNING.historyDays, 'historique 7 jours');
      } finally { restore(); }
    }],
    ['pertes répétées → prudence : prix max d\'achat réduit d\'au plus 1,8 %', async () => {
      const { game, restore } = await makeGame();
      try {
        const ctl = game.npcController;
        const npc = NPCS[2];
        const st = ctl.npcStates[npc.id];
        const item = { id: 'item_004', category: 'x' };
        const before = ctl.maxBuyRatio(npc, st, item);
        dailyReview(ctl, npc, st, 1);
        for (let d = 2; d < 6; d++) { st.capital -= npc.capital * 0.2; dailyReview(ctl, npc, st, d); }
        assert(st.mind.caution > 0.1, `prudence ${st.mind.caution}`);
        const after = ctl.maxBuyRatio(npc, st, item);
        assert(after < before && before - after <= 0.0181, `${before} → ${after}`);
        assert(ctl.getAiSnapshot(npc.id).mind.cautious, 'affiché');
      } finally { restore(); }
    }],
    ['rivalités entre marchands : se souvient de qui le surenchérit, puis oublie', async () => {
      const { game, restore } = await makeGame();
      try {
        const ctl = game.npcController;
        const [a, b] = NPCS;
        const st = ctl.npcStates[a.id];
        noteRival(st, b.id); noteRival(st, b.id); noteRival(st, 'player');
        assert(isPersonalRival(st, b.id), 'rival');
        assertEqual(st.mind.rivals.player, undefined, 'le joueur n\'est pas compté ici');
        assertEqual(ctl.getAiSnapshot(a.id).mind.rivalName, b.name);
        for (let d = 2; d < 12; d++) dailyReview(ctl, a, st, d);
        assert(!isPersonalRival(st, b.id), 'rivalité estompée');
      } finally { restore(); }
    }],
    ['anti-boucle : ne rachète pas le jour même ce qu\'il vient de vendre', async () => {
      const { game, restore } = await makeGame();
      try {
        const ctl = game.npcController;
        const npc = NPCS[3];
        const st = ctl.npcStates[npc.id];
        markSold(st, 'item_004', 5);
        assert(blocksBuyBack(st, 'item_004', 5), 'bloqué le jour même');
        assert(!blocksBuyBack(st, 'item_004', 5, true), 'sauf pénurie');
        assert(!blocksBuyBack(st, 'item_004', 6), 'libre le lendemain');
        dailyReview(ctl, npc, st, 6);
        assertEqual(st.mind.soldDay.item_004, undefined, 'nettoyé');
      } finally { restore(); }
    }],
    ['réputation du joueur : la confiance des marchands tend vers un niveau plus haut', async () => {
      const { game, restore } = await makeGame();
      try {
        const ctl = game.npcController;
        const npc = NPCS[4];
        const st = ctl.npcStates[npc.id];
        st.trust = 0;
        game.player.reputation = 60;
        for (let d = 2; d < 60; d++) dailyReview(ctl, npc, st, d);
        assert(st.trust > 0.1 && st.trust <= MIND_TUNING.repTrustMax + 1e-9, `confiance ${st.trust}`);
      } finally { restore(); }
    }],
    ['sauvegarde : l\'esprit des marchands est conservé ; ancienne sauvegarde sans « mind » acceptée', async () => {
      const { game, restore } = await makeGame();
      try {
        const ctl = game.npcController;
        const npc = NPCS[5];
        const st = ctl.npcStates[npc.id];
        dailyReview(ctl, npc, st, 3);
        const copy = JSON.parse(JSON.stringify(ctl.npcStates));
        assertEqual(copy[npc.id].mind.goal.id, st.mind.goal.id);
        delete copy[npc.id].mind;
        ctl.npcStates = copy;
        const snap = ctl.getAiSnapshot(npc.id);
        assert(snap.mind && snap.mind.goal, 'reconstruit');
        ctl.tick(game.timeManager.now() + 1e6);
        ensureMind(ctl.npcStates[npc.id]);
      } finally { restore(); }
    }]
  ]);
}
