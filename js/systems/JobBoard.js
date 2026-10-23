
// Compatibilité : ces tables restent importables depuis JobBoard.js
export { PROFESSION_LEVELS, PLAYER_PROFESSIONS, professionLevel, REPAIR_TUNING } from '../data/jobs.js';
import { PROFESSION_LEVELS, PLAYER_PROFESSIONS, professionLevel, REPAIR_TUNING } from '../data/jobs.js';
import { mixin } from '../utils/mixin.js';
import { JobProfessions } from './jobs/professions.js';
import { JobContracts } from './jobs/contracts.js';
import { JobServices } from './jobs/services.js';
import { JobWorkshop } from './jobs/workshop.js';
import { JobRepair } from './jobs/repair.js';
import { JobView } from './jobs/view.js';

export class JobBoard {
  constructor(game, saved = {}) {
    this.game = game;
    this.feeVault = saved.feeVault ?? 40;
    this.contracts = saved.contracts || [];
    this.generatedDay = saved.generatedDay || 0;
    this.scavengeUsedToday = saved.scavengeUsedToday || 0;
    this.stallUsedToday = saved.stallUsedToday || 0;
    this.craftsUsedToday = saved.craftsUsedToday || 0;
    this.repairsUsedToday = saved.repairsUsedToday || 0;
    this.salvageUsedToday = saved.salvageUsedToday || 0;
    this.servicesUsedToday = saved.servicesUsedToday || 0;
    this.services = saved.services || [];
    this.maxScavengePerDay = 4;
    this.maxStallPerDay = 3;
    this.maxCraftsPerDay = 6;
    this.maxRepairsPerDay = 4;
    this.maxSalvagePerDay = 4;
    this.maxServicesPerDay = 4;
    this.streak = saved.streak || 0;
    this.lastActiveDay = saved.lastActiveDay || 0;
    this.stats = saved.stats || { scavenges: 0, contracts: 0, crafts: 0, stalls: 0, repairs: 0, services: 0, salvages: 0, earned: 0 };
    this.lastLoot = saved.lastLoot || null;
    this.lastCraft = saved.lastCraft || null;
    // Métiers : anciennes sauvegardes → expérience reconstituée depuis les statistiques
    this.professions = saved.professions || {
      repair: { xp: (this.stats.repairs || 0) * 10 },
      craft: { xp: (this.stats.crafts || 0) * 12 },
      trade: { xp: (this.stats.contracts || 0) * 15 }
    };
    ['repair', 'craft', 'trade'].forEach(k => { if (!this.professions[k]) this.professions[k] = { xp: 0 }; });
    /** Objets en cours de réparation sur l'établi */
    this.bench = saved.bench || [];
    /** Commandes des marchands (PNJ) */
    this.npcOrders = saved.npcOrders || [];
    this.lastLevelUp = saved.lastLevelUp || null;
  }

  toJSON() {
    return {
      feeVault: this.feeVault,
      contracts: this.contracts,
      generatedDay: this.generatedDay,
      scavengeUsedToday: this.scavengeUsedToday,
      stallUsedToday: this.stallUsedToday,
      craftsUsedToday: this.craftsUsedToday,
      repairsUsedToday: this.repairsUsedToday,
      salvageUsedToday: this.salvageUsedToday,
      servicesUsedToday: this.servicesUsedToday,
      services: this.services,
      streak: this.streak,
      lastActiveDay: this.lastActiveDay,
      stats: this.stats,
      lastLoot: this.lastLoot,
      lastCraft: this.lastCraft,
      professions: this.professions,
      bench: this.bench,
      npcOrders: this.npcOrders,
      lastLevelUp: this.lastLevelUp
    };
  }
}

// Méthodes réparties dans des sous-modules (même prototype, aucun changement de comportement)
mixin(JobBoard, JobProfessions, JobContracts, JobServices, JobWorkshop, JobRepair, JobView);
