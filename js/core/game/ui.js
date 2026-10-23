/**
 * Game — notifications vers l'interface.
 * (méthodes de Game, extraites de Game.js sans changement de comportement)
 */

export const GameUI = {

  // ============================================
  // Notifications UI
  // ============================================
  _notifyMoney() {
    if (this.uiCallbacks.onMoneyChanged) {
      this.uiCallbacks.onMoneyChanged(this.player.money);
    }
  },


  _notifyUI() {
    if (this.uiCallbacks.onInventoryChanged) this.uiCallbacks.onInventoryChanged();
    if (this.uiCallbacks.onOffersChanged) this.uiCallbacks.onOffersChanged();
    if (this.uiCallbacks.onTransactionsChanged) this.uiCallbacks.onTransactionsChanged();
    this._notifyMoney();
  },
};
