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
import { rankFor } from '../core/Ranks.js';

export const REQUEST_TUNING = { maxActive: 3, chance: 0.5, premium: 1.05, fairCap: 1.1, days: 2, minQuality: 40, rep: 1, trust: 0.08 };
/**
 * GD passe 10 : clients PNJ qui font une contre-offre sur l'étal du joueur (dès le rang 2, 1 à 2 par jour).
 * Le client propose 92–97 % du prix de l'étal (annonce du joueur, sinon 110 % de la valeur normale ajustée Q/P — prix
 * de détail) ; il a une marge cachée
 * de 3–7 % au-dessus. Le joueur accepte, refuse, ou marchande (une contre-offre du PNJ au plus, puis il s'en va).
 * Paiement depuis la trésorerie du PNJ : aucune création d'argent.
 */
export const STALL_TUNING = { minRank: 2, extraChance: 0.75, bidMin: 0.92, bidMax: 0.97, roomMin: 0.03, roomMax: 0.07, minQuality: 30, fairBase: 1.10 };
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export class NpcRequests {
  constructor(game, saved = {}) {
    this.game = game;
    this.list = Array.isArray(saved.list) ? saved.list : [];
    this.stats = { posted: 0, delivered: 0, expired: 0, paid: 0, stallBids: 0, stallSold: 0, stallHaggled: 0, ...(saved.stats || {}) };
    this.stallBids = Array.isArray(saved.stallBids) ? saved.stallBids : [];
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
    this._postStallBids(day);
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
    this.game.player.recordDelivery?.(total); // la transaction ci-dessous compte déjà la catégorie
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

  /* ---------- GD passe 10 : contre-offres de clients sur l'étal ---------- */

  _stallBase(st) {
    const listed = this.game.offers.find(o => o.status === 'active' && o.type === 'sell' && o.ownerId === 'player' && o.itemId === st.itemId && o.quality === st.quality && o.perfection === st.perfection && o.currentBid == null);
    const eco = this.game.economy;
    const fair = eco.applyConditionModifier(eco.getFairValue(st.itemId), st.quality ?? 50, st.perfection ?? 50);
    return { base: r2(listed ? Math.min(listed.buyoutPrice ?? listed.price, fair * 1.1) : fair * STALL_TUNING.fairBase), offerId: listed?.id || null };
  }

  /** Hasard propre aux clients d'étal (déterministe, ne consomme pas Math.random : le reste du marché n'est pas perturbé). */
  _sr() {
    let t = (this._stallSeed = ((this._stallSeed ?? 0x9E3779B9) + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Nouveau jour : 1 à 2 clients passeront à l'étal (ils se présentent dès que le joueur a de la marchandise). */
  _postStallBids(day) {
    this.stallBids = this.stallBids.filter(b => b.status === 'open' && b.day === day);
    this.stallDay = day;
    this.stallPending = rankFor(this.game.player?.reputation || 0).id >= STALL_TUNING.minRank ? 1 + (this._sr() < STALL_TUNING.extraChance ? 1 : 0) : 0;
  }

  _spawnStallBids() {
    const day = this._day();
    if (this.stallDay !== day || !(this.stallPending > 0)) return;
    if (rankFor(this.game.player?.reputation || 0).id < STALL_TUNING.minRank) return;
    const ctl = this.game.npcController;
    while (this.stallPending > 0) {
      const used = new Set(this.stallBids.filter(b => b.day === day).map(b => `${b.itemId}|${b.quality}|${b.perfection}`));
      const stacks = [];
      const inv = this.game.player.inventory.items.filter(s => s.quantity > 0 && (s.quality ?? 50) >= STALL_TUNING.minQuality).map(s => ({ itemId: s.itemId, quality: s.quality, perfection: s.perfection }));
      const lst = this.game.offers.filter(o => o.status === 'active' && o.type === 'sell' && o.ownerId === 'player' && o.currentBid == null && (o.quality ?? 50) >= STALL_TUNING.minQuality).map(o => ({ itemId: o.itemId, quality: o.quality, perfection: o.perfection }));
      // les objets en vitrine (annonces du joueur) attirent 3 fois plus les clients que le stock en réserve
      for (const s of [...lst.map(x => ({ ...x, w: 3 })), ...inv.map(x => ({ ...x, w: 1 }))]) { const key = `${s.itemId}|${s.quality}|${s.perfection}`; if (!used.has(key) && !stacks.some(x => x.key === key)) stacks.push({ ...s, key }); }
      if (!stacks.length) return;
      let x = this._sr() * stacks.reduce((t, c) => t + c.w, 0);
      let st = stacks[stacks.length - 1];
      for (const c of stacks) { x -= c.w; if (x <= 0) { st = c; break; } }
      const item = getItemById(st.itemId);
      const { base } = this._stallBase(st);
      const bid = r2(base * (STALL_TUNING.bidMin + this._sr() * (STALL_TUNING.bidMax - STALL_TUNING.bidMin)));
      const max = r2(Math.min(base, bid * (1 + STALL_TUNING.roomMin + this._sr() * (STALL_TUNING.roomMax - STALL_TUNING.roomMin))));
      const busy = new Set(this.stallBids.filter(b => b.day === day).map(b => b.npcId));
      const buyers = NPCS.filter(p => ctl.npcStates[p.id] && ctl.npcStates[p.id].capital >= max * 1.5 && !busy.has(p.id));
      this.stallPending -= 1;
      if (!buyers.length || !(bid > 0)) continue;
      const fans = buyers.filter(p => item && p.preferredCategories.includes(item.category));
      const pool = fans.length ? fans : buyers;
      const npc = pool[Math.floor(this._sr() * pool.length)];
      this.stallBids.push({ id: `stall_${day}_${this.stats.stallBids}_${npc.id}`, day, npcId: npc.id, itemId: st.itemId, quality: st.quality, perfection: st.perfection, base, bid, max, counter: null, status: 'open' });
      this.stats.stallBids += 1;
    }
  }

  stallBidsView() {
    this._spawnStallBids();
    const day = this._day();
    const ctl = this.game.npcController;
    return this.stallBids.filter(b => b.status === 'open' && b.day === day).map(b => {
      const item = getItemById(b.itemId);
      return { id: b.id, npcId: b.npcId, npcName: ctl.getNpcName(b.npcId), itemId: b.itemId, itemName: item?.name || b.itemId, icon: item?.icon || '', quality: b.quality, perfection: b.perfection, base: b.base, bid: b.bid, counter: b.counter, have: this._stallHas(b) };
    });
  }

  _stallHas(b) {
    const inv = this.game.player.inventory.items.some(s => s.itemId === b.itemId && s.quality === b.quality && s.perfection === b.perfection && s.quantity > 0);
    return inv || this.game.offers.some(o => o.status === 'active' && o.type === 'sell' && o.ownerId === 'player' && o.itemId === b.itemId && o.quality === b.quality && o.perfection === b.perfection && o.currentBid == null);
  }

  /**
   * Réponse du joueur à une contre-offre d'étal.
   * action 'accept' : vend au prix proposé (ou à sa dernière contre-offre) ; 'refuse' ; 'haggle' + price : marchande.
   */
  answerStallBid(id, action = 'accept', price = null) {
    const b = this.stallBids.find(x => x.id === id);
    if (!b || b.status !== 'open' || b.day !== this._day()) return { success: false, error: 'Proposition terminée' };
    const name = this.game.npcController.getNpcName(b.npcId);
    if (action === 'refuse') { b.status = 'refused'; return { success: true, outcome: 'refused' }; }
    if (!this._stallHas(b)) { b.status = 'gone'; return { success: false, error: 'Vous n\'avez plus cet objet' }; }
    if (action === 'accept') return this._sellStall(b, b.counter ?? b.bid, b.counter != null);
    const p = r2(Math.max(b.bid, Math.min(Number(price) || 0, b.base)));
    if (rankFor(this.game.player?.reputation || 0).id < STALL_TUNING.minRank) return { success: false, error: 'Marchandage d\'étal : rang 2 requis' };
    if (p <= b.max) return this._sellStall(b, p, true);
    if (b.counter == null) { b.counter = b.max; return { success: true, outcome: 'counter', counter: b.counter, message: `${name} : « ${b.counter.toFixed(2).replace('.', ',')} €, pas un centime de plus. »` }; }
    b.status = 'walked';
    return { success: true, outcome: 'walked', message: `${name} s'en va.` };
  }

  _sellStall(b, price, haggled) {
    const game = this.game;
    const ctl = game.npcController;
    const st = ctl.npcStates[b.npcId];
    const p = r2(price);
    if (!st || st.capital < p) { b.status = 'gone'; return { success: false, error: `${ctl.getNpcName(b.npcId)} n'a plus assez de trésorerie` }; }
    const inInv = () => game.player.inventory.items.find(s => s.itemId === b.itemId && s.quality === b.quality && s.perfection === b.perfection && s.quantity > 0);
    if (!inInv()) {
      const o = game.offers.find(x => x.status === 'active' && x.type === 'sell' && x.ownerId === 'player' && x.itemId === b.itemId && x.quality === b.quality && x.perfection === b.perfection && x.currentBid == null);
      if (o) game.auctionHouse.cancel(o);
    }
    const stack = inInv();
    if (!stack) { b.status = 'gone'; return { success: false, error: 'Vous n\'avez plus cet objet' }; }
    const cost = stack.avgBuyPrice ?? null;
    game.player.inventory.remove(b.itemId, 1, b.quality, b.perfection);
    ctl.debitNpc(b.npcId, p);
    const tx = new Transaction({ itemId: b.itemId, quantity: 1, price: p, sellerId: 'player', buyerId: b.npcId, type: 'stall', quality: b.quality, perfection: b.perfection, sellerAvgCost: cost, timestamp: game.timeManager?.now?.() ?? Date.now() });
    game._handleTransaction(tx);
    b.status = 'sold';
    b.price = p;
    this.stats.stallSold += 1;
    const gain = r2(Math.max(0, p - b.bid));
    if (haggled && gain > 0) {
      this.stats.stallHaggled += 1;
      const neg = game.negotiation;
      if (neg?.stats) { neg.stats.deals += 1; neg.stats.sellDeals += 1; neg.stats.extra = r2((neg.stats.extra || 0) + gain); neg.stats.stallDeals = (neg.stats.stallDeals || 0) + 1; }
    }
    game.save?.();
    return { success: true, outcome: 'accepted', price: p, gain: haggled ? gain : 0, haggled: haggled && gain > 0, message: `${ctl.getNpcName(b.npcId)} achète à ${p.toFixed(2).replace('.', ',')} €` };
  }

  toJSON() { return { list: this.list, stats: { ...this.stats }, stallBids: this.stallBids.filter(b => b.status === 'open') }; }
}
