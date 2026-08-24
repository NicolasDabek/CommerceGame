/**
 * TimeManager — Gestion du temps réel du jeu
 * 1 jour réel = 1 jour de jeu
 * Affiche le jour + heure dans le footer
 */

export class TimeManager {
  /**
   * @param {Object} options
   * @param {number} options.startTimestamp - Timestamp de début de partie
   * @param {Function} options.onDayChange  - Callback quand un nouveau jour commence
   */
  constructor(options = {}) {
    this.startTimestamp = options.startTimestamp || Date.now();
    this.onDayChange = options.onDayChange || (() => {});
    this.currentDay = 1;
    this._lastCheckedDay = 1;
  }

  /**
   * Calcule le jour actuel à partir du temps réel écoulé
   */
  getCurrentDay(now = Date.now()) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const elapsed = now - this.startTimestamp;
    return Math.floor(elapsed / msPerDay) + 1;
  }

  /**
   * Retourne une chaîne formatée : "Jour 3 — 14:32"
   */
  getDisplayText(now = Date.now()) {
    const day = this.getCurrentDay(now);
    const date = new Date(now);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `Jour ${day} — ${hours}:${minutes}`;
  }

  /**
   * À appeler régulièrement pour détecter le passage de jour
   */
  tick(now = Date.now()) {
    const day = this.getCurrentDay(now);
    if (day !== this._lastCheckedDay) {
      this._lastCheckedDay = day;
      this.currentDay = day;
      this.onDayChange(day);
    }
    return day;
  }

  /**
   * Met à jour l'élément DOM du footer
   */
  updateUI(elementId = 'game-time') {
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = this.getDisplayText();
    }
  }
}
