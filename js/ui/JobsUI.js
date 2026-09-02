function money(n) {
  return Number(n || 0).toFixed(2);
}

export class JobsUI {
  constructor(options = {}) {
    this.getView = options.getView || (() => ({ contracts: [], recipes: [], stallItems: [], stats: {} }));
    this.onScavenge = options.onScavenge || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onStall = options.onStall || (() => {});
    this.onCraft = options.onCraft || (() => {});
    this.root = document.getElementById('jobs-root');
    this.vaultEl = document.getElementById('jobs-vault');
  }

  render() {
    if (!this.root) return;
    const view = this.getView();
    if (this.vaultEl) {
      const streak = view.streak ? ` · série ${view.streak}j` : '';
      this.vaultEl.textContent = `Caisse municipale : ${money(view.feeVault)} €${streak}`;
    }

    const leftS = (view.maxScavengePerDay || 4) - (view.scavengeUsedToday || 0);
    const leftStall = (view.maxStallPerDay || 3) - (view.stallUsedToday || 0);
    const loot = view.lastLoot;
    const lootLine = loot?.type === 'cash'
      ? `Dernière trouvaille : ${money(loot.amount)} €`
      : loot?.type === 'item'
        ? `Dernière trouvaille : ${loot.icon || ''} ${loot.name || loot.itemId} x${loot.quantity} (Q${loot.quality})`
        : 'Pars en tournée pour trouver du stock sans frais.';

    const contracts = (view.contracts || []).map(job => {
      const done = job.status === 'done';
      return `
        <article class="job-card ${done ? 'completed' : ''} ${job.rush ? 'scavenge-card' : ''}">
          <div class="goal-head">
            <h3>${job.title}</h3>
            <span class="text-money">${money(job.reward)} €</span>
          </div>
          <p>${job.hint}</p>
          <div class="goal-foot">
            <span>Stock : ${job.owned} / ${job.quantity}</span>
            ${done
              ? '<span class="text-success">Livré</span>'
              : `<button class="btn btn-small ${job.canComplete ? 'btn-success' : 'btn-ghost'}" data-action="complete" data-id="${job.id}" ${job.canComplete ? '' : 'disabled'}>Livrer</button>`}
          </div>
        </article>`;
    }).join('');

    const recipes = (view.recipes || []).map(r => {
      const needs = r.inputs.map(input => `${input.item?.icon || ''} ${input.owned}/${input.qty} ${input.item?.name || ''}`).join(' · ');
      return `
        <article class="job-card">
          <div class="goal-head">
            <h3>${r.name}</h3>
            <span>${money(r.cost)} €</span>
          </div>
          <p>Produit ${r.outputItem?.icon || ''} ${r.outputItem?.name || ''} (Q${r.output.quality})</p>
          <div class="goal-foot">
            <span>${needs}</span>
            <button class="btn btn-small ${r.canCraft ? 'btn-primary' : 'btn-ghost'}" data-action="craft" data-id="${r.id}" ${r.canCraft ? '' : 'disabled'}>Fabriquer</button>
          </div>
        </article>`;
    }).join('');

    const stalls = (view.stallItems || []).map(slot => {
      const name = slot.item ? `${slot.item.icon || ''} ${slot.item.name}` : slot.itemId;
      const price = Math.round(slot.unit * 0.9 * 100) / 100;
      return `
        <article class="job-card">
          <div class="goal-head">
            <h3>${name}</h3>
            <span class="text-money">${money(price)} €</span>
          </div>
          <p>x${slot.quantity} · Q${slot.quality} · vente directe à 90 % du marché, 0 frais</p>
          <div class="goal-foot">
            <span>${leftStall} vente(s) d'étal</span>
            <button class="btn btn-small btn-success" data-action="stall" data-item="${slot.itemId}" data-quality="${slot.quality}" data-perfection="${slot.perfection}" ${leftStall > 0 ? '' : 'disabled'}>Vendre 1</button>
          </div>
        </article>`;
    }).join('');

    this.root.innerHTML = `
      <article class="job-card scavenge-card">
        <div class="goal-head">
          <h3>Tournée de chinage</h3>
          <span>${leftS} restante(s)</span>
        </div>
        <p>${lootLine}</p>
        <div class="goal-foot">
          <span>Gains travail : ${money(view.stats?.earned)} €</span>
          <button class="btn btn-small btn-primary" data-action="scavenge" ${leftS > 0 ? '' : 'disabled'}>Partir en tournée</button>
        </div>
      </article>
      <h3 style="grid-column:1/-1;margin:6px 0 0;font-family:var(--font-display)">Contrats du jour</h3>
      ${contracts || '<p class="text-muted">Aucun contrat</p>'}
      <h3 style="grid-column:1/-1;margin:6px 0 0;font-family:var(--font-display)">Atelier</h3>
      ${recipes}
      <h3 style="grid-column:1/-1;margin:6px 0 0;font-family:var(--font-display)">Étal de rue</h3>
      ${stalls || '<p class="text-muted">Inventaire vide</p>'}
    `;

    this.root.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'scavenge') this.onScavenge();
        if (action === 'complete') this.onComplete(btn.dataset.id);
        if (action === 'craft') this.onCraft(btn.dataset.id);
        if (action === 'stall') this.onStall(btn.dataset.item, Number(btn.dataset.quality), Number(btn.dataset.perfection), 1);
      });
    });
  }
}
