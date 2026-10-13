/**
 * NpcRequests — les marchands demandent des objets au joueur (v7).
 *
 * Chaque matin, un marchand qui manque d'un objet de sa spécialité (pénurie / stock tendu en ville,
 * ou objectif « reconstituer son stock ») peut publier une demande : quantité 1–3, prix unitaire
 * = 105 % de son prix de référence, valable 2 jours. Livrer = il paie de sa trésorerie (aucune
 * création d'argent), +1 réputation, confiance en hausse. Garde-fous : 3 demandes actives max,
 * une par marchand, prix ≤ 110 % de la valeur normale.
 */
import { NPCS } from '../data/npcs.js';
import { ITEMS, getItemById } from '../data/items.js';
import { Transaction } from '../models/Transaction.js';

export const REQUEST_TUNING = { maxActive: 3, chance: 0.5, premium: 1.05, fairCap: 1.1, days: 2, minQuality: 40, rep: 1, trust: 0.08 };
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export class NpcRequests {
  constructor(game, saved = {}) {
    this.game = game;
    this.list = Array.isArray(saved.list) ? saved.list : [];
    this.stats = { posted: 0, delivered: 0, expired: 0, paid: 0, ...(saved.stats || {}) };
    this.rand = saved.__rand || Math.random;
  }

  _day() { return this.game.timeManager?.getCurrentDay?.() ?? 0; }

  active() { return this.list.filter(r => r.status === 'open'); }

  onNewDay(day = this._day()) {
    const events = [];
    this.list.forEach(r => { if (r.status === 'open' && day > r.until) { r.status = 'expired'; this.stats.expired += 1; } });
    this.list = this.list.filter(r => r.status === 'open' || day - r.day <= 5).slice(-20);
    if (this.active().length < REQUEST_TUNING.maxActive && this.rand() < REQUEST_TUNING.chance) {
      const req = this._post(day);
      if (req) events.push(req);
    }
    return events;
  }

  _post(day) {
    const ctl = this.game.npcController;
    const busy = new Set(this.active().map(r => r.npcId));
    const cands = [];
    for (const npc of NPCS) {
      if (busy.has(npc.id)) continue;
      const st = ctl.npcStates[npc.id];
      if (!st) continue;
      for (const item of ITEMS.filter(i => npc.preferredCategories.includes(i.category))) {
        if (ctl._qtyOf(st, item.id) > 0) continue;
        const status = ctl.marketSignal?.(item.id)?.view?.status;
        const goal = st.mind?.goal?.id;
        let w = status === 'shortage' ? 3 : status === 'tight' ? 1.5 : goal === 'restock' ? 1 : 0;
        if (!w) continue;
        const fair = this.game.economy.getFairValue(item.id);
        const price = r2(Math.min(ctl.refPrice(item.id) * REQUEST_TUNING.premium, fair * REQUEST_TUNING.fairCap));
        const qty = Math.max(1, Math.min(3, Math.floor((st.capital * 0.4) / Math.max(0.01, price))));
        if (st.capital < price * qty * 1.2) continue;
        cands.push({ npc, item, price, qty, w, status });
      }
    }
    if (!cands.length) return null;
    const total = cands.reduce((t, c) => t + c.w, 0);
    let x = this.rand() * total;
    let pick = cands[0];
    for (const c of cands) { x -= c.w; if (x <= 0) { pick = c; break; } }
    const req = {
      id: `req_${day}_${pick.npc.id}`, npcId: pick.npc.id, itemId: pick.item.id, qty: pick.qty, price: pick.price,
      day, until: day + REQUEST_TUNING.days, status: 'open',
      reason: pick.status === 'shortage' ? 'la ville en manque' : pick.status === 'tight' ? 'stock tendu en ville' : 'il doit reconstituer son stock'
    };
    this.list.push(req);
    this.stats.posted += 1;
    return req;
  }

  /** Quantité livrable par le joueur (état ≥ Q40). */
  eligible(req) {
    return this.game.player.inventory.items.filter(s => s.itemId === req.itemId && (s.quality ?? 50) >= REQUEST_TUNING.minQuality).reduce((t, s) => t + s.quantity, 0);
  }

  deliver(reqId) {
    const req = this.list.find(r => r.id === reqId);
    if (!req || req.status !== 'open') return { success: false, error: 'Demande terminée' };
    if (this._day() > req.until) { req.status = 'expired'; return { success: false, error: 'Demande expirée' }; }
    if (this.eligible(req) < req.qty) return { success: false, error: `Il vous faut ${req.qty} objet(s) en état Q${REQUEST_TUNING.minQuality}+` };
    const ctl = this.game.npcController;
    const st = ctl.npcStates[req.npcId];
    const total = r2(req.price * req.qty);
    if (!st || st.capital < total) return { success: false, error: `${ctl.getNpcName(req.npcId)} n'a plus assez de trésorerie` };
    const stacks = this.game.player.inventory.items.filter(s => s.itemId === req.itemId && (s.quality ?? 50) >= REQUEST_TUNING.minQuality).sort((a, b) => a.quality - b.quality);
    let left = req.qty; let costSum = 0; let costQty = 0; let q = 50; let pf = 50;
    for (const s of stacks) {
      if (left <= 0) break;
      const take = Math.min(left, s.quantity);
      if (s.avgBuyPrice != null) { costSum += s.avgBuyPrice * take; costQty += take; }
      q = s.quality; pf = s.perfection;
      this.game.player.inventory.remove(s.itemId, take, s.quality, s.perfection);
      ctl.giveItemToNpc(req.npcId, s.itemId, take, s.quality, s.perfection);
      left -= take;
    }
    ctl.debitNpc(req.npcId, total);
    this.game.player.addMoney(total);
    const tx = new Transaction({ itemId: req.itemId, quantity: req.qty, price: req.price, sellerId: 'player', buyerId: req.npcId, type: 'request', quality: q, perfection: pf, sellerAvgCost: costQty ? r2(costSum / costQty) : null, timestamp: this.game.timeManager?.now?.() ?? Date.now() });
    this.game.transactions.unshift(tx);
    req.status = 'delivered';
    this.stats.delivered += 1;
    this.stats.paid = r2(this.stats.paid + total);
    this.game.player.addReputation(REQUEST_TUNING.rep);
    st.trust = Math.min(1, (st.trust || 0) + REQUEST_TUNING.trust);
    this.game.save?.();
    return { success: true, total, npcName: ctl.getNpcName(req.npcId), message: `${ctl.getNpcName(req.npcId)} vous remercie : +${total.toFixed(2).replace('.', ',')} €, +${REQUEST_TUNING.rep} réputation` };
  }

  view() {
    const ctl = this.game.npcController;
    const day = this._day();
    return this.active().map(r => {
      const item = getItemById(r.itemId);
      return { ...r, npcName: ctl.getNpcName(r.npcId), itemName: item?.name || r.itemId, icon: item?.icon || '', owned: this.eligible(r), have: this.eligible(r) >= r.qty, minQuality: REQUEST_TUNING.minQuality, daysLeft: r.until - day, total: r2(r.price * r.qty) };
    });
  }

  toJSON() { return { list: this.list, stats: { ...this.stats } }; }
}
