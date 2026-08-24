/**
 * Modèle d'offre (vente ou achat)
 */

let offerCounter = 0;

export class Offer {
  /**
   * @param {Object} data
   * @param {'sell'|'buy'} data.type
   * @param {string} data.itemId
   * @param {number} data.quantity
   * @param {number} data.price          - Prix unitaire
   * @param {number|null} data.buyoutPrice - Uniquement pour les ventes (achat immédiat)
   * @param {string} data.ownerId        - 'player' ou id du PNJ
   * @param {1|2|7} data.durationDays
   * @param {number} [data.quality=50]
   * @param {number} [data.perfection=50]
   */
  constructor(data) {
    this.id = data.id || `offer_${Date.now()}_${++offerCounter}`;
    this.type = data.type;                    // 'sell' | 'buy'
    this.itemId = data.itemId;
    this.quantity = data.quantity;
    this.price = Number(data.price);
    this.buyoutPrice = data.buyoutPrice != null ? Number(data.buyoutPrice) : null;
    this.ownerId = data.ownerId;
    this.durationDays = data.durationDays;    // 1 | 2 | 7
    this.quality = data.quality ?? 50;
    this.perfection = data.perfection ?? 50;

    this.createdAt = data.createdAt || Date.now();
    this.expiresAt = data.expiresAt || this._computeExpiresAt();
    this.status = data.status || 'active';    // active | completed | expired | cancelled

    // Système d'enchères
    this.currentBid = data.currentBid != null ? Number(data.currentBid) : null;  // prix unitaire actuel
    this.currentBidderId = data.currentBidderId || null;
    this.bids = data.bids || [];   // historique simple [{ bidderId, amount, at }]
    this.avgCost = data.avgCost ?? null;
  }

  _computeExpiresAt() {
    const msPerDay = 24 * 60 * 60 * 1000;
    return this.createdAt + (this.durationDays * msPerDay);
  }

  /**
   * Frais de mise en vente / offre d'achat
   * Formule : (pourcentage selon durée) + 0,20 €
   */
  static calculateListingFee(price, quantity, durationDays) {
    const totalValue = price * quantity;
    let percent = 0.03; // 1 jour

    if (durationDays === 2) percent = 0.06;
    else if (durationDays === 7) percent = 0.10;

    const fee = (totalValue * percent) + 0.20;
    return Math.round(fee * 100) / 100; // 2 décimales
  }

  /**
   * Frais de modification de prix (uniquement si nouveau prix > ancien)
   * Pour l'instant : 2 % de la différence (à affiner plus tard)
   */
  static calculatePriceChangeFee(oldPrice, newPrice, quantity) {
    if (newPrice <= oldPrice) return 0;
    const diff = (newPrice - oldPrice) * quantity;
    const fee = diff * 0.02;
    return Math.round(fee * 100) / 100;
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

    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    if (days > 0) return `${days}j ${remainingHours}h`;
    if (hours > 0) return `${hours}h`;
    const minutes = Math.floor(ms / (1000 * 60));
    return `${minutes}min`;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      itemId: this.itemId,
      quantity: this.quantity,
      price: this.price,
      buyoutPrice: this.buyoutPrice,
      ownerId: this.ownerId,
      durationDays: this.durationDays,
      quality: this.quality,
      perfection: this.perfection,
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
