export const MS_PER_GAME_DAY_1X = 10 * 60 * 1000;
export const SPEED_OPTIONS = [0, 1, 10, 60];

export class TimeManager {
  constructor(options = {}) {
    this.startTimestamp = options.startTimestamp || Date.now();
    this.onDayChange = options.onDayChange || (() => {});
    this.msPerGameDay = options.msPerGameDay || MS_PER_GAME_DAY_1X;
    this.speed = options.speed ?? 10;
    this.paused = this.speed === 0;
    this.gameTimeMs = options.gameTimeMs || 0;
    this.currentDay = options.currentDay || 1;
    this._lastCheckedDay = this.currentDay;
    this._lastReal = Date.now();
  }

  now() {
    return this.startTimestamp + this.gameTimeMs;
  }

  setSpeed(speed) {
    const value = Number(speed);
    if (!SPEED_OPTIONS.includes(value)) return this.speed;
    this.speed = value;
    this.paused = value === 0;
    this._lastReal = Date.now();
    return this.speed;
  }

  getCurrentDay() {
    return Math.floor(this.gameTimeMs / this.msPerGameDay) + 1;
  }

  getDisplayText() {
    const day = this.getCurrentDay();
    const msInDay = this.gameTimeMs % this.msPerGameDay;
    const totalMinutes = Math.floor((msInDay / this.msPerGameDay) * 24 * 60);
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const minutes = String(totalMinutes % 60).padStart(2, '0');
    const speedLabel = this.paused ? 'pause' : `${this.speed}×`;
    return `Jour ${day} — ${hours}:${minutes} (${speedLabel})`;
  }

  tick(now = Date.now()) {
    if (!this.paused) {
      const dt = Math.max(0, now - this._lastReal);
      this.gameTimeMs += dt * this.speed;
    }
    this._lastReal = now;
    const day = this.getCurrentDay();
    if (day !== this._lastCheckedDay) {
      this._lastCheckedDay = day;
      this.currentDay = day;
      this.onDayChange(day);
    }
    return day;
  }

  updateUI(elementId = 'game-time') {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(elementId);
    if (el) el.textContent = this.getDisplayText();
  }

  toJSON() {
    return {
      startTimestamp: this.startTimestamp,
      gameTimeMs: this.gameTimeMs,
      currentDay: this.getCurrentDay(),
      speed: this.speed
    };
  }
}
