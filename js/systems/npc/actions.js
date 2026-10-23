/**
 * NPCController — actions sur le marché : annonces, achats, enchères, arbitrage, annulations.
 * (méthodes de NPCController, extraites de NPCController.js sans changement de comportement)
 */

import { isRepairable } from '../../core/condition.js';
import { ITEMS, getItemById } from '../../data/items.js';
import { NPCS } from '../../data/npcs.js';
import { Offer } from '../../models/Offer.js';
import { blocksBuyBack, isPersonalRival, markSold, noteRival } from '../NpcMind.js';
import { NPC_TUNING, eur, rand, round2 } from './tuning.js';

export const NpcActions = {

  _tryCancelStale(npc, state, ownSells, ownBuys, now) {
    if (Math.random() > 0.35) return null;
    if (this.executeCancel) {
      for (const offer of ownSells) {
        if (offer.currentBidderId) continue;
        const ref = this.refPrice(offer.itemId, offer.quality, offer.perfection);
        if (ref > 0 && offer.price > ref * 1.3 && this._timeLeftRatio(offer, now) < 0.55) {
          const ok = this.executeCancel(offer, npc.id);
          if (ok && ok.success) {
            this.giveItemToNpc(npc.id, offer.itemId, offer.quantity, offer.quality, offer.perfection);
            state.cooldowns[offer.itemId] = now + this.getMsPerGameDay() * NPC_TUNING.cooldownDays;
            const item = getItemById(offer.itemId);
            return { type: 'cancel', npcId: npc.id, offer, intent: `Retire ${item?.icon || ''} (trop cher)`.trim(), reason: `Annonce ${this._pctTxt(offer.price / ref)} : personne n'achète.` };
          }
        }
      }
    }
    // Offre d'achat devenue trop généreuse après une baisse du marché → récupère son argent
    for (const offer of ownBuys) {
      const ref = this.refPrice(offer.itemId);
      if (ref > 0 && offer.price > ref * 1.2 && offer.quantity > 0) {
        offer.status = 'cancelled';
        this.creditNpc(npc.id, round2(offer.price * offer.quantity));
        const item = getItemById(offer.itemId);
        return { type: 'cancel', npcId: npc.id, offer, intent: `Retire son offre ${item?.icon || ''}`.trim(), reason: `Offre d'achat ${this._pctTxt(offer.price / ref)} : le marché a baissé.` };
      }
    }
    return null;
  },


  _tryBid(npc, state, now = this.getNow()) {
    const spendable = this._spendable(npc, state);
    if (spendable < 8) return null;
    const sellOffers = this.getOffers().filter(o => o.type === 'sell' && o.status === 'active' && o.ownerId !== npc.id && o.currentBidderId !== npc.id && o.quantity > 0);
    if (sellOffers.length === 0) return null;
    const candidates = [];
    for (const offer of sellOffers) {
      if (blocksBuyBack(state, offer.itemId, state.dayHint)) continue;
      const item = getItemById(offer.itemId);
      const ref = this.refPrice(offer.itemId, offer.quality, offer.perfection);
      const preferred = this._isPreferred(npc, item);
      const focused = offer.itemId === state.focusItemId;
      const step = typeof offer.bidStep === 'function' ? offer.bidStep() : 0.01;
      const minBid = typeof offer.minNextBid === 'function' ? offer.minNextBid() : offer.price;
      if (offer.buyoutPrice != null && minBid >= offer.buyoutPrice) continue;
      const vsPlayer = offer.currentBidderId === 'player';
      let capRatio = this.maxBuyRatio(npc, state, item) - 0.03;
      if (vsPlayer) capRatio = Math.min(NPC_TUNING.buyCapMax, capRatio + 0.03 + state.rivalry * 0.05);
      const maxWilling = round2(ref * capRatio);
      if (minBid > maxWilling) continue;
      let bid = minBid;
      const ending = this._timeLeftRatio(offer, now) < 0.16;
      const extraRoll = (npc.personality === 'agressif' || npc.personality === 'opportuniste' || vsPlayer || ending);
      if (extraRoll && Math.random() < (ending ? 0.8 : 0.5)) {
        const extra = step * (vsPlayer || ending ? 2 : 1);
        const bumped = round2(minBid + extra);
        if (bumped <= maxWilling && (offer.buyoutPrice == null || bumped < offer.buyoutPrice)) bid = bumped;
      }
      if (typeof offer.canBidAmount === 'function' && !offer.canBidAmount(bid).ok) continue;
      const total = round2(bid * offer.quantity);
      if (spendable < total) continue;
      candidates.push({ offer, item, ref, bid, total, dealRatio: ref > 0 ? bid / ref : 1, preferred, vsPlayer, ending, focused });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      if (a.ending !== b.ending) return a.ending ? -1 : 1;
      if (a.vsPlayer !== b.vsPlayer) return a.vsPlayer ? -1 : 1;
      if (a.focused !== b.focused) return a.focused ? -1 : 1;
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      return a.dealRatio - b.dealRatio;
    });
    const pick = candidates[0];
    const outbid = pick.offer.currentBidderId;
    const result = this.executeBid(pick.offer, npc.id, pick.bid);
    if (!result || !result.success) return null;
    if (outbid && this.npcStates[outbid]) noteRival(this.npcStates[outbid], npc.id, 1); // le surenchéri s'en souviendra
    if (pick.vsPlayer) this.notePlayerDeal(npc.id, true);
    const icon = pick.item?.icon || '';
    return {
      type: pick.ending ? 'snipe' : 'bid', npcId: npc.id, offer: pick.offer, amount: pick.bid,
      intent: pick.ending ? `Enchère de dernière minute ${icon}` : `Enchérit sur ${icon} ${eur(pick.bid)} €`,
      reason: pick.vsPlayer ? 'Veut vous souffler cette enchère.' : `Enchère ${this._pctTxt(pick.dealRatio)}.`
    };
  },


  _tryFulfillBuy(npc, state) {
    if (state.inventory.length === 0) return null;
    const buyOffers = this.getOffers().filter(o => o.type === 'buy' && o.status === 'active' && o.ownerId !== npc.id && o.quantity > 0);
    if (buyOffers.length === 0) return null;
    const candidates = [];
    for (const slot of state.inventory) {
      if (slot.quantity <= 0) continue;
      const ref = this.refPrice(slot.itemId, slot.quality, slot.perfection);
      for (const buy of buyOffers) {
        if (buy.itemId !== slot.itemId) continue;
        if ((slot.quality ?? 50) < (buy.minQuality ?? 0) || (slot.perfection ?? 50) < (buy.minPerfection ?? 0)) continue;
        const dealRatio = ref > 0 ? buy.price / ref : 1;
        if (dealRatio < this._sellThreshold(npc, state, slot, buy.ownerId)) continue;
        const qty = Math.min(slot.quantity, buy.quantity, npc.personality === 'épicier' ? slot.quantity : 1 + Math.floor(Math.random() * 3));
        if (qty < 1) continue;
        candidates.push({ slot, buy, qty, dealRatio });
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.dealRatio - a.dealRatio);
    const pick = candidates[0];
    const result = this.executeFulfill(pick.buy, npc.id, pick.qty);
    if (!result || !result.success) return null;
    pick.slot.quantity -= pick.qty;
    if (pick.slot.quantity <= 0) state.inventory = state.inventory.filter(s => s !== pick.slot);
    markSold(state, pick.buy.itemId, state.dayHint);
    if (pick.buy.ownerId === 'player') this.notePlayerDeal(npc.id, true);
    const item = getItemById(pick.buy.itemId);
    const dry = this.capitalState(npc, state).id === 'dry';
    return {
      type: 'fulfill', npcId: npc.id, buyOffer: pick.buy, quantity: pick.qty, total: result.transaction?.total,
      intent: `Vend ${item?.icon || ''} ×${pick.qty} sur demande`,
      reason: dry ? 'Besoin de liquidités.' : `Offre d'achat ${this._pctTxt(pick.dealRatio)}.`
    };
  },


  _tryBuyout(npc, state) {
    const spendable = this._spendable(npc, state);
    if (spendable < 5) return null;
    const stockQty = this._stockQty(state);
    const target = this.stockTarget(npc);
    const speculator = npc.personality === 'opportuniste' || npc.personality === 'agressif';
    const sellOffers = this.getOffers().filter(o => o.type === 'sell' && o.status === 'active' && o.buyoutPrice != null && o.ownerId !== npc.id);
    if (sellOffers.length === 0) return null;
    const candidates = sellOffers.map(o => {
      const item = getItemById(o.itemId);
      const ref = this.refPrice(o.itemId, o.quality, o.perfection);
      const preferred = this._isPreferred(npc, item);
      return { offer: o, item, ref, preferred, dealRatio: ref > 0 ? o.buyoutPrice / ref : 9, focused: o.itemId === state.focusItemId, cap: this.maxBuyRatio(npc, state, item) };
    }).filter(c => {
      if (blocksBuyBack(state, c.offer.itemId, state.dayHint)) return false;
      // Réparateur : un objet abîmé vaut la valeur qu'il aura une fois réparé
      if (this.professionOf(npc).repairs && (c.offer.quality ?? 50) < NPC_TUNING.damagedQuality && isRepairable(c.offer.itemId)) {
        const repaired = this.refPrice(c.offer.itemId, 75, Math.min(90, (c.offer.perfection ?? 50) + 15));
        const cost = this.getFairPrice(c.offer.itemId) * NPC_TUNING.repairCostRatio;
        c.repairDeal = c.offer.buyoutPrice + cost <= repaired * 0.8;
        if (c.repairDeal) { c.dealRatio = (c.offer.buyoutPrice + cost) / repaired; return true; }
      }
      if (c.dealRatio > c.cap) return false;
      if (stockQty >= target * 1.6 && c.dealRatio > 0.8) return false;
      if (npc.personality === 'collectionneur') return c.preferred || c.dealRatio < 0.9;
      if (speculator && c.dealRatio < 0.85) return true; // achète ce qui est bradé, même hors spécialité
      return c.preferred || c.focused || c.dealRatio < 0.92;
    }).sort((a, b) => a.dealRatio - b.dealRatio || (b.preferred - a.preferred));
    if (candidates.length === 0) return null;
    const pick = candidates[0];
    const offer = pick.offer;
    const maxByCapital = Math.floor(spendable / offer.buyoutPrice);
    if (maxByCapital < 1) return null;
    const room = Math.max(1, Math.ceil(target * 1.6) - stockQty);
    const qty = Math.min(offer.quantity, maxByCapital, room, npc.personality === 'agressif' ? 3 : 1 + Math.floor(Math.random() * 2));
    const totalCost = round2(offer.buyoutPrice * qty);
    if (state.capital < totalCost) return null;
    state.capital = round2(state.capital - totalCost);
    const result = this.executeBuyout(offer, npc.id, qty);
    if (!result || !result.success) { state.capital = round2(state.capital + totalCost); return null; }
    if (offer.ownerId === 'player') this.notePlayerDeal(npc.id, true);
    const icon = pick.item?.icon || '';
    return {
      type: 'buyout', npcId: npc.id, offer, quantity: qty, total: totalCost,
      intent: pick.repairDeal ? `Rachète ${icon} abîmé pour le réparer` : pick.dealRatio < 0.9 ? `Rafle ${icon} ×${qty} (bradé)` : `Achète ${icon} ×${qty}`,
      reason: pick.repairDeal
        ? `Une fois réparé, il vaudra bien plus que ${eur(pick.offer.buyoutPrice)} €.`
        : `Achat immédiat ${this._pctTxt(pick.dealRatio)}${pick.preferred ? ', dans sa spécialité' : ''}.`
    };
  },


  /**
   * Arbitrage : achète une annonce (achat immédiat) moins chère qu'une offre d'achat existante
   * et revend aussitôt à cette offre. Corrige les écarts entre hôtel de vente et hôtel d'achat.
   */
  _tryArbitrage(npc, state) {
    const spendable = this._spendable(npc, state);
    if (spendable < 10) return null;
    const offers = this.getOffers();
    const buys = offers.filter(o => o.type === 'buy' && o.status === 'active' && o.ownerId !== npc.id && o.quantity > 0);
    if (!buys.length) return null;
    let best = null;
    for (const sell of offers) {
      if (sell.type !== 'sell' || sell.status !== 'active' || sell.ownerId === npc.id || sell.buyoutPrice == null || sell.currentBid != null) continue;
      for (const buy of buys) {
        if (buy.itemId !== sell.itemId || buy.ownerId === sell.ownerId) continue;
        if ((sell.quality ?? 50) < (buy.minQuality ?? 0) || (sell.perfection ?? 50) < (buy.minPerfection ?? 0)) continue;
        const net = buy.price * (1 - 0.03); // taxe du Comptoir sur la revente
        const margin = (net - sell.buyoutPrice) / sell.buyoutPrice;
        if (margin < NPC_TUNING.arbitrageMargin) continue;
        if (!best || margin > best.margin) best = { sell, buy, margin };
      }
    }
    if (!best) return null;
    const qty = Math.min(best.sell.quantity, best.buy.quantity, Math.floor(spendable / best.sell.buyoutPrice), 3);
    if (qty < 1) return null;
    const cost = round2(best.sell.buyoutPrice * qty);
    state.capital = round2(state.capital - cost);
    const bought = this.executeBuyout(best.sell, npc.id, qty);
    if (!bought || !bought.success) { state.capital = round2(state.capital + cost); return null; }
    const slot = state.inventory.find(s => s.itemId === best.sell.itemId && s.quality === best.sell.quality && s.perfection === best.sell.perfection);
    const sold = slot ? this.executeFulfill(best.buy, npc.id, Math.min(qty, slot.quantity)) : null;
    if (sold && sold.success && slot) {
      slot.quantity -= Math.min(qty, slot.quantity);
      state.inventory = state.inventory.filter(s => s.quantity > 0);
    }
    state.arbitrages = (state.arbitrages || 0) + 1;
    const item = getItemById(best.sell.itemId);
    return {
      type: 'arbitrage', npcId: npc.id, offer: best.sell, quantity: qty,
      intent: `Arbitrage ${item?.icon || ''} ${eur(best.sell.buyoutPrice)} → ${eur(best.buy.price)} €`,
      reason: `Achète à l'hôtel de vente et revend aussitôt à une offre d'achat (+${Math.round(best.margin * 100)} %).`
    };
  },


  /** Prix d'annonce : marge de personnalité, signaux de marché, concurrence — borné. */
  listingPrice(npc, state, slot) {
    const profile = this.profileOf(npc);
    const item = getItemById(slot.itemId);
    const preferred = this._isPreferred(npc, item);
    const ref = this.refPrice(slot.itemId, slot.quality, slot.perfection);
    const sig = this.marketSignal(slot.itemId);
    const range = (npc.personality === 'collectionneur' && preferred && profile.prefSellMarkup) ? profile.prefSellMarkup : profile.sellMarkup;
    let mult = rand(range[0], range[1]);
    const why = [];
    if (sig.shortage) { mult += 0.06; why.push(sig.view?.status === 'shortage' ? 'la ville en manque' : 'rupture de stock sur le marché'); }
    else if (sig.anticipate) { mult += 0.03; why.push('anticipe une pénurie'); }
    if (sig.playerFlow >= 2) { mult += Math.min(0.06, sig.playerFlow * 0.01); why.push('vous en achetez beaucoup'); }
    if (sig.playerFlow <= -2) { mult -= Math.min(0.05, -sig.playerFlow * 0.01); why.push('vous en vendez beaucoup'); }
    if (sig.surplus) { mult -= 0.05; why.push('marché saturé'); }
    if (this._overstocked(npc, state)) { mult -= 0.05; why.push('stock trop plein'); }
    if (this.capitalState(npc, state).id === 'dry') { mult -= 0.05; why.push('besoin de liquidités'); }
    let price = ref * mult;
    const comp = sig.book;
    if (comp.bestSell != null && comp.bestSellerId !== npc.id && comp.bestSell >= ref * 0.85 && comp.bestSell < price) {
      const mate = NPCS.find(n => n.id === comp.bestSellerId);
      if (mate && npc.clanId && mate.clanId === npc.clanId && !isPersonalRival(state, comp.bestSellerId)) {
        // Coordination de clan : on ne casse pas les prix d'un membre du même clan, on s'aligne.
        price = comp.bestSell;
        why.push(`s'aligne sur ${this.getNpcName(comp.bestSellerId)} (même clan)`);
        const floor0 = Math.max(NPC_TUNING.listMin, profile.minSell * 0.88);
        price = Math.min(ref * NPC_TUNING.listMax, Math.max(ref * floor0, price));
        return { price: Math.max(0.01, round2(price)), ref, why, clanAligned: true };
      }
      const personal = isPersonalRival(state, comp.bestSellerId);
      const rival = this._isRival(npc, comp.bestSellerId) || personal;
      if (this.npcStates[comp.bestSellerId]) noteRival(this.npcStates[comp.bestSellerId], npc.id, 0.5);
      const undercut = npc.personality === 'agressif' || rival ? 0.98 : 0.995;
      price = comp.bestSell * undercut;
      why.push(personal ? `casse les prix de son rival ${this.getNpcName(comp.bestSellerId)}` : rival ? 'casse les prix du clan rival' : 's\'aligne sur la concurrence');
    }
    const floor = Math.max(NPC_TUNING.listMin, profile.minSell * 0.88);
    price = Math.min(ref * NPC_TUNING.listMax, Math.max(ref * floor, price));
    return { price: Math.max(0.01, round2(price)), ref, why };
  },


  listingFee(price, qty, durationDays) {
    let pct = 0.03;
    if (durationDays === 2) pct = 0.06;
    else if (durationDays === 7) pct = 0.1;
    return round2((price * qty * pct + 0.2) * NPC_TUNING.listingFeeRate);
  },


  _trySell(npc, state) {
    if (state.inventory.length === 0) return null;
    const now = this.getNow();
    const live = this.getOffers().filter(o => o.type === 'sell' && o.status === 'active' && o.ownerId === npc.id);
    const slots = state.inventory.filter(s => s.quantity > 0 && !live.some(o => o.itemId === s.itemId) && !((state.cooldowns[s.itemId] || 0) > now));
    if (!slots.length) return null;
    const ranked = slots.map(slot => {
      const item = getItemById(slot.itemId);
      const preferred = this._isPreferred(npc, item);
      const sig = this.marketSignal(slot.itemId);
      let dumpScore = preferred ? 0 : 1.2;
      if (npc.personality === 'collectionneur' && preferred) dumpScore -= 2;
      if (npc.personality === 'épicier' && item?.category === 'Nourriture') dumpScore += 2;
      if (slot.quality < 40) dumpScore += 1;
      if ((slot.quality ?? 50) < NPC_TUNING.damagedQuality && this.professionOf(npc).repairs && isRepairable(slot.itemId)) dumpScore -= 3;
      if (sig.shortage) dumpScore += sig.view?.status === 'shortage' ? 2 : 1.2;
      // Personne ne vend cet objet : le premier à l'afficher fixe le prix (sauf collection personnelle)
      if (sig.book.sellQty === 0 && !(npc.personality === 'collectionneur' && preferred)) dumpScore += 1.5;
      else if (sig.anticipate && !this.professionOf(npc).arbitrage) dumpScore += 0.5;
      if (sig.surplus) dumpScore -= 0.8;
      if (sig.book.bestBuy != null) {
        const ref = this.refPrice(slot.itemId, slot.quality, slot.perfection);
        if (ref > 0 && sig.book.bestBuy >= ref * 0.98) dumpScore += 1.4;
      }
      if (this._qtyOf(state, slot.itemId) <= 1 && preferred) dumpScore -= 1.5;
      return { slot, item, preferred, dumpScore };
    }).sort((a, b) => b.dumpScore - a.dumpScore);
    const chosen = ranked[0];
    const slot = chosen.slot;
    const item = chosen.item;
    if (!item) return null;
    const { price, ref, why } = this.listingPrice(npc, state, slot);
    const qty = Math.min(slot.quantity, npc.personality === 'épicier' ? 4 : 1 + Math.floor(Math.random() * 3));
    const durationDays = npc.personality === 'épicier' ? 1 : [1, 1, 2, 2, 7][Math.floor(Math.random() * 5)];
    const fee = Math.min(state.capital, this.listingFee(price, qty, durationDays));
    let buyoutPrice = null;
    if (Math.random() < (npc.personality === 'agressif' ? 0.7 : 0.55)) {
      buyoutPrice = round2(Math.min(ref * (NPC_TUNING.listMax + 0.1), price * rand(1.06, 1.2)));
      if (buyoutPrice <= price) buyoutPrice = round2(price * 1.05);
    }
    const offer = new Offer({ type: 'sell', itemId: slot.itemId, quantity: qty, price, buyoutPrice, ownerId: npc.id, durationDays, quality: slot.quality, perfection: slot.perfection, createdAt: now, msPerGameDay: this.getMsPerGameDay() });
    if (fee > 0) {
      state.capital = round2(state.capital - fee);
      this.onNpcSpend(npc.id, fee, 'fees');
    }
    slot.quantity -= qty;
    if (slot.quantity <= 0) state.inventory = state.inventory.filter(s => s !== slot);
    markSold(state, slot.itemId, state.dayHint);
    this.addOffer(offer);
    this.runMatching(offer);
    const ratio = ref > 0 ? price / ref : 1;
    return {
      type: 'sell', npcId: npc.id, offer,
      intent: `Vend ${item.icon} ×${qty} à ${eur(price)} €`,
      reason: `Prix ${this._pctTxt(ratio)}${why.length ? ' — ' + why[0] : ''}.`
    };
  },


  _tryBuy(npc, state) {
    const spendable = this._spendable(npc, state);
    if (spendable < 10) return null;
    const profile = this.profileOf(npc);
    const liveBuys = this.getOffers().filter(o => o.type === 'buy' && o.status === 'active' && o.ownerId === npc.id);
    let pool = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    if (npc.personality === 'artisan') pool = ITEMS.filter(i => i.category === 'Ressources' || i.category === 'Outils');
    if (state.focusItemId) {
      const focus = ITEMS.find(i => i.id === state.focusItemId);
      if (focus && !pool.includes(focus)) pool = [focus, ...pool];
    }
    pool = pool.filter(i => !liveBuys.some(o => o.itemId === i.id) && !blocksBuyBack(state, i.id, state.dayHint));
    if (pool.length === 0) return null;
    const ranked = pool.map(item => {
      const sig = this.marketSignal(item.id);
      let s = Math.random() * 0.2;
      if (item.id === state.focusItemId) s += 0.4;
      if (this._qtyOf(state, item.id) === 0) s += 0.25;
      if (sig.book.bestSell != null && sig.book.bestSell < sig.fair * 0.96) s += 0.3;
      if (sig.surplus) s += 0.15;
      if (sig.anticipate || sig.shortage) s += this.professionOf(npc).arbitrage ? 0.45 : 0.2;
      if (sig.playerFlow >= 3 && this.professionOf(npc).arbitrage) s += 0.3;
      return { item, s, sig };
    }).sort((a, b) => b.s - a.s);
    const { item, sig } = ranked[0];
    const ref = this.refPrice(item.id);
    const cap = this.maxBuyRatio(npc, state, item);
    let mult = rand(profile.buyMarkdown[0], profile.buyMarkdown[1]);
    if (sig.surplus) mult -= 0.04;
    if (sig.anticipate || sig.shortage) mult += 0.04;
    if (sig.playerFlow <= -2) mult -= 0.04;
    let price = ref * Math.min(mult, cap);
    if (sig.book.bestBuy != null && sig.book.bestBuy + 0.01 <= ref * cap) price = Math.max(price, sig.book.bestBuy + 0.01);
    price = round2(Math.max(ref * 0.6, Math.min(ref * cap, price)));
    const room = Math.max(1, this.stockTarget(npc) - this._stockQty(state));
    const maxQty = Math.floor((spendable * 0.7) / price);
    if (maxQty < 1) return null;
    const qty = Math.min(maxQty, room, 1 + Math.floor(Math.random() * 3));
    const totalLocked = round2(price * qty);
    if (state.capital < totalLocked) return null;
    const offer = new Offer({ type: 'buy', itemId: item.id, quantity: qty, price, ownerId: npc.id, durationDays: [1, 1, 2, 2, 7][Math.floor(Math.random() * 5)], createdAt: this.getNow(), msPerGameDay: this.getMsPerGameDay() });
    state.capital = round2(state.capital - totalLocked);
    this.addOffer(offer);
    this.runMatching(offer);
    const lowStock = this._qtyOf(state, item.id) === 0;
    return {
      type: 'buy', npcId: npc.id, offer, locked: totalLocked,
      intent: `Cherche ${item.icon} ×${qty} à ${eur(price)} €`,
      reason: `${sig.anticipate ? 'Achète avant la pénurie' : sig.shortage ? 'La ville en manque' : lowStock ? 'Stock vide sur cet objet' : 'Réassort'} — offre ${this._pctTxt(price / ref)}.`
    };
  },
};
