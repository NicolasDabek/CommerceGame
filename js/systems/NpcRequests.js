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
import { NEGOTIATION_TUNING } from './negotiation/tuning.js';

export const REQUEST_TUNING = { maxActive: 3, chance: 0.5, premium: 1.05, fairCap: 1.1, days: 2, minQuality: 40, rep: 1, trust: 0.08 };
/**
 * GD passe 10 : clients PNJ qui font une contre-offre sur l'étal du joueur (dès le rang 2, 1 à 2 par jour).
 * Le client propose 92–97 % du prix de l'étal (annonce du joueur, sinon 110 % de la valeur normale ajustée Q/P — prix
 * de détail) ; il a une marge cachée
 * de 3–7 % au-dessus. Le joueur accepte, refuse, ou marchande (une contre-offre du PNJ au plus, puis il s'en va).
 * Paiement depuis la trésorerie du PNJ : aucune création d'argent.
 */
export const STALL_TUNING = { minRank: 2, extraChance: 0.75, bidMin: 0.92, bidMax: 0.97, roomMin: 0.03, roomMax: 0.07, minQuality: 30, fairBase: 1.10,
  // GD passe 11 : plafond anti-flip à l'étal (comme Negotiation : revente rapide → marge du client ≤ maxFlex × 0,5 = 3 %).
  // GD passe 12 : ACTIVÉ, limité au jour même (flipDays 1) et combiné à la marchandise gagée (pledge) : sur 2 jours il
  // coûtait trop au marchandeur (1,196 < 1,20) ; seul (1 jour) il ne bridait pas l'hybride « garde son stock » (1,43).
  // Ensemble, sur 20 graines appariées : marchandeur 1,26, hybride 1,25, hybride « garde son stock » 1,33 (≤ 1,35)
  // — voir reports/gd12-hybride.md.
  flipCap: true, flipDays: 1,
  // GD passe 12 : marchandise gagée — tant qu'un prêt adossé à un contrat court, les clients d'étal ne demandent pas
  // l'objet de ce contrat (il est réservé à la livraison qui rembourse le prêt). Le crédit redevient utile au joueur
  // qui tient aussi un étal (apport du crédit : 1,07 → 1,14 sur 20 graines, 1,17 sur 40).
  pledge: true,
  // GD passe 11 (P1, expérience) : petits consommables — en plus des 1–2 clients, des PNJ viennent acheter pour leur
  // besoin propre des objets à petit ticket (prix de base ≤ smallMaxTicket), dans un budget quotidien d'achats d'étal
  // (smallBudget €/jour, toutes visites « petit ticket » confondues). Même marge relative que les autres clients ;
  // l'objet est consommé par le PNJ (payé sur sa trésorerie). Désactivé par défaut tant que les cibles ne sont pas tenues.
  small: false, smallVisits: 2, smallExtraChance: 0.5, smallMaxTicket: 30, smallBudget: 40, smallRepeat: false };
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export class NpcRequests {
  constructor(game, saved = {}) {
    this.game = game;
    this.list = Array.isArray(saved.list) ? saved.list : [];
    this.stats = { posted: 0, delivered: 0, expired: 0, paid: 0, stallBids: 0, stallSold: 0, stallHaggled: 0, ...(saved.stats || {}) };
    this.stallBids = Array.isArray(saved.stallBids) ? saved.stallBids : [];
    this.rand = saved.__rand || Math.random;
    // GD passe 11 : la visite du jour (graine dédiée, jour, clients encore attendus) est sauvegardée —
    // un rechargement ne relance pas le tirage et ne fait ni gagner ni perdre de client.
    if (Number.isFinite(saved.stallSeed)) {
      this._stallSeed = saved.stallSeed >>> 0;
      this.stallDay = Number.isFinite(saved.stallDay) ? saved.stallDay : undefined;
      this.stallPending = Math.max(0, Math.floor(Number(saved.stallPending) || 0));
      this.smallPending = Math.max(0, Math.floor(Number(saved.smallPending) || 0));
      this.smallBudgetLeft = Math.max(0, Number(saved.smallBudgetLeft) || 0);
    } else if (saved.stats || saved.stallBids) this._migrateGd10();
  }

  /**
   * GD passe 11 : sauvegarde GD10 (sans graine ni visite du jour). On reprend le jour courant ; s'il n'y a eu
   * aucun client aujourd'hui, un client reste attendu (le minimum garanti), sinon plus aucun (pas de client bonus).
   * La graine est dérivée du jour et des compteurs pour ne pas repartir de la constante.
   */
  _migrateGd10() {
    const day = this._day();
    const today = this.stallBids.filter(b => b.day === day).length;
    this.stallDay = day;
    this.stallPending = rankFor(this.game.player?.reputation || 0).id >= STALL_TUNING.minRank ? Math.max(0, 1 - today) : 0;
    const st = this.stats;
    this._stallSeed = (Math.imul((day | 0) + 1, 0x85EBCA6B) ^ Math.imul((st.stallBids | 0) + 1, 0xC2B2AE35) ^ ((st.stallSold | 0) << 8) ^ 0x9E3779B9) >>> 0;
    this.migratedGd10 = true;
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
    this.game.player.recordDelivery?.(total, null, req.qty, costQty === req.qty ? costSum : null); // la transaction ci-dessous compte déjà la catégorie
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
    // petits consommables (expérience, désactivée par défaut) : aucun tirage supplémentaire quand c'est coupé
    this.smallPending = 0; this.smallBudgetLeft = 0;
    if (STALL_TUNING.small && this.stallPending > 0) {
      this.smallPending = (STALL_TUNING.smallVisits || 0) + (this._sr() < (STALL_TUNING.smallExtraChance || 0) ? 1 : 0);
      this.smallBudgetLeft = STALL_TUNING.smallBudget || 0;
    }
  }

  _spawnStallBids() {
    const day = this._day();
    if (this.stallDay !== day || !(this.stallPending > 0 || (STALL_TUNING.small && this.smallPending > 0))) return;
    if (rankFor(this.game.player?.reputation || 0).id < STALL_TUNING.minRank) return;
    const ctl = this.game.npcController;
    while (this.stallPending > 0 || (STALL_TUNING.small && this.smallPending > 0)) {
      const small = !(this.stallPending > 0);
      const used = new Set(this.stallBids.filter(b => b.day === day).map(b => `${b.itemId}|${b.quality}|${b.perfection}`));
      const stacks = [];
      const inv = this.game.player.inventory.items.filter(s => s.quantity > 0 && (s.quality ?? 50) >= STALL_TUNING.minQuality).map(s => ({ itemId: s.itemId, quality: s.quality, perfection: s.perfection }));
      const lst = this.game.offers.filter(o => o.status === 'active' && o.type === 'sell' && o.ownerId === 'player' && o.currentBid == null && (o.quality ?? 50) >= STALL_TUNING.minQuality).map(o => ({ itemId: o.itemId, quality: o.quality, perfection: o.perfection }));
      // les objets en vitrine (annonces du joueur) attirent 3 fois plus les clients que le stock en réserve
      const pledged = this._pledgedItems();
      for (const s of [...lst.map(x => ({ ...x, w: 3 })), ...inv.map(x => ({ ...x, w: 1 }))]) { if (pledged.has(s.itemId)) continue; const key = `${s.itemId}|${s.quality}|${s.perfection}`; if ((!used.has(key) || (small && STALL_TUNING.smallRepeat)) && !stacks.some(x => x.key === key)) stacks.push({ ...s, key }); }
      if (small) {
        // petit ticket : seulement les objets bon marché qui tiennent dans le budget restant du jour
        for (let i = stacks.length - 1; i >= 0; i--) {
          const b0 = this._stallBase(stacks[i]).base;
          if (!(b0 <= STALL_TUNING.smallMaxTicket) || b0 > this.smallBudgetLeft) stacks.splice(i, 1);
        }
      }
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
      if (small) this.smallPending -= 1; else this.stallPending -= 1;
      if (!buyers.length || !(bid > 0)) continue;
      if (small) this.smallBudgetLeft = r2(this.smallBudgetLeft - max);
      const fans = buyers.filter(p => item && p.preferredCategories.includes(item.category));
      const pool = fans.length ? fans : buyers;
      const npc = pool[Math.floor(this._sr() * pool.length)];
      this.stallBids.push({ id: `stall_${day}_${this.stats.stallBids}_${npc.id}`, day, npcId: npc.id, itemId: st.itemId, quality: st.quality, perfection: st.perfection, base, bid, max, counter: null, status: 'open', ...(small ? { small: true } : {}) });
      this.stats.stallBids += 1;
    }
  }

  /** GD passe 12 : marchandise gagée — objet d'un contrat ouvert financé par le prêt en cours (les clients d'étal ne le demandent pas). */
  _pledgedItems() {
    const out = new Set();
    if (!STALL_TUNING.pledge) return out;
    const loan = this.game.credit?.loan;
    if (!loan?.contractId) return out;
    const job = (this.game.jobBoard?.contracts || []).find(j => j.id === loan.contractId && j.status === 'open');
    if (job) out.add(job.itemId);
    return out;
  }

  /** GD passe 12 : objets gagés, pour l'affichage (nom, icône, contrat). */
  pledgedView() {
    return [...this._pledgedItems()].map(id => { const it = getItemById(id); return { itemId: id, itemName: it?.name || id, icon: it?.icon || '' }; });
  }

  stallBidsView() {
    this._spawnStallBids();
    const day = this._day();
    const ctl = this.game.npcController;
    return this.stallBids.filter(b => b.status === 'open' && b.day === day).map(b => {
      const item = getItemById(b.itemId);
      // GD passe 11 : choix informé — coût de revient connu (sinon « inconnu », jamais 0), bénéfice net, quantité restante.
      // Le maximum caché du client n'est pas exposé.
      const { cost, inInv, listed } = this._stallCost(b);
      const offer = r2(b.counter ?? b.bid);
      const net = cost == null ? null : r2(offer - cost);
      return {
        id: b.id, npcId: b.npcId, npcName: ctl.getNpcName(b.npcId), itemId: b.itemId, itemName: item?.name || b.itemId, icon: item?.icon || '',
        quality: b.quality, perfection: b.perfection, base: b.base, bid: b.bid, counter: b.counter, have: this._stallHas(b),
        offer, cost, costKnown: cost != null, net, loss: net != null && net < 0, fee: 0,
        qtyLeft: inInv + listed, fromListing: inInv <= 0 && listed > 0,
        flip: this._stallFlip(b),
        expires: 'fin de journée', expiresDay: b.day
      };
    });
  }

  /** GD passe 11 : coût de revient de l'unité qui partirait (stock d'abord, sinon l'annonce retirée), quantités disponibles. */
  _stallCost(b) {
    const same = (x) => x.itemId === b.itemId && x.quality === b.quality && x.perfection === b.perfection;
    const stack = this.game.player.inventory.items.find(s => same(s) && s.quantity > 0);
    const inInv = this.game.player.inventory.items.filter(s => same(s)).reduce((t, s) => t + Math.max(0, s.quantity), 0);
    const lsts = this.game.offers.filter(o => o.status === 'active' && o.type === 'sell' && o.ownerId === 'player' && o.currentBid == null && same(o));
    const listed = lsts.reduce((t, o) => t + (o.quantity || 0), 0);
    const raw = stack ? stack.avgBuyPrice : lsts[0]?.avgCost;
    return { cost: raw == null || !Number.isFinite(Number(raw)) ? null : r2(raw), inInv, listed, offer: stack ? null : lsts[0] || null };
  }

  /** GD passe 11 : revente rapide à l'étal — objet acheté il y a moins de `STALL_TUNING.flipDays` jour(s). */
  _stallFlip(b) {
    if (!STALL_TUNING.flipCap) return false;
    const d = this.game.player?.lastBuyDay?.[b.itemId];
    return d != null && this._day() - d < (STALL_TUNING.flipDays ?? NEGOTIATION_TUNING.flipDays);
  }

  /** GD passe 11 : plafond anti-flip (comme Negotiation) — produit acheté il y a moins de `flipDays` jours → marge du client ≤ maxFlex × flipFlexFactor. */
  _stallMax(b) {
    if (!this._stallFlip(b)) return b.max;
    return r2(Math.min(b.max, b.bid * (1 + NEGOTIATION_TUNING.maxFlex * NEGOTIATION_TUNING.flipFlexFactor)));
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
    const max = this._stallMax(b);
    if (p <= max) return this._sellStall(b, p, true);
    if (b.counter == null) { b.counter = max; b.flipCapped = max < b.max; return { success: true, outcome: 'counter', counter: b.counter, message: `${name} : « ${b.counter.toFixed(2).replace('.', ',')} €, pas un centime de plus. »` }; }
    b.status = 'walked';
    return { success: true, outcome: 'walked', message: `${name} s'en va.` };
  }

  _sellStall(b, price, haggled) {
    const game = this.game;
    const ctl = game.npcController;
    const st = ctl.npcStates[b.npcId];
    const p = r2(price);
    if (!st || st.capital < p) { b.status = 'gone'; return { success: false, error: `${ctl.getNpcName(b.npcId)} n'a plus assez de trésorerie` }; }
    // GD passe 11 : le coût affiché est celui enregistré (stock, sinon coût de l'annonce). Vente depuis l'annonce :
    // une unité est prélevée sur l'annonce (les autres restent en vente) — plus de retour en inventaire qui pouvait
    // échouer (inventaire plein) et faire disparaître l'objet.
    const known = this._stallCost(b);
    const stack = this.game.player.inventory.items.find(s => s.itemId === b.itemId && s.quality === b.quality && s.perfection === b.perfection && s.quantity > 0);
    const lst = stack ? null : known.offer;
    if (!stack && !(lst && lst.status === 'active' && lst.quantity > 0)) { b.status = 'gone'; return { success: false, error: 'Vous n\'avez plus cet objet' }; }
    const cost = known.cost;
    // le client paie d'abord (trésorerie réelle, jamais négative) ; échec → rien ne bouge
    if (!(p > 0) || !ctl.debitNpc(b.npcId, p)) { b.status = 'gone'; return { success: false, error: `${ctl.getNpcName(b.npcId)} n'a plus assez de trésorerie` }; }
    if (stack) game.player.inventory.remove(b.itemId, 1, b.quality, b.perfection);
    else { lst.quantity -= 1; if (lst.quantity <= 0) { lst.quantity = 0; lst.status = 'completed'; } }
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
    return { success: true, outcome: 'accepted', price: p, cost, net: cost == null ? null : r2(p - cost), fromListing: !stack, gain: haggled ? gain : 0, haggled: haggled && gain > 0, message: `${ctl.getNpcName(b.npcId)} achète à ${p.toFixed(2).replace('.', ',')} €` };
  }

  /**
   * GD passe 11 : on garde tous les clients du jour (vendus, refusés, partis compris — ils occupent l'objet et le marchand)
   * ainsi que la graine, le jour et le nombre de visites restantes.
   */
  toJSON() {
    return {
      list: this.list,
      stats: { ...this.stats },
      stallBids: this.stallBids.filter(b => b.status === 'open' || b.day === this.stallDay),
      stallSeed: this._stallSeed ?? 0x9E3779B9,
      stallDay: this.stallDay ?? null,
      stallPending: this.stallPending ?? 0,
      ...(this.smallPending || this.smallBudgetLeft ? { smallPending: this.smallPending, smallBudgetLeft: this.smallBudgetLeft } : {})
    };
  }
}
