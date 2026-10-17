/**
 * Negotiation — marchandage direct avec les marchands (PNJ).
 *
 * Acheter : sur une annonce d'un PNJ (sans enchère en cours), le joueur propose un prix
 * sous le prix demandé. Vendre : sur une offre d'achat d'un PNJ, il demande un peu plus.
 *
 * La marge de manœuvre du PNJ dépend de sa confiance envers le joueur, de son humeur, de sa
 * personnalité, de son stock, de sa trésorerie, de l'offre / demande de la ville et du rang
 * du joueur. Garde-fous anti-abus :
 *  - jamais sous 90 % du prix de référence du PNJ (ni sous son prix plancher habituel),
 *  - jamais au-dessus de 104 % du prix de référence ni de son plafond d'achat,
 *  - essais et accords limités par marchand et par jour, offense = confiance en baisse,
 *  - l'argent ne fait que changer de main (aucune création monétaire).
 */

import { NPCS } from '../data/npcs.js';
import { getItemById } from '../data/items.js';
import { Transaction } from '../models/Transaction.js';
import { rankFor, isFeatureUnlocked, lockedMessage } from '../core/Ranks.js';

export const NEGOTIATION_TUNING = {
  baseFlex: 0.03,          // marge de base (3 %)
  trustFlex: 0.07,         // + jusqu'à 7 % avec une confiance maximale
  moodFlex: 0.02,
  surplusFlex: 0.04,       // la ville déborde de cet objet
  shortageFlex: -0.04,     // pénurie : le PNJ ne lâche rien
  overstockFlex: 0.03,
  dryFlex: 0.04,           // trésorerie à sec : il a besoin de vendre
  collectorFlex: -0.05,    // collectionneur sur ses favoris
  maxFlex: 0.16,
  minBuyFlex: 0.08,        // analyse GD passe 2 : un marchandage réussi à l'achat donne au moins −8 % (borné par le plancher)
  floorRef: 0.9,           // jamais sous 90 % du prix de référence
  ceilRef: 1.04,           // jamais au-dessus de 104 % du prix de référence (vente au PNJ)
  sellFlexFactor: 0.6,     // un PNJ acheteur lâche moins qu'un PNJ vendeur
  counterBand: 0.08,       // proposition à moins de 8 % du plancher → contre-offre
  insultRatio: 0.85,       // sous 85 % du plancher → offense
  insultTrust: 0.05,
  dealsPerNpc: 2,          // accords par marchand et par jour
  noBuyoutMarkup: 1.1,     // annonce sans achat immédiat : prix demandé = départ + 10 % (min. référence)
  bundleFlex: 0.02,        // lot entier (3+) : +2 % de marge
  bundleMinQty: 3,
  bluffFlex: 0.005,        // chaque « bluff » mémorisé retire 0,5 % de marge…
  bluffFlexMax: 0.03,      // … jusqu'à 3 %
  bluffDecay: 0.7,         // la mémoire s'estompe chaque jour
  dealFlex: 0.004,         // un bon client (accords passés) gagne un peu de marge…
  dealFlexMax: 0.02,       // … jusqu'à 2 %
  chanceSigma: 0.015       // incertitude de l'estimation de chance (± 1,5 % du prix)
};

/** Styles de marchandage (selon la personnalité). Concessions décroissantes : first × decay^(tour−1). */
export const HAGGLE_STYLES = {
  stubborn: { id: 'stubborn', label: 'Têtu', icon: '🪨', patience: 3, first: 0.3, decay: 0.45, text: 'Lâche peu et de moins en moins ; n\'aime pas les offres basses.' },
  generous: { id: 'generous', label: 'Arrangeant', icon: '😊', patience: 5, first: 0.55, decay: 0.7, text: 'Fait de vraies concessions et garde patience.' },
  greedy: { id: 'greedy', label: 'Gourmand', icon: '🦊', patience: 4, first: 0.35, decay: 0.55, text: 'Discute volontiers mais ses contre-offres restent hautes.' },
  impatient: { id: 'impatient', label: 'Pressé', icon: '⏱️', patience: 3, first: 0.6, decay: 0.5, text: 'Cède vite au début puis coupe court.' }
};
const STYLE_BY_PERSONALITY = { prudent: 'stubborn', collectionneur: 'stubborn', 'épicier': 'generous', artisan: 'generous', agressif: 'greedy', opportuniste: 'impatient' };
export function styleFor(npc) { return HAGGLE_STYLES[STYLE_BY_PERSONALITY[npc?.personality]] || HAGGLE_STYLES.greedy; }

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function hashNoise(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (((h >>> 0) % 2001) / 1000 - 1) * 0.01; // ±1 %
}

export class Negotiation {
  constructor(game, saved = {}) {
    this.game = game;
    this.byNpc = saved.byNpc || {};
    this.counters = saved.counters || {};
    this.sessions = saved.sessions || {};   // offerId → { day, rounds[], patience, npcPrice, walked }
    this.memory = saved.memory || {};       // npcId → { bluffs, deals, insults, day }
    this.journal = Array.isArray(saved.journal) ? saved.journal : []; // carnet de marchandage (40 derniers)
    this.stats = {
      attempts: 0, deals: 0, buyDeals: 0, sellDeals: 0, refused: 0, insults: 0, saved: 0, extra: 0,
      ...(saved.stats || {})
    };
  }

  _day() {
    return this.game.timeManager?.getCurrentDay?.() ?? this.game.currentDay ?? 1;
  }

  _npcDay(npcId) {
    const day = this._day();
    let s = this.byNpc[npcId];
    if (!s || s.day !== day) {
      s = this.byNpc[npcId] = { day, tries: 0, deals: 0 };
    }
    return s;
  }

  /** Mémoire du marchand sur le joueur (bluffs, accords), estompée chaque jour. */
  _memory(npcId) {
    const day = this._day();
    let m = this.memory[npcId];
    if (!m) m = this.memory[npcId] = { bluffs: 0, deals: 0, insults: 0, day };
    if (m.day !== day) {
      const k = Math.pow(NEGOTIATION_TUNING.bluffDecay, Math.max(0, day - m.day));
      m.bluffs = Math.round(m.bluffs * k * 100) / 100;
      m.insults = Math.round(m.insults * k * 100) / 100;
      m.day = day;
    }
    return m;
  }

  /** Séance de marchandage du jour sur une offre. */
  _session(offerId, npc) {
    const day = this._day();
    let s = this.sessions[offerId];
    if (!s || s.day !== day) {
      const style = styleFor(npc);
      const mem = this._memory(npc.id);
      const patience = Math.max(2, style.patience - (mem.bluffs >= 3 ? 1 : 0) + (mem.deals >= 3 ? 1 : 0));
      s = this.sessions[offerId] = { day, rounds: [], patience, patienceMax: patience, npcPrice: null, walked: false };
    }
    return s;
  }

  _rank() {
    return rankFor(this.game.player?.reputation || 0);
  }

  triesPerDay() {
    return this._rank().haggleTries;
  }

  triesLeft(npcId) {
    return Math.max(0, this.triesPerDay() - this._npcDay(npcId).tries);
  }

  dealsLeft(npcId) {
    return Math.max(0, NEGOTIATION_TUNING.dealsPerNpc - this._npcDay(npcId).deals);
  }

  /** Marge de manœuvre (0–16 %) et ses raisons, lisibles par le joueur. */
  flexFor(npc, state, itemId, kind, bundle = false, tactic = null) {
    const T = NEGOTIATION_TUNING;
    const ctl = this.game.npcController;
    const reasons = [];
    let flex = T.baseFlex;
    const trust = Math.max(-1, Math.min(1, state.trust || 0));
    if (trust > 0) { flex += T.trustFlex * trust; reasons.push(`confiance +${Math.round(trust * 100)}`); }
    else if (trust < 0) { flex += T.trustFlex * trust * 0.5; reasons.push(`méfiance ${Math.round(trust * 100)}`); }
    flex += T.moodFlex * (state.mood || 0);
    if ((state.mood || 0) > 0.35) reasons.push('de bonne humeur');
    if ((state.mood || 0) < -0.35) reasons.push('de mauvaise humeur');
    const signal = ctl.marketSignal ? ctl.marketSignal(itemId) : null;
    const status = signal?.view?.status;
    if (kind === 'buy') {
      if (status === 'surplus' || signal?.surplus) { flex += T.surplusFlex; reasons.push('la ville en déborde'); }
      if (status === 'shortage') { flex += T.shortageFlex; reasons.push('pénurie : il ne lâche rien'); }
      else if (status === 'tight') { flex += T.shortageFlex / 2; reasons.push('stock tendu'); }
      if (ctl._overstocked?.(npc, state)) { flex += T.overstockFlex; reasons.push('trop de stock'); }
      if (ctl.capitalState?.(npc, state)?.id === 'dry') { flex += T.dryFlex; reasons.push('besoin de liquidités'); }
      const item = getItemById(itemId);
      if (npc.personality === 'collectionneur' && ctl._isPreferred?.(npc, item)) { flex += T.collectorFlex; reasons.push('pièce de collection'); }
    } else {
      if (status === 'shortage') { flex += T.surplusFlex; reasons.push('pénurie : il en a besoin'); }
      else if (status === 'tight') { flex += T.surplusFlex / 2; reasons.push('stock tendu en ville'); }
      if (status === 'surplus') { flex -= T.surplusFlex; reasons.push('la ville en déborde'); }
      if (ctl.capitalState?.(npc, state)?.id === 'dry') { flex -= T.dryFlex; reasons.push('trésorerie à sec'); }
    }
    const rank = this._rank();
    if (rank.haggleBonus) { flex += rank.haggleBonus; reasons.push(`rang ${rank.title} ${rank.haggleBonus > 0 ? '+' : ''}${Math.round(rank.haggleBonus * 100)} %`); }
    if (personalityBonus[npc.personality]) flex += personalityBonus[npc.personality];
    // Analyse GD passe 2 : à l'achat, la marge de base est d'au moins 8 % ; la mémoire du marchand
    // (offres trop basses / bon client), le lot entier et les arguments s'appliquent ensuite
    if (kind === 'buy' && flex < T.minBuyFlex) { flex = T.minBuyFlex; reasons.push('marchandage : au moins −8 %'); }
    const mem = this._memory(npc.id);
    if (mem.bluffs > 0.5) { const f = Math.min(T.bluffFlexMax, mem.bluffs * T.bluffFlex); flex -= f; reasons.push(`se souvient de vos offres trop basses −${(f * 100).toFixed(1).replace('.', ',')} %`); }
    if (mem.deals > 0) { const f = Math.min(T.dealFlexMax, mem.deals * T.dealFlex); flex += f; if (f >= 0.004) reasons.push('bon client'); }
    if (bundle) { flex += T.bundleFlex; reasons.push('lot entier : +2 %'); }
    if (tactic && tactic.bonus > 0) { flex += tactic.bonus; reasons.push(`argument « ${TACTICS[tactic.id]?.label || tactic.id} » +${(tactic.bonus * 100).toFixed(1).replace('.', ',')} %`); }
    if (kind === 'sell') flex *= T.sellFlexFactor;
    flex = Math.max(0, Math.min(T.maxFlex, flex));
    return { flex, reasons };
  }

  flexLabel(flex) {
    if (flex < 0.035) return 'très faible';
    if (flex < 0.065) return 'faible';
    if (flex < 0.1) return 'moyenne';
    return 'large';
  }

  _context(offerId) {
    const game = this.game;
    const offer = (game.offers || []).find(o => o.id === offerId);
    if (!offer || offer.status !== 'active' || offer.quantity <= 0) return { error: 'Offre introuvable ou terminée' };
    if (offer.ownerId === 'player') return { error: 'C\'est votre propre offre' };
    if (offer.ownerId === 'city') return { error: 'Le Comptoir municipal applique des prix fixes : pas de marchandage' };
    const npc = NPCS.find(n => n.id === offer.ownerId);
    const state = npc ? game.npcController.npcStates[npc.id] : null;
    if (!npc || !state) return { error: 'Marchand introuvable' };
    const item = getItemById(offer.itemId);
    const kind = offer.type === 'sell' ? 'buy' : 'sell';
    return { offer, npc, state, item, kind };
  }

  /** Prix limite du PNJ (plancher à l'achat, plafond à la vente). */
  _isBundle(ctx, qty) {
    return ctx.kind === 'buy' && qty >= NEGOTIATION_TUNING.bundleMinQty && qty === ctx.offer.quantity;
  }

  _limit(ctx, qty = 1) {
    const T = NEGOTIATION_TUNING;
    const { offer, npc, state, kind } = ctx;
    const ctl = this.game.npcController;
    const q = offer.quality ?? 50;
    const p = offer.perfection ?? 50;
    const ref = ctl.refPrice(offer.itemId, kind === 'buy' ? q : (offer.minQuality || 50), kind === 'buy' ? p : (offer.minPerfection || 50));
    const sess = this.sessions[offer.id];
    const tactic = sess && sess.day === this._day() ? sess.tactic : null;
    const { flex, reasons } = this.flexFor(npc, state, offer.itemId, kind, this._isBundle(ctx, qty), tactic);
    const noise = hashNoise(`${npc.id}|${offer.id}|${this._day()}`);
    if (kind === 'buy') {
      const ask = this.askPrice(offer, ref);
      const minSell = ctl.profileOf(npc).minSell || 0.9;
      const hardFloor = r2(ref * Math.max(T.floorRef, minSell * 0.92));
      const limit = r2(Math.min(ask, Math.max(hardFloor, ask * (1 - flex) * (1 + noise))));
      const estimate = r2(Math.min(ask, Math.max(hardFloor, ask * (1 - flex))));
      return { ref, ask, limit, estimate, flex, reasons, hardFloor };
    }
    const bid = offer.price;
    const cap = r2(ref * Math.min(T.ceilRef, ctl.maxBuyRatio(npc, state, ctx.item)));
    const limit = r2(Math.max(bid, Math.min(cap, bid * (1 + flex) * (1 + noise))));
    const estimate = r2(Math.max(bid, Math.min(cap, bid * (1 + flex))));
    return { ref, ask: bid, limit, estimate, flex, reasons, hardFloor: cap };
  }

  /** Prix demandé pour une vente immédiate. */
  askPrice(offer, ref) {
    if (offer.buyoutPrice != null) return r2(offer.buyoutPrice);
    return r2(Math.max(offer.price * NEGOTIATION_TUNING.noBuyoutMarkup, Math.min(ref, offer.price * 1.25)));
  }

  /** Vue préparatoire pour le modal (n'expose pas la limite exacte). */
  quote(offerId) {
    const ctx = this._context(offerId);
    if (ctx.error) return { ok: false, error: ctx.error };
    const { offer, npc, state, item, kind } = ctx;
    const lim = this._limit(ctx);
    const game = this.game;
    const day = this._npcDay(npc.id);
    const avg = game.economy.getAveragePrice(offer.itemId);
    let blocked = null;
    let haggleBlocked = null;
    if (kind === 'buy' && offer.currentBid != null) blocked = 'Une enchère est en cours : attendez la fin ou surenchérissez';
    if (!this.unlocked()) haggleBlocked = lockedMessage('haggle');
    else if (this.triesLeft(npc.id) <= 0) haggleBlocked = `${npc.name} ne veut plus discuter aujourd'hui`;
    else if (this.dealsLeft(npc.id) <= 0) haggleBlocked = `Déjà ${NEGOTIATION_TUNING.dealsPerNpc} accords avec ${npc.name} aujourd'hui`;
    let maxQty = offer.quantity;
    if (kind === 'sell') {
      maxQty = Math.min(offer.quantity, this._eligibleQty(offer));
      if (!blocked && maxQty <= 0) blocked = offer.minQuality ? `Il vous faut cet objet en état Q${offer.minQuality}+` : 'Vous n\'avez pas cet objet';
    }
    const counter = this.counters[offerId] && this.counters[offerId].day === this._day() ? this.counters[offerId].price : null;
    const step = kind === 'buy' ? -1 : 1;
    const suggestions = [0.03, 0.06, 0.1].map(pct => r2(lim.ask * (1 + step * pct)));
    const session = this._session(offerId, npc);
    const style = styleFor(npc);
    const mem = this._memory(npc.id);
    if (session.walked && !haggleBlocked) haggleBlocked = `${npc.name} a coupé court sur cette offre aujourd'hui`;
    const fair = this.fairPrice(ctx, lim);
    const bundleQty = kind === 'buy' && offer.quantity >= NEGOTIATION_TUNING.bundleMinQty ? offer.quantity : null;
    const tell = this.tell(ctx, session);
    const tactics = Object.values(TACTICS).filter(t => t.kinds.includes(kind)).map(t => ({ id: t.id, label: t.label, icon: t.icon, text: t.text, risk: t.risk }));
    return {
      tell,
      tactics,
      tacticUsed: session.tactic ? { ...session.tactic, label: TACTICS[session.tactic.id]?.label } : null,
      history: this.getJournal(npc.id, 4),
      ok: true,
      kind,
      offerId,
      npcId: npc.id,
      npcName: npc.name,
      personality: npc.personality,
      itemId: offer.itemId,
      itemName: item?.name || offer.itemId,
      icon: item?.icon || '',
      quality: offer.quality,
      perfection: offer.perfection,
      quantity: offer.quantity,
      maxQty,
      ask: lim.ask,
      ref: r2(lim.ref),
      average: avg,
      trust: state.trust || 0,
      mood: state.mood || 0,
      flex: lim.flex,
      flexLabel: this.flexLabel(lim.flex),
      flexPct: Math.round(lim.flex * 100),
      reasons: lim.reasons,
      triesLeft: this.triesLeft(npc.id),
      triesPerDay: this.triesPerDay(),
      dealsLeft: this.dealsLeft(npc.id),
      counter,
      noRoom: lim.limit >= lim.ask - 0.005,
      suggestions,
      blocked,
      haggleBlocked,
      triesUsed: day.tries,
      style: { id: style.id, label: style.label, icon: style.icon, text: style.text },
      patience: session.walked ? 0 : session.patience,
      patienceMax: session.patienceMax,
      walked: session.walked,
      rounds: session.rounds.map(r => ({ ...r })),
      memory: { bluffs: mem.bluffs, deals: mem.deals },
      fair: fair.price,
      fairReasons: fair.reasons,
      suggested: this.suggestPrice(offerId, 0.7),
      bundleQty,
      bundleFlexPct: Math.round(NEGOTIATION_TUNING.bundleFlex * 100)
    };
  }

  /** Prix juste conseillé : la référence, ramenée dans la fourchette du marchand, avec les raisons. */
  fairPrice(ctx, lim = this._limit(ctx)) {
    const reasons = [];
    const ref = lim.ref;
    let price;
    if (ctx.kind === 'buy') {
      price = Math.min(lim.ask, Math.max(lim.hardFloor, ref));
      reasons.push(lim.ask > ref * 1.02 ? `il demande ${Math.round((lim.ask / ref - 1) * 100)} % au-dessus de la valeur de référence` : 'prix demandé proche de la valeur de référence');
    } else {
      price = Math.max(lim.ask, Math.min(lim.hardFloor, ref));
      reasons.push(lim.ask < ref * 0.98 ? `son offre est ${Math.round((1 - lim.ask / ref) * 100)} % sous la valeur de référence` : 'offre proche de la valeur de référence');
    }
    const sig = this.game.npcController.marketSignal?.(ctx.offer.itemId);
    const status = sig?.view?.status;
    if (status === 'shortage') reasons.push('pénurie en ville : les prix tiennent');
    else if (status === 'surplus') reasons.push('la ville en déborde : prix en baisse');
    return { price: r2(price), reasons };
  }

  /**
   * Chance estimée (0–1) qu'un prix soit accepté. Basée sur la marge estimée du marchand,
   * sans connaître son humeur exacte du jour (± 1,5 %).
   */
  estimateChance(offerId, price, qty = 1) {
    const ctx = this._context(offerId);
    if (ctx.error) return { chance: 0, label: '—', zone: 'error' };
    const lim = this._limit(ctx, Math.max(1, Math.floor(qty) || 1));
    const p = Number(price) || 0;
    const session = this._session(offerId, ctx.npc);
    if (Math.abs(p - lim.ask) < 0.005) return { chance: 1, label: 'Prix demandé : accord immédiat', zone: 'ask' };
    if (ctx.kind === 'buy' && p > lim.ask) return { chance: 1, label: 'Au-dessus du prix demandé', zone: 'ask' };
    if (ctx.kind === 'sell' && p < lim.ask) return { chance: 1, label: 'Sous son offre', zone: 'ask' };
    if (session.walked) return { chance: 0, label: 'Il a coupé court aujourd\'hui', zone: 'walked' };
    const sigma = Math.max(0.01, lim.ask * NEGOTIATION_TUNING.chanceSigma);
    const x = ctx.kind === 'buy' ? (p - lim.estimate) / sigma : (lim.estimate - p) / sigma;
    const chance = 1 / (1 + Math.exp(-1.7 * x));
    const gap = ctx.kind === 'buy' ? (lim.estimate - p) / lim.ask : (p - lim.estimate) / lim.ask;
    const insult = ctx.kind === 'buy' ? p < lim.estimate * NEGOTIATION_TUNING.insultRatio : p > lim.estimate / NEGOTIATION_TUNING.insultRatio;
    let zone = 'likely';
    if (chance < 0.5) zone = insult ? 'insult' : gap <= NEGOTIATION_TUNING.counterBand ? 'counter' : 'refuse';
    const label = chance >= 0.8 ? 'Très probable' : chance >= 0.5 ? 'Probable' : zone === 'counter' ? 'Contre-offre probable' : zone === 'insult' ? 'Risque de le vexer' : 'Refus probable';
    return { chance: Math.round(chance * 100) / 100, label, zone };
  }

  /** Prix qui atteint environ la chance visée. */
  suggestPrice(offerId, target = 0.7, qty = 1) {
    const ctx = this._context(offerId);
    if (ctx.error) return null;
    const lim = this._limit(ctx, qty);
    const sigma = Math.max(0.01, lim.ask * NEGOTIATION_TUNING.chanceSigma);
    const x = Math.log(target / (1 - target)) / 1.7;
    const raw = ctx.kind === 'buy' ? lim.estimate + x * sigma : lim.estimate - x * sigma;
    return ctx.kind === 'buy' ? r2(Math.min(lim.ask, raw)) : r2(Math.max(lim.ask, raw));
  }

  /**
   * « Langage corporel » : un indice sur l'humeur cachée du jour (le bruit de sa limite),
   * sa trésorerie ou sa patience. Ne donne jamais le prix exact.
   */
  tell(ctx, session = this._session(ctx.offer.id, ctx.npc)) {
    const { npc, state, offer, kind } = ctx;
    const noise = hashNoise(`${npc.id}|${offer.id}|${this._day()}`);
    const ctl = this.game.npcController;
    if (session.walked) return { icon: '🚪', text: `${npc.name} range déjà ses affaires.` };
    if (session.patience <= 1) return { icon: '⏳', text: 'Il tapote le comptoir : sa patience est à bout.' };
    if (kind === 'buy' && ctl.capitalState?.(npc, state)?.id === 'dry') return { icon: '💸', text: 'Il recompte sa caisse : il a besoin de vendre.' };
    // bruit < 0 à l'achat = limite plus basse aujourd'hui (plus de marge) ; l'inverse à la vente
    const favorable = kind === 'buy' ? noise < -0.004 : noise > 0.004;
    const hostile = kind === 'buy' ? noise > 0.004 : noise < -0.004;
    if (favorable) return { icon: '😏', text: 'Il évite votre regard : il a peut-être un peu de marge aujourd\'hui.' };
    if (hostile) return { icon: '🧐', text: 'Il croise les bras : pas d\'humeur à céder aujourd\'hui.' };
    if ((state.mood || 0) > 0.35) return { icon: '😄', text: 'Il plaisante avec vous : bon moment pour discuter.' };
    if ((state.mood || 0) < -0.35) return { icon: '😠', text: 'Il soupire : mieux vaut ne pas le brusquer.' };
    return { icon: '🙂', text: 'Il attend votre proposition, impassible.' };
  }

  /**
   * Argument de marchandage (un par séance, coûte 1 de patience). Vrai → marge en plus ;
   * faux ou mal venu → il le prend mal (mémoire, confiance, patience).
   */
  useTactic(offerId, tacticId, qty = 1) {
    const ctx = this._context(offerId);
    if (ctx.error) return { success: false, error: ctx.error };
    const t = TACTICS[tacticId];
    if (!t || !t.kinds.includes(ctx.kind)) return { success: false, error: 'Argument inconnu' };
    const { npc, state, offer, kind } = ctx;
    const session = this._session(offerId, npc);
    if (session.walked) return { success: false, error: `${npc.name} a coupé court aujourd'hui` };
    if (session.tactic) return { success: false, error: 'Un seul argument par discussion' };
    if (!this.unlocked()) return { success: false, locked: true, error: lockedMessage('haggle') };
    if (this.triesLeft(npc.id) <= 0) return { success: false, error: `${npc.name} ne veut plus discuter aujourd'hui` };
    const mem = this._memory(npc.id);
    const style = styleFor(npc);
    const lim = this._limit(ctx, qty);
    let valid = false; let bonus = 0; let why = '';
    if (tacticId === 'competitor') {
      const others = (this.game.offers || []).filter(o => o.status === 'active' && o.type === 'sell' && o.itemId === offer.itemId && o.id !== offer.id && o.ownerId !== npc.id && o.ownerId !== 'player' && o.quantity > 0);
      const cheapest = others.map(o => ({ o, ask: o.buyoutPrice ?? (o.currentBid ?? o.price) })).filter(x => (x.o.quality ?? 50) >= (offer.quality ?? 50) - 10).sort((a, b) => a.ask - b.ask)[0];
      if (cheapest && cheapest.ask < lim.ask) { valid = true; bonus = Math.min(0.03, (lim.ask - cheapest.ask) / lim.ask); why = `${this.game.getNpcName?.(cheapest.o.ownerId) || 'un concurrent'} le vend ${cheapest.ask.toFixed(2).replace('.', ',')} €`; }
      else why = 'personne ne le vend moins cher';
    } else if (tacticId === 'bulk') {
      valid = qty >= 2; bonus = valid ? 0.01 : 0; why = valid ? `${qty} unités d'un coup` : 'une seule unité';
    } else if (tacticId === 'loyalty') {
      valid = mem.deals >= 2 || (state.trust || 0) >= 0.3; bonus = valid ? 0.015 : 0; why = valid ? 'vous êtes un habitué' : 'il ne vous connaît pas assez';
    } else if (tacticId === 'defect') {
      valid = (offer.quality ?? 50) < 60; bonus = valid ? Math.min(0.03, (60 - (offer.quality ?? 50)) / 1000 + 0.015) : 0; why = valid ? `état Q${offer.quality}` : `état Q${offer.quality} : rien à redire`;
    } else if (tacticId === 'urgent') {
      // vente : « il en a besoin » — vrai en pénurie / tendu
      const status = this.game.npcController.marketSignal?.(offer.itemId)?.view?.status;
      valid = status === 'shortage' || status === 'tight'; bonus = valid ? 0.02 : 0; why = valid ? 'la ville en manque' : 'la ville n\'en manque pas';
    }
    bonus = r2(bonus * (style.id === 'stubborn' ? 0.5 : style.id === 'generous' ? 1.3 : 1) * 10000) / 10000;
    session.patience -= 1;
    const dayState = this._npcDay(npc.id);
    dayState.tries += 1;
    this.stats.attempts += 1;
    this.stats.tactics = (this.stats.tactics || 0) + 1;
    let message;
    if (valid) {
      session.tactic = { id: tacticId, valid: true, bonus };
      message = `${npc.name} : ${pickStyled(TACTIC_OK, style.id)} (${why} · marge +${(bonus * 100).toFixed(1).replace('.', ',')} %)`;
    } else {
      session.tactic = { id: tacticId, valid: false, bonus: 0 };
      mem.bluffs = Math.round((mem.bluffs + 1) * 100) / 100;
      state.trust = Math.max(-1, (state.trust || 0) - (t.risk === 'élevé' ? 0.05 : 0.03));
      state.mood = Math.max(-1, (state.mood || 0) - 0.05);
      if (t.risk === 'élevé') session.patience -= 1;
      message = `${npc.name} : ${pickStyled(TACTIC_KO, style.id)} (${why} · confiance en baisse)`;
    }
    if (session.patience <= 0) session.walked = true;
    session.rounds.push({ price: null, outcome: valid ? 'tactic' : 'tactic-ko', tactic: tacticId });
    this._log({ npcId: npc.id, itemId: offer.itemId, kind, outcome: valid ? 'argument' : 'argument raté', tactic: tacticId });
    this.game.save?.();
    return { success: true, valid, bonus, message, walked: session.walked, patience: Math.max(0, session.patience) };
  }

  _log(entry) {
    this.journal.unshift({ day: this._day(), ...entry });
    if (this.journal.length > 40) this.journal.length = 40;
  }

  /** Carnet de marchandage (le plus récent d'abord), éventuellement filtré par marchand. */
  getJournal(npcId = null, limit = 40) {
    return this.journal.filter(j => !npcId || j.npcId === npcId).slice(0, limit).map(j => ({ ...j, npcName: this.game.getNpcName?.(j.npcId) || j.npcId, itemName: getItemById(j.itemId)?.name || j.itemId, icon: getItemById(j.itemId)?.icon || '' }));
  }

  _eligibleQty(offer) {
    const minQ = offer.minQuality ?? 0;
    const minP = offer.minPerfection ?? 0;
    return this.game.player.inventory.items
      .filter(s => s.itemId === offer.itemId && (s.quality ?? 50) >= minQ && (s.perfection ?? 50) >= minP)
      .reduce((t, s) => t + s.quantity, 0);
  }

  /**
   * Propose un prix unitaire.
   * @returns {{success:boolean, outcome:'accepted'|'counter'|'refused', message:string, price?:number, counter?:number}}
   */
  /** Le marchandage se débloque au rang 1 (analyse GD passe 2). */
  unlocked() {
    return isFeatureUnlocked('haggle', this.game.player?.reputation || 0);
  }

  propose(offerId, price, quantity = 1, { acceptCounter = false } = {}) {
    const T = NEGOTIATION_TUNING;
    const ctx = this._context(offerId);
    if (ctx.error) return { success: false, error: ctx.error };
    const { offer, npc, state, kind } = ctx;
    const p = r2(Number(String(price).replace(',', '.')));
    const qty = Math.floor(Number(quantity));
    if (!(p > 0)) return { success: false, error: 'Prix invalide' };
    if (!(qty > 0) || qty > offer.quantity) return { success: false, error: 'Quantité invalide' };
    if (kind === 'buy' && offer.currentBid != null) return { success: false, error: 'Une enchère est en cours sur cette annonce' };
    const lim = this._limit(ctx, qty);
    const session = this._session(offerId, npc);
    const mem = this._memory(npc.id);
    const style = styleFor(npc);
    if (kind === 'buy' && p > lim.ask + 0.005) return { success: false, error: `Inutile de payer plus que le prix demandé (${lim.ask.toFixed(2)} €)` };
    if (kind === 'sell' && p < lim.ask - 0.005) return { success: false, error: `Son offre est déjà de ${lim.ask.toFixed(2)} € : demandez au moins autant` };
    const direct = Math.abs(p - lim.ask) < 0.005;
    if (!direct && !this.unlocked()) return { success: false, locked: true, error: lockedMessage('haggle') };
    if (!direct && this.dealsLeft(npc.id) <= 0) return { success: false, error: `Déjà ${T.dealsPerNpc} accords avec ${npc.name} aujourd'hui — achat au prix demandé seulement` };

    const counterEntry = this.counters[offerId];
    const isCounter = acceptCounter && counterEntry && counterEntry.day === this._day() && Math.abs(counterEntry.price - p) < 0.005;
    const dayState = this._npcDay(npc.id);
    if (!isCounter && !direct && session.walked) return { success: false, error: `${npc.name} a coupé court : achat au prix demandé ou acceptez sa dernière contre-offre` };
    if (!isCounter && !direct) {
      if (dayState.tries >= this.triesPerDay()) return { success: false, error: `${npc.name} ne veut plus discuter aujourd'hui` };
      dayState.tries += 1;
      this.stats.attempts += 1;
    }

    // Vérifications de faisabilité avant de conclure
    const feasible = (unit) => {
      const total = r2(unit * qty);
      if (kind === 'buy') {
        if (this.game.player.money < total) return `Fonds insuffisants (${total.toFixed(2)} €)`;
        if (!this.game.player.inventory.canAdd(offer.itemId, qty, offer.quality, offer.perfection)) return 'Inventaire plein';
      } else {
        if (this._eligibleQty(offer) < qty) return offer.minQuality ? `Il faut ${qty} objet(s) en état Q${offer.minQuality}+` : 'Pas assez d\'objets dans le sac';
        const extra = r2((unit - offer.price) * qty);
        if (extra > (state.capital || 0)) return `${npc.name} n'a pas assez de trésorerie pour payer plus`;
      }
      return null;
    };

    const accepted = direct || isCounter || (kind === 'buy' ? p >= lim.limit : p <= lim.limit);
    if (accepted) {
      const err = feasible(p);
      if (err) {
        if (!isCounter && !direct) { dayState.tries -= 1; this.stats.attempts -= 1; }
        return { success: false, error: err };
      }
      const tx = kind === 'buy' ? this._executeBuy(ctx, p, qty) : this._executeSell(ctx, p, qty);
      if (!tx) return { success: false, error: 'La transaction a échoué' };
      if (direct) {
        // Au prix demandé : simple achat / vente direct, ce n'est pas un marchandage
        this.game.save?.();
        this.game._notifyUI?.();
        return { success: true, outcome: 'accepted', direct: true, price: p, quantity: qty, gain: 0, transaction: tx, message: `${npc.name} : « Affaire conclue. »` };
      }
      dayState.deals += 1;
      delete this.counters[offerId];
      session.rounds.push({ price: p, outcome: 'accepted' });
      this._log({ npcId: npc.id, itemId: offer.itemId, kind, outcome: 'accord', price: p, ask: lim.ask, qty, gain: r2(Math.abs(lim.ask - p) * qty), tactic: session.tactic?.valid ? session.tactic.id : null });
      mem.deals = Math.min(10, mem.deals + 1);
      this.stats.deals += 1;
      const gain = r2(Math.abs(lim.ask - p) * qty);
      if (kind === 'buy') { this.stats.buyDeals += 1; this.stats.saved = r2(this.stats.saved + gain); }
      else { this.stats.sellDeals += 1; this.stats.extra = r2(this.stats.extra + gain); }
      this.game.save?.();
      this.game._notifyUI?.();
      return {
        success: true, outcome: 'accepted', price: p, quantity: qty, gain, transaction: tx,
        message: pickLine(ACCEPT_LINES, npc, p, kind, style.id, session.rounds.length)
      };
    }

    // Contre-offre si la proposition est proche : concessions de plus en plus petites
    const gap = kind === 'buy' ? (lim.limit - p) / lim.ask : (p - lim.limit) / lim.ask;
    const insult = kind === 'buy' ? p < lim.limit * T.insultRatio : p > lim.limit / T.insultRatio;
    session.patience -= insult ? 2 : 1;
    const walkAway = session.patience <= 0;
    if (walkAway) session.walked = true;
    if (gap <= T.counterBand && !insult) {
      const round = session.rounds.filter(r => r.outcome === 'counter').length + 1;
      const share = Math.min(0.9, style.first * Math.pow(style.decay, round - 1));
      const prev = session.npcPrice ?? lim.ask;
      let counter = kind === 'buy'
        ? r2(prev - (prev - lim.limit) * share)
        : r2(prev + (lim.limit - prev) * share);
      counter = kind === 'buy' ? Math.max(lim.limit, Math.min(lim.ask - 0.01, counter)) : Math.min(lim.limit, Math.max(lim.ask + 0.01, counter));
      counter = r2(counter);
      const concession = r2(Math.abs(prev - counter));
      session.npcPrice = counter;
      session.rounds.push({ price: p, outcome: 'counter', counter, concession });
      this.counters[offerId] = { price: counter, day: this._day() };
      this.game.save?.();
      const tail = walkAway ? ' (dernière offre : il ne discutera plus aujourd\'hui)' : round >= 2 ? ` (il ne lâche plus que ${concession.toFixed(2).replace('.', ',')} €)` : '';
      return {
        success: true, outcome: 'counter', price: p, counter, concession, round, walked: walkAway,
        message: pickLine(walkAway ? LAST_LINES : round >= 2 ? COUNTER2_LINES : COUNTER_LINES, npc, counter, kind, style.id, round) + tail,
        triesLeft: this.triesLeft(npc.id), patience: Math.max(0, session.patience)
      };
    }

    // Refus (offense si la proposition est très éloignée) — le marchand s'en souvient
    this.stats.refused += 1;
    mem.bluffs = Math.round((mem.bluffs + (insult ? 1 : 0.5)) * 100) / 100;
    if (insult) {
      this.stats.insults += 1;
      mem.insults = Math.round((mem.insults + 1) * 100) / 100;
      state.trust = Math.max(-1, (state.trust || 0) - T.insultTrust);
      state.mood = Math.max(-1, (state.mood || 0) - 0.05);
    }
    session.rounds.push({ price: p, outcome: insult ? 'insult' : 'refused' });
    if (insult || walkAway) this._log({ npcId: npc.id, itemId: offer.itemId, kind, outcome: insult ? 'vexé' : 'a coupé court', price: p, ask: lim.ask });
    this.game.save?.();
    const base = insult ? pickLine(INSULT_LINES, npc, p, kind) : pickLine(REFUSE_LINES, npc, p, kind);
    return {
      success: true, outcome: 'refused', price: p, insulted: insult, walked: walkAway,
      message: base + (walkAway ? ' Il met fin à la discussion pour aujourd\'hui.' : ''),
      triesLeft: this.triesLeft(npc.id), patience: Math.max(0, session.patience)
    };
  }

  _executeBuy(ctx, price, qty) {
    const { offer } = ctx;
    const game = this.game;
    const total = r2(price * qty);
    if (!game.player.removeMoney(total)) return null;
    offer.quantity -= qty;
    if (offer.quantity <= 0) { offer.quantity = 0; offer.status = 'completed'; }
    const tx = new Transaction({
      itemId: offer.itemId, quantity: qty, price, sellerId: offer.ownerId, buyerId: 'player',
      type: 'negotiated', quality: offer.quality, perfection: offer.perfection,
      sellOfferId: offer.id, sellerAvgCost: offer.avgCost,
      timestamp: game.timeManager?.now?.() ?? Date.now()
    });
    game._handleTransaction(tx);
    return tx;
  }

  _executeSell(ctx, price, qty) {
    const { offer, npc, state } = ctx;
    const game = this.game;
    const minQ = offer.minQuality ?? 0;
    const minP = offer.minPerfection ?? 0;
    // Prend d'abord les stacks éligibles de plus faible qualité
    const stacks = game.player.inventory.items
      .filter(s => s.itemId === offer.itemId && (s.quality ?? 50) >= minQ && (s.perfection ?? 50) >= minP)
      .sort((a, b) => (a.quality - b.quality) || (a.perfection - b.perfection));
    let remaining = qty;
    let costSum = 0; let costQty = 0;
    let q = 50; let pf = 50;
    for (const s of stacks) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, s.quantity);
      if (s.avgBuyPrice != null) { costSum += s.avgBuyPrice * take; costQty += take; }
      q = s.quality; pf = s.perfection;
      game.player.inventory.remove(s.itemId, take, s.quality, s.perfection);
      remaining -= take;
    }
    if (remaining > 0) return null;
    const extra = r2((price - offer.price) * qty);
    if (!game.npcController.debitNpc(npc.id, extra)) return null;
    offer.quantity -= qty;
    if (offer.quantity <= 0) { offer.quantity = 0; offer.status = 'completed'; }
    const tx = new Transaction({
      itemId: offer.itemId, quantity: qty, price, sellerId: 'player', buyerId: npc.id,
      type: 'negotiated', quality: q, perfection: pf, buyOfferId: offer.id,
      sellerAvgCost: costQty ? r2(costSum / costQty) : null,
      timestamp: game.timeManager?.now?.() ?? Date.now()
    });
    game._handleTransaction(tx);
    void state;
    return tx;
  }

  getSummary() {
    return { ...this.stats, triesPerDay: this.triesPerDay() };
  }

  toJSON() {
    const day = this._day();
    const byNpc = {};
    Object.entries(this.byNpc).forEach(([id, s]) => { if (s.day === day) byNpc[id] = s; });
    const counters = {};
    Object.entries(this.counters).forEach(([id, c]) => { if (c.day === day) counters[id] = c; });
    const sessions = {};
    Object.entries(this.sessions).forEach(([id, c]) => { if (c.day === day) sessions[id] = c; });
    const memory = {};
    Object.entries(this.memory).forEach(([id, m]) => { if (m.bluffs > 0.05 || m.deals > 0 || m.insults > 0.05) memory[id] = m; });
    return { byNpc, counters, sessions, memory, journal: this.journal.slice(0, 40), stats: { ...this.stats } };
  }
}

const personalityBonus = {
  agressif: 0.01,      // veut du volume
  'épicier': 0.015,    // rotation rapide
  prudent: -0.01,
  collectionneur: -0.01
};

const ACCEPT_LINES = {
  buy: ['« Marché conclu, à {p} €. »', '« Allez, {p} € : vous êtes dur en affaires ! »', '« Va pour {p} €. Revenez me voir. »'],
  sell: ['« D\'accord pour {p} €. »', '« {p} € ? Topez là. »', '« Bon, je vous les prends à {p} €. »']
};
const COUNTER_LINES = {
  buy: ['« Je peux descendre à {p} €. »', '« Disons {p} €, ça vous va ? »'],
  sell: ['« Je peux monter à {p} €. »', '« Disons {p} €, ça vous va ? »']
};
const COUNTER2_LINES = {
  buy: ['« Bon… {p} €, mais je ne bougerai plus beaucoup. »', '« {p} €. Vous me faites perdre de l\'argent. »'],
  sell: ['« Allez, {p} €, je ne peux guère faire mieux. »', '« {p} €, et c\'est généreux. »']
};
const LAST_LINES = {
  buy: ['« {p} €, c\'est mon dernier mot. »'],
  sell: ['« {p} € et on n\'en parle plus. »']
};
const REFUSE_LINES = {
  buy: ['« Non, ça ne couvre pas mes frais. »', '« Trop bas, désolé. »'],
  sell: ['« Trop cher pour moi. »', '« Je ne peux pas payer ça. »']
};
const INSULT_LINES = {
  buy: ['« Vous plaisantez ? » (confiance en baisse)', '« C\'est presque du vol ! » (confiance en baisse)'],
  sell: ['« À ce prix-là, allez voir ailleurs ! » (confiance en baisse)']
};

const STYLE_OPENERS = {
  stubborn: ['Hmpf.', 'Bon.', 'Écoutez…'],
  generous: ['Allez,', 'Pour vous,', 'D\'accord,'],
  greedy: ['Ah, vous savez y faire…', 'Mmh…', 'Entre nous,'],
  impatient: ['Vite,', 'Bon, on ne va pas y passer la journée :', 'Ok,']
};
const TACTIC_OK = {
  stubborn: '« Mouais… c\'est vrai. »', generous: '« Vous avez raison, faisons un effort. »',
  greedy: '« Bien vu… je peux peut-être bouger un peu. »', impatient: '« D\'accord, d\'accord. »'
};
const TACTIC_KO = {
  stubborn: '« Ne me racontez pas d\'histoires. »', generous: '« Hum, ce n\'est pas très honnête… »',
  greedy: '« On ne me la fait pas. »', impatient: '« Vous me faites perdre mon temps. »'
};
function pickStyled(table, styleId) { return table[styleId] || table.greedy; }

/** Arguments de marchandage : vrais = marge en plus, faux = méfiance. */
export const TACTICS = {
  competitor: { id: 'competitor', icon: '🏷️', label: 'Concurrent moins cher', kinds: ['buy'], risk: 'moyen', text: 'Vrai si un autre marchand vend le même objet moins cher (état comparable) : jusqu\'à +3 % de marge.' },
  bulk: { id: 'bulk', icon: '📦', label: 'Achat / vente en quantité', kinds: ['buy', 'sell'], risk: 'faible', text: 'Vrai à partir de 2 unités : +1 %.' },
  loyalty: { id: 'loyalty', icon: '🤝', label: 'Client fidèle', kinds: ['buy', 'sell'], risk: 'moyen', text: 'Vrai après 2 accords avec lui ou si sa confiance ≥ 30 : +1,5 %.' },
  defect: { id: 'defect', icon: '🔍', label: 'Signaler un défaut', kinds: ['buy'], risk: 'élevé', text: 'Vrai si l\'objet est abîmé (état < 60) : jusqu\'à +3 %. Faux → il se vexe (patience −2).' },
  urgent: { id: 'urgent', icon: '⏰', label: '« La ville en manque »', kinds: ['sell'], risk: 'moyen', text: 'Vrai si l\'objet est en pénurie ou tendu en ville : +2 %.' }
};

function pickLine(table, npc, price, kind, styleId = null, round = 0) {
  const lines = table[kind] || table.buy;
  const idx = Math.abs(Math.floor(price * 100) + round) % lines.length;
  const openers = styleId ? STYLE_OPENERS[styleId] : null;
  const opener = openers ? `${openers[(Math.floor(price * 100) + round) % openers.length]} ` : '';
  return `${npc.name} : ${opener}${lines[idx].replace('{p}', Number(price).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}`;
}
