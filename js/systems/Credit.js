/**
 * Credit — crédit du Comptoir municipal.
 *
 * Le Comptoir prête sur sa trésorerie (au-dessus d'une réserve de sécurité) et sur les dépôts
 * des marchands les plus riches (au-delà de 120 % de leur capital de départ). Les intérêts
 * leur reviennent au prorata : l'argent change de main, il n'est jamais créé.
 *
 * Un seul crédit à la fois, plafond selon le rang de réputation, intérêts simples par jour
 * (au moins 1 jour facturé). Remboursement anticipé possible. À l'échéance, prélèvement
 * automatique si le solde suffit ; sinon retard : pénalité, réputation en baisse et
 * 50 % du produit de vos ventes saisi jusqu'au remboursement.
 */

import { NPCS } from '../data/npcs.js';
import { rankFor, RANKS } from '../core/Ranks.js';

export const CREDIT_TUNING = {
  durations: [3, 7],
  minAmount: 50,
  reserveKeep: 600,         // le Comptoir garde toujours 600 € pour réguler le marché
  npcDepositAbove: 1.2,     // un marchand prête au-delà de 120 % de son capital de départ…
  npcDepositShare: 0.5,     // … la moitié de cet excédent
  latePenaltyRate: 0.01,    // pénalité par jour de retard (× capital)…
  latePenaltyMax: 0.2,      // … plafonnée à 20 % du capital
  lateRepFirst: -3,
  lateRepDaily: -1,
  onTimeRep: 2,
  seizeShare: 0.5,          // part du produit des ventes saisie en cas de retard
  seizeAfterDays: 3         // au-delà, le Comptoir prélève ce qu'il peut sur le solde
};

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export class Credit {
  constructor(game, saved = {}) {
    this.game = game;
    this.loan = saved.loan || null;
    this.history = saved.history || [];
    this.stats = { taken: 0, repaid: 0, onTime: 0, late: 0, interestPaid: 0, seized: 0, ...(saved.stats || {}) };
    this._seq = saved.seq || 1;
    this._seizing = false;
  }

  _day() {
    return this.game.timeManager?.getCurrentDay?.() ?? this.game.currentDay ?? 1;
  }

  rank() {
    return rankFor(this.game.player?.reputation || 0);
  }

  /** Fonds prêtables : Comptoir au-dessus de sa réserve + dépôts des marchands aisés. */
  pool() {
    const T = CREDIT_TUNING;
    const sources = [];
    const city = Math.max(0, r2((this.game.reserve?.treasury || 0) - T.reserveKeep));
    if (city > 0) sources.push({ id: 'city', amount: city });
    const states = this.game.npcController?.npcStates || {};
    NPCS.forEach(npc => {
      const st = states[npc.id];
      if (!st) return;
      const excess = (st.capital || 0) - npc.capital * T.npcDepositAbove;
      if (excess > 1) sources.push({ id: npc.id, amount: r2(excess * T.npcDepositShare) });
    });
    return { total: r2(sources.reduce((t, s) => t + s.amount, 0)), sources };
  }

  limit() {
    if (this.loan) return 0;
    return r2(Math.min(this.rank().creditLimit, this.pool().total));
  }

  rate() {
    return this.rank().creditRate;
  }

  /** Devis : intérêts et total dû pour un montant et une durée. */
  quote(amount, days = 7) {
    const a = r2(amount);
    const d = CREDIT_TUNING.durations.includes(Number(days)) ? Number(days) : 7;
    const rate = this.rate();
    const interest = r2(a * rate * d);
    return { amount: a, days: d, rate, interest, total: r2(a + interest), dueDay: this._day() + d };
  }

  borrow(amount, days = 7) {
    const T = CREDIT_TUNING;
    const a = r2(Number(String(amount).replace(',', '.')));
    if (this.loan) return { success: false, error: 'Vous avez déjà un crédit en cours : remboursez-le d\'abord' };
    if (!(a >= T.minAmount)) return { success: false, error: `Montant minimum : ${T.minAmount} €` };
    const rank = this.rank();
    if (rank.creditLimit <= 0) return { success: false, error: 'Réputation négative : le Comptoir refuse de vous prêter' };
    const pool = this.pool();
    const max = Math.min(rank.creditLimit, pool.total);
    if (a > max + 0.001) {
      return { success: false, error: a > rank.creditLimit
        ? `Plafond de votre rang (${rank.title}) : ${rank.creditLimit} €`
        : `Le Comptoir ne peut prêter que ${max.toFixed(2)} € en ce moment (trésorerie et dépôts)` };
    }
    // Répartit le prêt entre les prêteurs au prorata de leurs fonds disponibles
    const lenders = [];
    let left = a;
    pool.sources.forEach((s, i) => {
      const share = i === pool.sources.length - 1 ? left : r2(Math.min(left, a * (s.amount / pool.total)));
      if (share <= 0) return;
      left = r2(left - share);
      lenders.push({ id: s.id, amount: share });
    });
    // Débite les prêteurs
    for (const l of lenders) {
      if (l.id === 'city') this.game.reserve.withdraw(l.amount);
      else if (!this.game.npcController.debitNpc(l.id, l.amount)) {
        // Rollback des débits déjà faits
        lenders.slice(0, lenders.indexOf(l)).forEach(x => this._credit(x.id, x.amount));
        return { success: false, error: 'Fonds des prêteurs indisponibles, réessayez' };
      }
    }
    const q = this.quote(a, days);
    this.loan = {
      id: `loan_${this._seq++}`,
      principal: a, rate: q.rate, days: q.days, takenDay: this._day(), dueDay: q.dueDay,
      paid: 0, lenders, overdueDays: 0, penalty: 0, status: 'active', rankTitle: rank.title
    };
    this.game.player.addMoney(a);
    this.stats.taken += 1;
    this.game.save?.();
    this.game._notifyUI?.();
    return { success: true, loan: this.loan, quote: q, lenders: lenders.length };
  }

  _credit(id, amount) {
    if (amount <= 0) return;
    if (id === 'city') this.game.reserve.deposit(amount, 'loans');
    else this.game.npcController.creditNpc(id, amount);
  }

  /** Intérêts courus (au moins 1 jour, au plus la durée prévue) + pénalités. */
  interestDue(loan = this.loan, day = this._day()) {
    if (!loan) return 0;
    const elapsed = Math.max(1, Math.min(loan.days, day - loan.takenDay));
    return r2(loan.principal * loan.rate * elapsed + (loan.penalty || 0));
  }

  outstanding(loan = this.loan) {
    if (!loan) return 0;
    return r2(Math.max(0, loan.principal + this.interestDue(loan) - (loan.paid || 0)));
  }

  /** Paiement (total ou partiel) réparti entre les prêteurs. */
  _pay(amount, { seized = false } = {}) {
    const loan = this.loan;
    if (!loan) return 0;
    const due = this.outstanding();
    const n = r2(Math.min(amount, due, this.game.player.money));
    if (n <= 0) return 0;
    if (!this.game.player.removeMoney(n)) return 0;
    loan.paid = r2((loan.paid || 0) + n);
    if (seized) this.stats.seized = r2(this.stats.seized + n);
    let left = n;
    loan.lenders.forEach((l, i) => {
      const share = i === loan.lenders.length - 1 ? left : r2(n * (l.amount / loan.principal));
      left = r2(left - share);
      this._credit(l.id, share);
    });
    if (this.outstanding() <= 0.004) this._close();
    return n;
  }

  _close() {
    const loan = this.loan;
    const interest = r2(loan.paid - loan.principal);
    const onTime = loan.overdueDays === 0;
    this.stats.repaid += 1;
    this.stats.interestPaid = r2(this.stats.interestPaid + Math.max(0, interest));
    if (onTime) {
      this.stats.onTime += 1;
      this.game.player.addReputation(CREDIT_TUNING.onTimeRep);
    } else this.stats.late += 1;
    this.history.unshift({
      id: loan.id, principal: loan.principal, interest: Math.max(0, interest), days: loan.days,
      takenDay: loan.takenDay, closedDay: this._day(), onTime, overdueDays: loan.overdueDays
    });
    this.history = this.history.slice(0, 8);
    this.loan = null;
  }

  repay() {
    if (!this.loan) return { success: false, error: 'Aucun crédit en cours' };
    const due = this.outstanding();
    if (this.game.player.money < due) return { success: false, error: `Il faut ${due.toFixed(2)} € pour solder le crédit` };
    const loan = this.loan;
    const paid = this._pay(due);
    this.game.save?.();
    this.game._notifyUI?.();
    return { success: true, paid, onTime: loan.overdueDays === 0 };
  }

  /** Appelé chaque nouveau jour : prélèvement à l'échéance, retards et pénalités. */
  onNewDay() {
    const loan = this.loan;
    if (!loan) return null;
    const T = CREDIT_TUNING;
    const day = this._day();
    if (day < loan.dueDay) return null;
    const due = this.outstanding();
    if (this.game.player.money >= due) {
      this._pay(due);
      return { type: 'autoRepaid', amount: due };
    }
    // Retard
    loan.overdueDays += 1;
    loan.status = 'overdue';
    loan.penalty = r2(Math.min(loan.principal * T.latePenaltyMax, (loan.penalty || 0) + loan.principal * T.latePenaltyRate));
    this.game.player.addReputation(loan.overdueDays === 1 ? T.lateRepFirst : T.lateRepDaily);
    let seized = 0;
    if (loan.overdueDays >= T.seizeAfterDays) seized = this._pay(this.game.player.money, { seized: true });
    return { type: 'overdue', days: loan.overdueDays, seized };
  }

  /** Saisie sur les ventes du joueur pendant un retard. */
  onTransaction(tx) {
    if (!this.loan || this.loan.status !== 'overdue' || this._seizing) return;
    if (tx.sellerId !== 'player') return;
    this._seizing = true;
    try { this._pay(r2(tx.total * CREDIT_TUNING.seizeShare), { seized: true }); }
    finally { this._seizing = false; }
  }

  getView() {
    const rank = this.rank();
    const pool = this.pool();
    const loan = this.loan;
    const day = this._day();
    return {
      rank,
      ranks: RANKS.map(r => ({ title: r.title, icon: r.icon, limit: r.creditLimit, rate: r.creditRate, minRep: r.minRep })),
      rate: rank.creditRate,
      rankLimit: rank.creditLimit,
      pool: pool.total,
      lenders: pool.sources.length,
      limit: this.limit(),
      durations: CREDIT_TUNING.durations,
      minAmount: CREDIT_TUNING.minAmount,
      loan: loan ? {
        ...loan,
        outstanding: this.outstanding(),
        interest: this.interestDue(),
        daysLeft: loan.dueDay - day,
        fullTermTotal: r2(loan.principal * (1 + loan.rate * loan.days) + (loan.penalty || 0) - (loan.paid || 0))
      } : null,
      history: this.history,
      stats: { ...this.stats }
    };
  }

  toJSON() {
    return { loan: this.loan, history: this.history, stats: { ...this.stats }, seq: this._seq };
  }
}
