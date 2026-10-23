/**
 * NPCController — boucle de décision : tick, amorçage du marché, choix de l'action, journal.
 * (méthodes de NPCController, extraites de NPCController.js sans changement de comportement)
 */

import { NPCS } from '../../data/npcs.js';
import { noteAction, scoreBumps } from '../NpcMind.js';
import { eur } from './tuning.js';

export const NpcLoop = {

  /* ============ Boucle ============ */

  tick(now = Date.now()) {
    const actions = [];
    this._invalidateBooks();
    NPCS.forEach(npc => {
      const state = this._ensureState(npc);
      if (!state) return;
      if (state.focusItemId && now > state.focusUntil) this._pickFocus(npc, state);
      if (state.actionsToday >= this.actionBudget(npc)) return;
      const minDelay = 4200 + (1 - npc.aggressiveness) * 16000;
      if (now - state.lastActionAt < minDelay) return;
      const actChance = npc.aggressiveness * 0.82 + 0.16 + Math.max(0, state.mood) * 0.08;
      if (Math.random() > actChance) return;
      const result = this._chooseAndAct(npc, state, now);
      if (result) {
        state.lastActionAt = now;
        state.actionsToday += 1;
        state.lastIntent = result.intent || this._intentLabel(result, state);
        state.lastReason = result.reason || null;
        noteAction(state, result.type);
        this._remember(state, state.lastIntent);
        this._invalidateBooks();
        actions.push(result);
      }
    });
    return actions;
  },


  /**
   * Nouvelle partie : chaque marchand agit quelques fois tout de suite pour que les hôtels
   * ne soient pas vides à l'arrivée du joueur (mêmes règles que le tick normal).
   */
  primeMarket(rounds = 2, now = this.getNow()) {
    const actions = [];
    for (let r = 0; r < rounds; r++) {
      NPCS.forEach(npc => {
        const state = this._ensureState(npc);
        if (!state || state.actionsToday >= this.actionBudget(npc)) return;
        this._invalidateBooks();
        const result = this._chooseAndAct(npc, state, now);
        if (!result) return;
        state.actionsToday += 1;
        state.lastIntent = result.intent || this._intentLabel(result, state);
        state.lastReason = result.reason || null;
        noteAction(state, result.type);
        this._remember(state, state.lastIntent);
        actions.push(result);
      });
    }
    this._invalidateBooks();
    return actions;
  },


  _remember(state, text) {
    if (!text) return;
    state.journal.push(text);
    if (state.journal.length > 5) state.journal.splice(0, state.journal.length - 5);
  },


  _intentLabel(result, state) {
    const moodTxt = state.mood > 0.35 ? 'confiant' : state.mood < -0.35 ? 'tendu' : 'calme';
    switch (result.type) {
      case 'bid': return `Enchère ${eur(result.amount)} € (${moodTxt})`;
      case 'buyout': return `Achat immédiat ×${result.quantity}`;
      case 'fulfill': return 'Vend sur une offre d\'achat';
      case 'sell': return 'Met en vente';
      case 'buy': return 'Poste une offre d\'achat';
      case 'cancel': return 'Retire une offre mal placée';
      case 'snipe': return `Snipe ${eur(result.amount)} €`;
      default: return result.type;
    }
  },


  _pctTxt(ratio) {
    const pct = Math.round((ratio - 1) * 100);
    if (pct === 0) return 'au prix normal';
    return pct > 0 ? `${pct} % au-dessus du prix normal` : `${-pct} % sous le prix normal`;
  },


  _chooseAndAct(npc, state, now) {
    const offers = this.getOffers().filter(o => o.status === 'active');
    const stockQty = this._stockQty(state);
    const ownSells = offers.filter(o => o.ownerId === npc.id && o.type === 'sell');
    const ownBuys = offers.filter(o => o.ownerId === npc.id && o.type === 'buy');
    const cash = this._spendable(npc, state);
    const target = this.stockTarget(npc);
    const cancel = this._tryCancelStale(npc, state, ownSells, ownBuys, now);
    if (cancel) return cancel;
    if (this.professionOf(npc).arbitrage || npc.personality === 'opportuniste') {
      const arb = this._tryArbitrage(npc, state);
      if (arb) return arb;
    }
    const scored = [];
    const tryPush = (type, score, fn) => { if (score > 0) scored.push({ type, score, fn }); };
    const roomToBuy = stockQty < target * 1.6;
    tryPush('buyout', cash > 8 ? this._scoreBuyout(npc, state, offers, roomToBuy) : 0, () => this._tryBuyout(npc, state));
    tryPush('bid', cash > 8 && roomToBuy ? this._scoreBid(npc, state, offers, now) : 0, () => this._tryBid(npc, state, now));
    tryPush('fulfill', stockQty > 0 ? this._scoreFulfill(npc, state, offers) : 0, () => this._tryFulfillBuy(npc, state));
    tryPush('sell', stockQty > 0 && ownSells.length < this._maxListings(npc) ? this._scoreSell(npc, state, stockQty) : 0, () => this._trySell(npc, state));
    tryPush('buy', cash > 15 && ownBuys.length < 2 && stockQty < target ? this._scoreRestock(npc, state, stockQty) : 0, () => this._tryBuy(npc, state));
    if (npc.personality === 'épicier') this._bump(scored, 'sell', 0.22);
    if (npc.personality === 'collectionneur') this._bump(scored, 'bid', 0.2);
    if (npc.personality === 'agressif') this._bump(scored, 'buyout', 0.16);
    if (npc.personality === 'artisan') this._bump(scored, 'buy', 0.14);
    if (npc.personality === 'opportuniste') this._bump(scored, 'bid', 0.1);
    if (state.rivalry > 0.4) this._bump(scored, 'bid', 0.14);
    if (stockQty > target * 1.3) this._bump(scored, 'sell', 0.25);
    if (stockQty < target * 0.4) this._bump(scored, 'buy', 0.16);
    if (this.capitalState(npc, state).id === 'dry') { this._bump(scored, 'sell', 0.3); this._bump(scored, 'fulfill', 0.3); }
    // Objectif du jour + ce qu'il a appris de ses gains / pertes récents (bornés)
    for (const [type, add] of Object.entries(scoreBumps(state))) this._bump(scored, type, add);
    scored.sort((a, b) => b.score - a.score);
    for (const option of scored) { const result = option.fn(); if (result) return result; }
    return null;
  },


  _bump(scored, type, add) { const row = scored.find(s => s.type === type); if (row) row.score += add; },

  _maxListings(npc) { return (npc.personality === 'épicier' || npc.personality === 'agressif') ? 4 : 3; },
};
