/**
 * Modèle d'offre (vente ou achat)
 */

let offerCounter = 0;
const REAL_DAY_MS = 24 * 60 * 60 * 1000;

export class Offer {
  constructor(data) {
    this.id = data.id || `offer_${Date.now()}_${++offerCounter}`;
    this.type = data.type;
    this.itemId = data.itemId;
    this.quantity = data.quantity;
    this.originalQuantity = data.originalQuantity ?? data.quantity;
    this.price = Number(data.price);
    this.buyoutPrice = data.buyoutPrice != null ? Number(data.buyoutPrice) : null;
    this.ownerId = data.ownerId;
    this.durationDays = data.durationDays;
    this.quality = data.quality ?? 50;
    this.perfection = data.perfection ?? 50;
    this.minQuality = data.minQuality ?? 0;
    this.minPerfection = data.minPerfection ?? 0;
    this.msPerGameDay = data.msPerGameDay || REAL_DAY_MS;

    this.createdAt = data.createdAt || Date.now();
    this.expiresAt = data.expiresAt || this._computeExpiresAt();
    this.status = data.status || 'active';

    this.currentBid = data.currentBid != null ? Number(data.currentBid) : null;
    this.currentBidderId = data.currentBidderId || null;
    this.bids = data.bids || [];
    this.avgCost = data.avgCost ?? null;
  }

  _computeExpiresAt() {
    return this.createdAt + (this.durationDays * this.msPerGameDay);
  }

  bidStep() {
    const start = Number(this.price) || 0;
    if (start >= 50) return 1;
    if (start >= 10) return 0.1;
    return 0.01;
  }

  minNextBid() {
    const step = this.bidStep();
    if (this.currentBid == null) return Math.round(this.price * 100) / 100;
    return Math.round((this.currentBid + step) * 100) / 100;
  }

  canBidAmount(amount) {
    const bid = Number(amount);
    if (!(bid > 0)) return { ok: false, error: 'Enchère invalide' };
    const minBid = this.minNextBid();
    if (bid < minBid) {
      return { ok: false, error: `Enchère trop basse (minimum ${minBid.toFixed(2)} €, palier ${this.bidStep().toFixed(2)} €)` };
    }
    if (this.buyoutPrice != null && bid >= this.buyoutPrice) {
      return { ok: false, error: `L'enchère ne peut pas atteindre l'achat immédiat (${this.buyoutPrice.toFixed(2)} €)` };
    }
    return { ok: true, minBid };
  }

  static calculateListingFee(price, quantity, durationDays) {
    const totalValue = price * quantity;
    let percent = 0.03;
    if (durationDays === 2) percent = 0.06;
    else if (durationDays === 7) percent = 0.10;
    return Math.round((totalValue * percent + 0.20) * 100) / 100;
  }

  static calculatePriceChangeFee(oldPrice, newPrice, quantity) {
    if (newPrice <= oldPrice) return 0;
    return Math.round((newPrice - oldPrice) * quantity * 0.02 * 100) / 100;
  }

  isExpired(now = Date.now()) {
    return now >= this.expiresAt;
  }

  getRemainingMs(now = Date.now()) {
    return Math.max(0, this.expiresAt - now);
  }

  getRemainingText(now = Date.now()) {
    const ms = this.getRemainingMs(now);
    if (ms <= 0) return 'Expiré';
    const hours = Math.floor((ms / this.msPerGameDay) * 24);
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (days > 0) return `${days}j ${remainingHours}h`;
    if (hours > 0) return `${hours}h`;
    const minutes = Math.max(1, Math.floor((ms / this.msPerGameDay) * 24 * 60));
    return `${minutes}min`;
  }

  filledQuantity() {
    return Math.max(0, (this.originalQuantity || this.quantity) - this.quantity);
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      itemId: this.itemId,
      quantity: this.quantity,
      originalQuantity: this.originalQuantity,
      price: this.price,
      buyoutPrice: this.buyoutPrice,
      ownerId: this.ownerId,
      durationDays: this.durationDays,
      quality: this.quality,
      perfection: this.perfection,
      minQuality: this.minQuality,
      minPerfection: this.minPerfection,
      msPerGameDay: this.msPerGameDay,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      status: this.status,
      currentBid: this.currentBid,
      currentBidderId: this.currentBidderId,
      bids: this.bids,
      avgCost: this.avgCost
    };
  }

  static fromJSON(data) {
    return new Offer(data);
  }
}
