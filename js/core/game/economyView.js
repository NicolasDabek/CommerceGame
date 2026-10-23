/**
 * Game — santé de l'économie : masse monétaire, stock des PNJ, instantanés quotidiens.
 * (méthodes de Game, extraites de Game.js sans changement de comportement)
 */

import { getItemById } from '../../data/items.js';
import { RESERVE_ID, RESERVE_TUNING } from '../../systems/MarketReserve.js';
import { SD_TUNING } from '../SupplyDemand.js';

export const GameEconomyView = {

  // ============================================
  // Santé de l'économie
  // ============================================
  /** Argent total en circulation (joueur + PNJ + sommes bloquées + Comptoir + caisse des contrats). */
  getMoneySupply() {
    const npcCash = Object.values(this.npcController.npcStates).reduce((s, st) => s + (st.capital || 0), 0);
    let locked = 0;
    this.offers.forEach(o => {
      if (o.status !== 'active') return;
      if (o.type === 'buy') locked += o.price * o.quantity;
      if (o.type === 'sell' && o.currentBid != null && o.currentBidderId) locked += o.currentBid * o.quantity;
    });
    const total = this.player.money + npcCash + locked + this.reserve.treasury + (this.jobBoard?.feeVault || 0);
    return { total: Math.round(total * 100) / 100, npcCash: Math.round(npcCash * 100) / 100, locked: Math.round(locked * 100) / 100 };
  },


  /** Objets détenus par les PNJ (stock + annonces en cours). */
  getNpcStock() {
    let stock = 0;
    Object.values(this.npcController.npcStates).forEach(st => {
      (st.inventory || []).forEach(sl => { stock += sl.quantity; });
    });
    this.offers.forEach(o => {
      if (o.status === 'active' && o.type === 'sell' && o.ownerId !== 'player' && o.ownerId !== RESERVE_ID) stock += o.quantity;
    });
    return stock;
  },


  recordEconomySnapshot(day = this.currentDay) {
    const money = this.getMoneySupply();
    const tx = Math.max(0, this.txCounter - this._lastSnapshotTx);
    this._lastSnapshotTx = this.txCounter;
    this.economy.recordSnapshot({
      day,
      priceIndex: Math.round(this.economy.getPriceLevel() * 1000) / 1000,
      money: money.total,
      npcCash: money.npcCash,
      treasury: this.reserve.treasury,
      stock: this.getNpcStock(),
      tx
    });
  },


  /**
   * Résumé lisible de l'économie pour l'interface.
   * status : stable | tendu | surchauffe | prix-bas | deflation
   */
  getEconomyHealth() {
    const priceIndex = this.economy.getPriceLevel();
    const snaps = this.economy.snapshots;
    const ref7 = snaps.length ? snaps[Math.max(0, snaps.length - 7)] : null;
    const money = this.getMoneySupply();
    const priceChange7d = ref7 && ref7.priceIndex > 0 ? (priceIndex - ref7.priceIndex) / ref7.priceIndex : 0;
    const moneyChange7d = ref7 && ref7.money > 0 ? (money.total - ref7.money) / ref7.money : 0;
    let status = 'stable';
    let label = 'Stable';
    let explanation = 'Les prix restent proches de leur valeur normale.';
    if (priceIndex > 1.25) {
      status = 'surchauffe'; label = 'Surchauffe';
      explanation = 'Les prix sont nettement au-dessus de la normale : bon moment pour vendre, prudence à l\'achat.';
    } else if (priceIndex > 1.1) {
      status = 'tendu'; label = 'Prix élevés';
      explanation = 'Les prix montent : la demande dépasse l\'offre. Le Comptoir municipal revend son stock pour calmer le marché.';
    } else if (priceIndex < 0.8) {
      status = 'deflation'; label = 'Déflation';
      explanation = 'Les prix sont très bas : bon moment pour acheter, le Comptoir rachète pour soutenir les cours.';
    } else if (priceIndex < 0.92) {
      status = 'prix-bas'; label = 'Prix bas';
      explanation = 'Le marché est un peu bradé : les achats sont intéressants.';
    }
    const now = this.timeManager?.now?.() ?? Date.now();
    // Ventes par jour : moyenne des 3 derniers jours (instantanés), sinon ventes depuis le début de la journée
    const recent = snaps.slice(-3);
    const txToday = recent.length
      ? Math.round(recent.reduce((sum, sn) => sum + (sn.tx || 0), 0) / recent.length)
      : Math.max(0, this.txCounter - this._lastSnapshotTx);
    const reserveStock = this.reserve.stockTotal();
    return {
      priceIndex: Math.round(priceIndex * 1000) / 1000,
      priceChange7d: Math.round(priceChange7d * 1000) / 1000,
      status,
      label,
      explanation,
      inflation: Math.round(this.economy.globalInflation * 1000) / 1000,
      moneySupply: money.total,
      npcCash: money.npcCash,
      moneyChange7d: Math.round(moneyChange7d * 1000) / 1000,
      treasury: this.reserve.treasury,
      treasuryCap: RESERVE_TUNING.treasuryCap,
      reserveStock,
      reserveStats: { ...this.reserve.stats },
      reserveActions: this.reserve.lastActions || [],
      npcStock: this.getNpcStock(),
      txPerDay: txToday,
      events: this.economy.getActiveEvents(now).map(e => ({ name: e.name, description: e.description, remainingMs: e.remainingMs })),
      market: this._supplySummary(),
      history: snaps.slice(-20).map(sn => sn.priceIndex)
    };
  },


  /** Saison, population, pénuries et surplus (pour la carte « Saison & population »). */
  _supplySummary() {
    const sum = this.supplyDemand.getSummary(this.economy);
    const names = (ids) => ids.map(id => getItemById(id)).filter(Boolean).map(i => ({ id: i.id, name: i.name, icon: i.icon }));
    return {
      season: { id: sum.season.id, label: sum.season.label, icon: sum.season.icon, text: sum.season.text },
      seasonDaysLeft: sum.seasonDaysLeft,
      nextSeason: { label: sum.nextSeason.label, icon: sum.nextSeason.icon },
      population: sum.population,
      shortages: names(sum.shortages),
      surplus: names(sum.surplus),
      avgShortageDays: sum.avgShortageDays,
      shortageCoverage: SD_TUNING.shortageCoverage
    };
  },
};
