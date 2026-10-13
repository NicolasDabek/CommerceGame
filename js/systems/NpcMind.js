/**
 * NpcMind — « esprit » des marchands (v6) : objectif du jour, bilan quotidien et apprentissage,
 * rivalités personnelles entre PNJ, réaction à la réputation du joueur, garde-fou anti-boucle.
 *
 * Tout est borné et léger (quelques opérations par PNJ et par jour) pour ne pas déstabiliser
 * l'économie : les « bumps » de score restent petits (≤ 0,12) et l'apprentissage est plafonné.
 */
import { ITEMS, getItemById } from '../data/items.js';

export const MIND_TUNING = {
  learnRate: 0.03,        // ajustement par jour d'un type d'action
  learnMax: 0.1,          // poids appris plafonné à ±0,1
  learnDecay: 0.9,        // oubli progressif
  historyDays: 7,
  cautionMax: 0.3,        // prudence après des pertes
  cautionCap: 0.06,       // prudence max = −6 % × 0,3 ≈ −1,8 % sur le prix max d'achat
  rivalDecay: 0.8,
  rivalThreshold: 2,
  repTrustPer: 1 / 400,   // la réputation du joueur rassure : cible de confiance rep/400
  repTrustMin: -0.1,
  repTrustMax: 0.15
};

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export const GOALS = {
  cash: { label: 'Faire de la trésorerie', icon: '💰', bumps: { sell: 0.1, fulfill: 0.12 } },
  clear: { label: 'Écouler le surstock', icon: '📦', bumps: { sell: 0.1, fulfill: 0.08 } },
  restock: { label: 'Reconstituer son stock', icon: '🧺', bumps: { buy: 0.1, buyout: 0.06 } },
  supply: { label: 'Approvisionner la ville', icon: '🏙️', bumps: { sell: 0.08, fulfill: 0.06 } },
  hunt: { label: 'Chasser les bonnes affaires', icon: '🎯', bumps: { buyout: 0.08, bid: 0.06 } },
  sellEvent: { label: 'Profiter d\'un événement', icon: '📈', bumps: { sell: 0.08, fulfill: 0.06 } },
  buyEvent: { label: 'Acheter pendant la baisse', icon: '📉', bumps: { buy: 0.08, buyout: 0.05 } },
  steady: { label: 'Routine du marché', icon: '🗓️', bumps: {} }
};

export function ensureMind(state) {
  if (!state.mind) state.mind = {};
  const m = state.mind;
  if (!m.learn) m.learn = {};
  if (!m.actions) m.actions = {};
  if (!Array.isArray(m.pnl)) m.pnl = [];
  if (!m.rivals) m.rivals = {};
  if (!m.soldDay) m.soldDay = {};
  if (m.caution == null) m.caution = 0;
  if (m.loopsAvoided == null) m.loopsAvoided = 0;
  return m;
}

/**
 * Valeur du marchand : trésorerie + stock au prix de référence + ses annonces en cours (objets
 * hors du sac) + l'argent bloqué dans ses offres d'achat.
 */
export function npcWorth(ctl, state, npcId = null) {
  // Stock valorisé à la valeur normale (pas à la moyenne du jour) : le bilan mesure ses affaires,
  // pas les mouvements du marché.
  const val = (itemId, q, p) => ctl._conditionPrice(ctl.getFairPrice(itemId), q ?? 50, p ?? 50);
  let w = state.capital || 0;
  for (const s of state.inventory || []) w += s.quantity * val(s.itemId, s.quality, s.perfection);
  const id = npcId || state.__id;
  if (id && ctl.getOffers) {
    for (const o of ctl.getOffers()) {
      // enchère en tête : l'argent est bloqué chez le commissaire-priseur
      if (o.status === 'active' && o.currentBidderId === id && o.currentBid != null) w += o.currentBid * (o.quantity || 1);
      if (o.ownerId !== id || o.status !== 'active' || !(o.quantity > 0)) continue;
      if (o.type === 'sell') w += o.quantity * val(o.itemId, o.quality, o.perfection);
      else w += o.quantity * o.price;
    }
  }
  return r2(w);
}

/** Événement économique actif qui touche une catégorie préférée du marchand (ou global). */
export function eventFor(ctl, npc) {
  const evs = typeof ctl.getActiveEvents === 'function' ? (ctl.getActiveEvents() || []) : [];
  const prefs = npc.preferredCategories || [];
  return evs.find(e => e && typeof e.modifier === 'number' && Math.abs(e.modifier - 1) >= 0.05 &&
    (e.global || prefs.includes(e.category) || (Array.isArray(e.categories) && e.categories.some(c => prefs.includes(c))))) || null;
}

/** Choisit l'objectif du jour selon la situation (lisible dans l'interface). */
export function pickGoal(ctl, npc, state, day) {
  const m = ensureMind(state);
  const stock = ctl._stockQty(state);
  const target = ctl.stockTarget(npc);
  const capRatio = (state.capital || 0) / Math.max(1, npc.capital);
  let id = 'steady';
  let ev = null;
  let reason = 'Rien d\'urgent : il suit ses habitudes.';
  const shortageItem = (state.inventory || []).map(s => s.itemId).find(itemId => ctl.marketSignal(itemId).shortage);
  if (capRatio < 0.45) { id = 'cash'; reason = `Trésorerie à ${Math.round(capRatio * 100)} % de son capital de départ.`; }
  else if (stock > target * 1.3) { id = 'clear'; reason = `${stock} objets pour une cible de ${target}.`; }
  else if (shortageItem) { id = 'supply'; const it = getItemById(shortageItem); reason = `La ville manque de ${it?.icon || ''} ${it?.name || shortageItem} et il en a.`; }
  else if ((ev = eventFor(ctl, npc))) {
    const up = ev.modifier > 1;
    id = up ? 'sellEvent' : 'buyEvent';
    reason = up ? `« ${ev.name} » fait monter les prix : il vend plus volontiers.` : `« ${ev.name} » fait baisser les prix : il en profite pour racheter.`;
  }
  else if (stock < target * 0.5) { id = 'restock'; reason = `Stock bas (${stock}/${target}).`; }
  else if (capRatio > 1.4) { id = 'hunt'; reason = 'Très à l\'aise : il cherche les objets bradés.'; }
  if (m.caution > 0.15 && (id === 'hunt' || id === 'restock')) reason += ' Prudent après des pertes.';
  m.goal = { id, reason, day };
  return m.goal;
}

/** Bilan de la veille + apprentissage borné. Appelé à chaque nouveau jour. */
export function dailyReview(ctl, npc, state, day, worthBefore = null) {
  const T = MIND_TUNING;
  const m = ensureMind(state);
  const worth = npcWorth(ctl, state, npc.id);
  // Résultat commercial de la veille : valeur avant la consommation / fabrication du matin
  // moins la valeur de la veille au soir (la consommation n'est pas une « perte » de négoce).
  const before = worthBefore != null ? worthBefore : worth;
  if (m.lastWorth != null) {
    const pnl = r2(before - m.lastWorth + (m.usedValue || 0));
    m.pnl.push(pnl);
    if (m.pnl.length > T.historyDays) m.pnl.splice(0, m.pnl.length - T.historyDays);
    const total = Object.values(m.actions).reduce((s, v) => s + v, 0);
    const sign = Math.abs(pnl) < npc.capital * 0.005 ? 0 : Math.sign(pnl);
    for (const type of ['sell', 'buy', 'buyout', 'bid', 'fulfill']) {
      const prev = (m.learn[type] || 0) * T.learnDecay;
      const share = total ? (m.actions[type] || 0) / total : 0;
      m.learn[type] = Math.max(-T.learnMax, Math.min(T.learnMax, prev + T.learnRate * sign * share));
      if (Math.abs(m.learn[type]) < 0.001) delete m.learn[type];
    }
    const recent = m.pnl.slice(-3);
    const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
    m.caution = Math.max(0, Math.min(T.cautionMax, avg < 0 ? (-avg / Math.max(1, npc.capital)) * 4 : m.caution * 0.7));
  }
  m.lastWorth = worth;
  m.usedValue = 0;
  m.actions = {};
  // Rivalités qui s'estompent
  for (const [id, v] of Object.entries(m.rivals)) {
    const nv = v * T.rivalDecay;
    if (nv < 0.3) delete m.rivals[id]; else m.rivals[id] = r2(nv);
  }
  // Objets vendus il y a plus d'un jour : plus de garde-fou
  for (const [itemId, d] of Object.entries(m.soldDay)) if (d < day) delete m.soldDay[itemId];
  // La réputation du joueur rassure (ou inquiète) : la confiance tend vers une cible
  const rep = ctl.getPlayerRep ? ctl.getPlayerRep() || 0 : 0;
  const targetTrust = Math.max(T.repTrustMin, Math.min(T.repTrustMax, rep * T.repTrustPer));
  state.trust = targetTrust + ((state.trust || 0) - targetTrust) * 0.97;
  pickGoal(ctl, npc, state, day);
}

export function noteAction(state, type) {
  const m = ensureMind(state);
  const key = type === 'snipe' ? 'bid' : type;
  m.actions[key] = (m.actions[key] || 0) + 1;
}

/** Bonus de score : objectif du jour + apprentissage. */
export function scoreBumps(state) {
  const m = ensureMind(state);
  const out = {};
  const goal = GOALS[m.goal?.id] || GOALS.steady;
  for (const [t, v] of Object.entries(goal.bumps)) out[t] = (out[t] || 0) + v;
  for (const [t, v] of Object.entries(m.learn)) out[t] = (out[t] || 0) + v;
  return out;
}

export function noteRival(state, otherId, amount = 1) {
  if (!otherId || otherId === 'player' || otherId === 'city') return;
  const m = ensureMind(state);
  m.rivals[otherId] = r2(Math.min(6, (m.rivals[otherId] || 0) + amount));
}

export function isPersonalRival(state, otherId) {
  return ((state.mind?.rivals || {})[otherId] || 0) >= MIND_TUNING.rivalThreshold;
}

export function topRival(state) {
  const entries = Object.entries(state.mind?.rivals || {}).filter(([, v]) => v >= MIND_TUNING.rivalThreshold).sort((a, b) => b[1] - a[1]);
  return entries.length ? { id: entries[0][0], score: entries[0][1] } : null;
}

/** Garde-fou anti-boucle : ne rachète pas le jour même un objet qu'il vient de vendre. */
export function markSold(state, itemId, day) {
  ensureMind(state).soldDay[itemId] = day;
}

export function blocksBuyBack(state, itemId, day, shortage = false) {
  const m = ensureMind(state);
  if (shortage) return false;
  if (m.soldDay[itemId] === day) return true;
  return false;
}

/** Résumé pour l'interface. */
export function mindView(ctl, npc, state) {
  const m = ensureMind(state);
  const goal = m.goal && GOALS[m.goal.id] ? { ...GOALS[m.goal.id], id: m.goal.id, reason: m.goal.reason } : { ...GOALS.steady, id: 'steady', reason: 'Observe le marché.' };
  const pnl7 = r2(m.pnl.reduce((s, v) => s + v, 0));
  const learned = Object.entries(m.learn).filter(([, v]) => Math.abs(v) >= 0.02).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const LABEL = { sell: 'vendre en annonce', buy: 'poster des offres d\'achat', buyout: 'acheter immédiatement', bid: 'enchérir', fulfill: 'vendre aux offres d\'achat' };
  const lesson = learned.length
    ? learned.slice(0, 2).map(([t, v]) => `${v > 0 ? 'plus' : 'moins'} ${LABEL[t] || t}`).join(', ')
    : null;
  const rival = topRival(state);
  return {
    goal, pnl7, pnlDays: m.pnl.length, pnlSeries: [...m.pnl],
    caution: m.caution, cautious: m.caution > 0.12,
    lesson, rivalId: rival?.id || null, rivalName: rival ? ctl.getNpcName(rival.id) : null,
    loopsAvoided: m.loopsAvoided
  };
}

void ITEMS;
