/**
 * JobBoard — métiers du joueur : niveaux, expérience, avantages, caisse des contrats.
 * (méthodes de JobBoard, extraites de JobBoard.js sans changement de comportement)
 */

import { PLAYER_PROFESSIONS, PROFESSION_LEVELS, REPAIR_TUNING, professionLevel } from '../../data/jobs.js';

export const JobProfessions = {

  // ============================================
  // Métiers
  // ============================================
  level(prof) {
    return professionLevel(this.professions[prof]?.xp || 0);
  },


  /** Ancien « niveau d'atelier » = niveau du métier Artisan (recettes). */
  workshopLevel() {
    return this.level('craft');
  },


  gainXp(prof, amount) {
    const before = this.level(prof);
    this.professions[prof].xp = (this.professions[prof].xp || 0) + amount;
    const after = this.level(prof);
    if (after > before) {
      this.lastLevelUp = { prof, level: after, day: this._day() };
      const label = PLAYER_PROFESSIONS[prof]?.label || prof;
      this.game.uiCallbacks?.onStatus?.(`${PLAYER_PROFESSIONS[prof]?.icon || ''} ${label} : niveau ${after} atteint !`);
    }
    return after > before;
  },


  benchSlots() {
    const lvl = this.level('repair');
    return 1 + (lvl >= 3 ? 1 : 0) + (lvl >= 5 ? 1 : 0);
  },


  maxRepairsToday() {
    return this.maxRepairsPerDay + this.level('repair') - 1;
  },


  contractPremium() {
    return (this.level('trade') - 1) * 0.04;
  },


  /** Avantages lisibles de chaque métier, pour l'interface. */
  perks(prof, level = this.level(prof)) {
    const e = (n) => `${Math.round(n * 100)} %`;
    if (prof === 'repair') {
      return [
        `Fournitures −${e((level - 1) * REPAIR_TUNING.discountPerLevel)}, temps −${e((level - 1) * REPAIR_TUNING.speedPerLevel)}`,
        `${this.benchSlots()} place(s) sur l'établi · ${this.maxRepairsToday()} réparations / jour`,
        `Remise à neuf jusqu'à Q${Math.min(95, REPAIR_TUNING.refurbishBase + 2 * level)}`,
        level >= REPAIR_TUNING.epicLevel ? 'Répare les objets épiques' : level >= REPAIR_TUNING.rareLevel ? `Rares OK · épiques au niv. ${REPAIR_TUNING.epicLevel}` : `Objets rares au niv. ${REPAIR_TUNING.rareLevel}`
      ];
    }
    if (prof === 'craft') {
      return [
        `Qualité des fabrications +${(level - 1) * 3}`,
        level >= 3 ? 'Toutes les recettes débloquées' : `Nouvelles recettes au niv. ${level + 1}`
      ];
    }
    return [
      `Prime des contrats +${e(this.contractPremium())}`,
      `${this.contractCount()} contrats / jour · ${this.standingOrderSlots()} ordres permanents`
    ];
  },


  contractCount() {
    return 3 + (this.level('trade') >= 3 ? 1 : 0);
  },


  standingOrderSlots() {
    return 2 + Math.floor(this.level('trade') / 2);
  },


  getProfessionsView() {
    return Object.values(PLAYER_PROFESSIONS).map(def => {
      const xp = this.professions[def.id]?.xp || 0;
      const level = professionLevel(xp);
      const cur = PROFESSION_LEVELS[level - 1];
      const next = PROFESSION_LEVELS[level] ?? null;
      return {
        ...def,
        xp,
        level,
        nextXp: next,
        progress: next == null ? 1 : (xp - cur) / (next - cur),
        perks: this.perks(def.id, level)
      };
    });
  },


  depositFee(amount) {
    const n = Number(amount) || 0;
    if (n <= 0) return;
    this.feeVault = Math.round((this.feeVault + n) * 100) / 100;
  },


  takeFromVault(amount) {
    const n = Math.min(this.feeVault, Math.max(0, Number(amount) || 0));
    this.feeVault = Math.round((this.feeVault - n) * 100) / 100;
    return n;
  },


  _day() {
    return this.game.timeManager.getCurrentDay();
  },


  _markActive() {
    const day = this._day();
    if (this.lastActiveDay === day) return;
    if (this.lastActiveDay && day === this.lastActiveDay + 1) this.streak += 1;
    else this.streak = 1;
    this.lastActiveDay = day;
  },
};
