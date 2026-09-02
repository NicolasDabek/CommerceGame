export class JobsUI {
  constructor(options = {}) {
    this.getView = options.getView || (() => ({ contracts: [], stats: {} }));
    this.onScavenge = options.onScavenge || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.root = document.getElementById('jobs-root');
    this.vaultEl = document.getElementById('jobs-vault');
  }

  render() {
    if (!this.root) return;
    const view = this.getView();
    if (this.vaultEl) {
      this.vaultEl.textContent = `Caisse municipale : ${(view.feeVault || 0).toFixed(2)} €`;
    }
    const left = (view.maxScavengePerDay || 4) - (view.scavengeUsedToday || 0);
    const cards = (view.contracts || []).map(job => {
      const name = job.item ? `${job.item.icon || ''} ${job.item.name}` : job.itemId;
      const done = job.status === 'done';
      return `
        <article class="job-card ${done ? 'completed' : ''}">
          <div class="goal-head">
            <h3>${job.title}</h3>
            <span class="text-money">${Number(job.reward).toFixed(2)} €</span>
          </div>
          <p>${job.hint}</p>
          <div class="goal-foot">
            <span>En stock : ${job.owned} / ${job.quantity}</span>
            ${done
              ? '<span class="text-success">Livré</span>'
              : `<button class="btn btn-small ${job.canComplete ? 'btn-success' : 'btn-ghost'}" data-action="complete" data-id="${job.id}" ${job.canComplete ? '' : 'disabled'}>Livrer</button>`}
          </div>
        </article>`;
    }).join('');

    this.root.innerHTML = `
      <article class="job-card scavenge-card">
        <div class="goal-head">
          <h3>Tournée de chinage</h3>
          <span>${left} restante(s)</span>
        </div>
        <p>Parcours les brocantes : objets communs ou petite trouvaille en cash. Sans frais de mise en vente.</p>
        <div class="goal-foot">
          <span>Gagné via le travail : ${(view.stats?.earned || 0).toFixed(2)} €</span>
          <button class="btn btn-small btn-primary" data-action="scavenge" ${left > 0 ? '' : 'disabled'}>Partir en tournée</button>
        </div>
      </article>
      ${cards}
    `;

    this.root.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'scavenge') this.onScavenge();
        if (btn.dataset.action === 'complete') this.onComplete(btn.dataset.id);
      });
    });
  }
}
