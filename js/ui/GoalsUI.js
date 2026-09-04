export class GoalsUI {
  constructor(options = {}) {
    this.getGoals = options.getGoals || (() => []);
    this.getSummary = options.getSummary || (() => ({}));
    this.root = document.getElementById('goals-grid');
    this.summaryEl = document.getElementById('progress-summary');
  }

  render() {
    this._renderSummary();
    if (!this.root) return;
    const goals = this.getGoals();
    this.root.innerHTML = goals.map(goal => {
      const pct = goal.target > 0 ? Math.min(100, Math.round((goal.progress / goal.target) * 100)) : 0;
      return `
        <article class="goal-card ${goal.completed ? 'completed' : ''}">
          <div class="goal-head">
            <h3>${goal.title}</h3>
            <span>${goal.completed ? 'Terminé' : `${pct}%`}</span>
          </div>
          <p>${goal.description}</p>
          <div class="goal-bar"><span style="width:${pct}%"></span></div>
          <div class="goal-foot">
            <span>${Math.min(goal.progress, goal.target)} / ${goal.target}</span>
            <span>${goal.reward}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  _renderSummary() {
    if (!this.summaryEl) return;
    const summary = this.getSummary();
    const xpPct = summary.xpToNext > 0 ? Math.min(100, Math.round((summary.xp / summary.xpToNext) * 100)) : 0;
    this.summaryEl.innerHTML = `
      <span>Niveau ${summary.level || 1}</span>
      <span>XP ${summary.xp || 0}/${summary.xpToNext || 100}</span>
      <span>Réputation ${summary.reputation || 0} (${summary.reputationTitle || 'Nouveau venu'})</span>
      <span>Frais de place ${Math.round((summary.feeMultiplier || 1) * 100)}%</span>
      <span>Inventaire ${summary.inventorySize || 10} cases</span>
      <span class="mini-progress"><i style="width:${xpPct}%"></i></span>
    `;
  }
}
