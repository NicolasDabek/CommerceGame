/**
 * Interface — Progression : Parcours du marchand, rang de réputation & avantages, patrimoine,
 * objectifs libres (anciens objectifs), carte « prochaine étape » sur la place et astuces des lieux.
 */
import { formatMoney } from './TradeInsights.js';
import { PANEL_TIPS } from '../systems/Career.js';

const PANEL_NAMES = {
  inventory: 'Sac', auction: 'Hôtel de vente', buyhouse: 'Hôtel d\'achat', market: 'Halle des prix',
  jobs: 'Atelier', npcs: 'Marchands', trading: 'Suivi', goals: 'Parcours', history: 'Carnet'
};

function fmtValue(step) {
  if (step.metric === 'netWorth' || step.metric === 'netProfit') return `${formatMoney(Math.min(step.value, step.target))} / ${formatMoney(step.target)} €`;
  return `${Math.min(step.value, step.target)} / ${step.target}`;
}

export class CareerUI {
  constructor(options = {}) {
    this.getCareer = options.getCareer || (() => null);
    this.getRank = options.getRank || (() => null);
    this.getNetWorth = options.getNetWorth || (() => null);
    this.getNegotiation = options.getNegotiation || (() => null);
    this.onGo = options.onGo || (() => {});
    this.onShowGoals = options.onShowGoals || (() => {});
    this.prefs = options.prefs || null;
    this.root = document.getElementById('career-root');
    this.goalsGrid = document.getElementById('goals-grid');
    this.hudEl = document.getElementById('career-hud');
    this.tipEl = document.getElementById('panel-tip');
    this.tab = this.prefs?.get('careerTab', 'path') || 'path';
  }

  render() {
    this.renderHud();
    if (!this.root) return;
    const career = this.getCareer();
    const rank = this.getRank();
    if (!career || !rank) return;
    const tabs = `
      <div class="tabs career-tabs">
        <button class="tab ${this.tab === 'path' ? 'active' : ''}" data-cr-tab="path">📜 Parcours (${Math.min(career.current + 1, career.chapters.length)}/${career.chapters.length})</button>
        <button class="tab ${this.tab === 'rank' ? 'active' : ''}" data-cr-tab="rank">${rank.rank.icon} Rang &amp; avantages</button>
        <button class="tab ${this.tab === 'goals' ? 'active' : ''}" data-cr-tab="goals" title="Les objectifs historiques, à faire dans n'importe quel ordre">🎯 Objectifs libres</button>
      </div>`;
    let body = '';
    if (this.tab === 'rank') body = this._rank(rank);
    else if (this.tab === 'goals') body = '';
    else body = this._path(career, rank);
    this.root.innerHTML = tabs + body;
    if (this.goalsGrid) this.goalsGrid.hidden = this.tab !== 'goals';
    if (this.tab === 'goals') this.onShowGoals();
    this.root.querySelectorAll('[data-cr-tab]').forEach(b => b.addEventListener('click', () => {
      this.tab = b.dataset.crTab;
      this.prefs?.set('careerTab', this.tab);
      this.render();
    }));
    this.root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => this.onGo(b.dataset.go)));
  }

  _summaryTiles(career, rank) {
    const w = this.getNetWorth();
    const next = rank.next;
    return `
      <div class="eco-health career-tiles">
        <div class="eco-tile" title="Argent + stock au prix du marché (selon l'état) + annonces et offres en cours + établi − crédit à rembourser">
          <span class="eco-label">Patrimoine</span>
          <div class="eco-main"><strong class="text-money">${formatMoney(w.total)} €</strong></div>
          <small class="text-muted">argent ${formatMoney(w.cash)} · stock ${formatMoney(w.stock + w.listed + w.bench)} · offres ${formatMoney(w.locked)}${w.debt ? ` · <span class="text-danger">crédit −${formatMoney(w.debt)}</span>` : ''}</small>
        </div>
        <div class="eco-tile" title="${rank.rank.text}">
          <span class="eco-label">Rang</span>
          <div class="eco-main"><strong>${rank.rank.icon} ${rank.rank.title}</strong></div>
          <div class="prof-bar"><span style="width:${rank.pct}%"></span></div>
          <small class="text-muted">réputation ${rank.reputation}${next ? ` · encore ${rank.toNext} pour ${next.icon} ${next.title}` : ' · rang maximum'}</small>
        </div>
        <div class="eco-tile" title="Chapitres du parcours terminés">
          <span class="eco-label">Parcours</span>
          <div class="chapter-pills">${career.chapters.map(ch => `<span class="chapter-pill ${ch.status}" title="${ch.title} — ${ch.status === 'done' ? 'terminé' : ch.status === 'current' ? 'en cours' : 'verrouillé'}">${ch.icon}</span>`).join('')}</div>
          <small class="text-muted">${career.finished ? `🏆 ${career.title || 'Parcours terminé'}` : `${career.currentChapter.title} : ${career.currentChapter.doneCount}/${career.currentChapter.steps.length} étapes`}</small>
        </div>
      </div>`;
  }

  _path(career, rank) {
    const chapters = career.chapters.map((ch, i) => {
      if (ch.status === 'locked') {
        return `<article class="chapter-card locked"><h3>🔒 Chapitre ${i + 1} · ${ch.title}</h3><p class="text-muted">${ch.intro}</p><p class="text-muted">Récompense : ${ch.reward.label}</p></article>`;
      }
      if (ch.status === 'done') {
        return `<article class="chapter-card done"><h3>✅ Chapitre ${i + 1} · ${ch.icon} ${ch.title}</h3><p class="text-muted">Terminé — ${ch.reward.label}</p></article>`;
      }
      const steps = ch.steps.map(s => `
        <li class="step ${s.done ? 'done' : ''}">
          <div class="step-head">
            <span class="step-check">${s.done ? '✅' : '⬜'}</span>
            <strong>${s.title}</strong>
            <span class="step-val">${fmtValue(s)}</span>
          </div>
          <div class="goal-bar"><span style="width:${s.pct}%"></span></div>
          ${s.done ? '' : `<p class="step-how">💡 ${s.how} <button class="btn btn-small btn-ghost" data-go="${s.panel}" title="Ouvrir ${PANEL_NAMES[s.panel] || s.panel}">Y aller → ${PANEL_NAMES[s.panel] || ''}</button></p>`}
        </li>`).join('');
      return `
        <article class="chapter-card current">
          <h3>${ch.icon} Chapitre ${i + 1} · ${ch.title} <small class="text-muted">${ch.doneCount}/${ch.steps.length}</small></h3>
          <p>${ch.intro}</p>
          <ul class="step-list">${steps}</ul>
          <p class="chapter-reward" title="Versée automatiquement quand les 4 étapes sont faites. Pas d'argent : réputation, expérience et cases de sac.">🎁 Récompense : <strong>${ch.reward.label}</strong></p>
        </article>`;
    }).join('');
    return `${this._summaryTiles(career, rank)}<div class="chapter-list">${chapters}</div>`;
  }

  _rank(rank) {
    const neg = this.getNegotiation();
    const pct = (r) => `${String(Math.round(r * 1000) / 10).replace('.', ',')} %`;
    const rows = rank.table.map(r => `
      <tr class="${r.current ? 'row-current' : ''} ${r.reached ? '' : 'row-locked'}">
        <td>${r.icon} <strong>${r.title}</strong><br><small class="text-muted">${r.text}</small></td>
        <td>${r.minRep}+</td>
        <td title="Multiplicateur des frais d'annonce">${Math.round(r.feeMultiplier * 100)} %</td>
        <td>${r.haggleTries} essais / marchand${r.haggleBonus ? `<br><small class="text-success">+${Math.round(r.haggleBonus * 100)} % de marge</small>` : ''}</td>
        <td>${formatMoney(r.creditLimit)} €<br><small class="text-muted">${pct(r.creditRate)} / jour</small></td>
        <td>${r.orderSlots ? `+${r.orderSlots}` : '—'}</td>
      </tr>`).join('');
    return `
      ${this._summaryTiles(this.getCareer(), rank)}
      <div class="table-container">
        <table class="data-table" id="rank-table">
          <thead><tr><th>Rang</th><th>Réputation</th><th title="Frais d'annonce payés (100 % = tarif normal). Ils baissent avec chaque point de réputation.">Frais</th><th title="Marchandage avec les marchands">Marchandage</th><th title="Crédit du Comptoir municipal">Crédit</th><th title="Ordres d'achat permanents en plus">Ordres perm.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="rank-help">
        <h3>Gagner de la réputation</h3>
        <ul>
          <li>+1 par vente, +1 ou +2 par contrat ou commande livrés</li>
          <li>Chapitres du parcours : +3 à +10</li>
          <li>Crédit remboursé à temps : +2</li>
          <li>Objectifs libres : +2 à +10</li>
        </ul>
        <h3>En perdre</h3>
        <ul><li>Crédit en retard : −3 puis −1 par jour</li><li>Changer d'alliance de clan : −2 à −3</li></ul>
        ${neg ? `<p class="text-muted">Vos marchandages : ${neg.deals} accord${neg.deals > 1 ? 's' : ''} sur ${neg.attempts} proposition${neg.attempts > 1 ? 's' : ''} · économisé ${formatMoney(neg.saved)} € à l'achat · gagné ${formatMoney(neg.extra)} € à la vente${neg.insults ? ` · ${neg.insults} marchand${neg.insults > 1 ? 's' : ''} vexé${neg.insults > 1 ? 's' : ''}` : ''}</p>` : ''}
      </div>`;
  }

  /** Carte « prochaine étape » sur la place (masquable). */
  renderHud() {
    if (!this.hudEl) return;
    const hidden = this.prefs?.get('hudHidden', false);
    const career = this.getCareer();
    if (!career || hidden) { this.hudEl.hidden = true; return; }
    this.hudEl.hidden = false;
    if (career.finished) {
      this.hudEl.innerHTML = `<span>🏆 ${career.title || 'Parcours terminé'}</span> <button class="hud-x" data-hud-close title="Masquer">✕</button>`;
    } else {
      const ch = career.currentChapter;
      const s = career.nextStep;
      this.hudEl.innerHTML = `
        <div class="hud-step-title">${ch.icon} ${ch.title} · ${ch.doneCount}/${ch.steps.length}</div>
        ${s ? `<div class="hud-step"><strong>${s.title}</strong> <span class="text-muted">${fmtValue(s)}</span></div><div class="hud-step-how">${s.how}</div>` : ''}
        <div class="hud-step-actions">${s ? `<button class="btn btn-small btn-primary" data-go="${s.panel}">Y aller</button>` : ''}<button class="btn btn-small btn-ghost" data-go="goals">Parcours</button><button class="hud-x" data-hud-close title="Masquer (réaffichable avec la touche ?)">✕</button></div>`;
    }
    this.hudEl.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => this.onGo(b.dataset.go)));
    this.hudEl.querySelector('[data-hud-close]')?.addEventListener('click', () => { this.prefs?.set('hudHidden', true); this.renderHud(); });
  }

  /** Astuce affichée à la première visite d'un lieu. */
  showTip(panel) {
    if (!this.tipEl) return;
    const seen = this.prefs?.get('tipsSeen', []) || [];
    const text = PANEL_TIPS[panel];
    if (!text || seen.includes(panel) || this.prefs?.get('tipsOff', false)) { this.tipEl.hidden = true; return; }
    this.tipEl.hidden = false;
    this.tipEl.innerHTML = `<span>💡 ${text}</span> <button class="btn btn-small btn-ghost" data-tip-ok>Compris</button> <button class="btn btn-small btn-ghost" data-tip-off title="Ne plus afficher d'astuces">Plus d'astuces</button>`;
    this.tipEl.querySelector('[data-tip-ok]')?.addEventListener('click', () => { this.prefs?.set('tipsSeen', [...seen, panel]); this.tipEl.hidden = true; });
    this.tipEl.querySelector('[data-tip-off]')?.addEventListener('click', () => { this.prefs?.set('tipsOff', true); this.tipEl.hidden = true; });
  }

  hideTip() {
    if (this.tipEl) this.tipEl.hidden = true;
  }
}
