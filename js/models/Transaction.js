/**
 * Modèle de transaction (vente réalisée)
 */

let txCounter = 0;

export class Transaction {
  /**
   * @param {Object} data
   * @param {string} data.itemId
   * @param {number} data.quantity
   * @param {number} data.price          - Prix unitaire réel de la transaction
   * @param {string} data.sellerId
   * @param {string} data.buyerId
   * @param {'matching'|'buyout'|'auction_end'} data.type
   * @param {number} [data.quality]
   * @param {number} [data.perfection]
   * @param {string} [data.sellOfferId]
   * @param {string} [data.buyOfferId]
   */
  constructor(data) {
    this.id = data.id || `tx_${Date.now()}_${++txCounter}`;
    this.itemId = data.itemId;
    this.quantity = data.quantity;
    this.price = Number(data.price);
    this.total = Math.round(this.price * this.quantity * 100) / 100;
    this.sellerId = data.sellerId;
    this.buyerId = data.buyerId;
    this.type = data.type;               // matching | buyout | auction_end
    this.quality = data.quality ?? null;
    this.perfection = data.perfection ?? null;
    this.sellOfferId = data.sellOfferId || null;
    this.buyOfferId = data.buyOfferId || null;
    this.timestamp = data.timestamp || Date.now();
    this.marketPrice = data.marketPrice ?? null;
    this.priceDeltaPct = data.priceDeltaPct ?? null;
    this.playerMargin = data.playerMargin ?? null;
    this.playerMarginPct = data.playerMarginPct ?? null;
    this.sellerAvgCost = data.sellerAvgCost ?? null;
  }

  toJSON() {
    return {
      id: this.id,
      itemId: this.itemId,
      quantity: this.quantity,
      price: this.price,
      total: this.total,
      sellerId: this.sellerId,
      buyerId: this.buyerId,
      type: this.type,
      quality: this.quality,
      perfection: this.perfection,
      sellOfferId: this.sellOfferId,
      buyOfferId: this.buyOfferId,
      timestamp: this.timestamp,
      marketPrice: this.marketPrice,
      priceDeltaPct: this.priceDeltaPct,
      playerMargin: this.playerMargin,
      playerMarginPct: this.playerMarginPct,
      sellerAvgCost: this.sellerAvgCost
    };
  }

  static fromJSON(data) {
    return new Transaction(data);
  }
}
