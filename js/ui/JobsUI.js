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
    this.onPolish = options.onPolish || (() => {});
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
    const leftCraft = (view.maxCraftsPerDay || 6) - (view.craftsUsedToday || 0);
    const leftRepair = (view.maxRepairsPerDay || 4) - (view.repairsUsedToday || 0);
    const loot = view.lastLoot;
    const lootLine = loot?.type === 'cash'
      ? `Dernière trouvaille : ${money(loot.amount)} €`
      : loot?.type === 'item'
        ? `Dernière trouvaille : ${loot.icon || ''} ${loot.name || loot.itemId} x${loot.quantity} (Q${loot.quality})`
        : 'Pars en tournée pour trouver du stock sans frais.';
    const last = view.lastCraft
      ? `Dernier ouvrage : ${view.lastCraft.icon || ''} ${view.lastCraft.name} Q${view.lastCraft.quality} (~${money(view.lastCraft.value)} €)`
      : 'La qualité du résultat dépend des pièces utilisées.';

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
      const needs = r.inputs.map(input => `${input.item?.icon || ''} ${input.owned}/${input.qty}`).join(' · ');
      const lock = r.unlocked ? '' : ` · niv. ${r.minLevel}`;
      return `
        <article class="job-card ${r.unlocked ? '' : 'completed'}">
          <div class="goal-head">
            <h3>${r.name}</h3>
            <span class="text-money">~${money(r.value)} €</span>
          </div>
          <p>Produit ${r.outputItem?.icon || ''} ${r.outputItem?.name || ''} · Q${r.preview?.quality || '?'} (soigné Q${r.previewFocus?.quality || '?'})</p>
          <p style="font-size:0.82rem;opacity:.8">${needs} · fournitures ${money(r.cost)} € / soigné ${money(r.cost + r.focusCost)} €</p>
          <div class="goal-foot">
            <span>${leftCraft} fab.${lock}</span>
            <span>
              <button class="btn btn-small ${r.canCraft ? 'btn-primary' : 'btn-ghost'}" data-action="craft" data-id="${r.id}" data-focus="0" ${r.canCraft ? '' : 'disabled'}>Fabriquer</button>
              <button class="btn btn-small ${r.canFocus ? 'btn-success' : 'btn-ghost'}" data-action="craft" data-id="${r.id}" data-focus="1" ${r.canFocus ? '' : 'disabled'}>Soigné</button>
            </span>
          </div>
        </article>`;
    }).join('');

    const repairs = (view.repairItems || []).map(slot => {
      const name = slot.item ? `${slot.item.icon || ''} ${slot.item.name}` : slot.itemId;
      const partLine = slot.part
        ? `${slot.part.icon || ''} Pièce : ${slot.part.name} (${slot.hasPart ? 'en stock' : 'manque'})`
        : 'Réparation simple (fournitures uniquement).';
      const can = leftRepair > 0 && slot.hasPart !== false;
      return `
        <article class="job-card">
          <div class="goal-head">
            <h3>${name}</h3>
            <span>Q${slot.quality} → Q${slot.nextQuality}</span>
          </div>
          <p>${partLine}</p>
          <div class="goal-foot">
            <span>${money(slot.cost)} € · ${leftRepair} rest.</span>
            <button class="btn btn-small ${can ? 'btn-warning' : 'btn-ghost'}" data-action="polish" data-item="${slot.itemId}" data-quality="${slot.quality}" data-perfection="${slot.perfection}" ${can ? '' : 'disabled'}>Réparer</button>
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
      <h3 style="grid-column:1/-1;margin:6px 0 0;font-family:var(--font-display)">Atelier · niv. ${view.workshopLevel || 1} · ${view.workshopProgress || ''}</h3>
      <p style="grid-column:1/-1;margin:0;font-size:0.85rem;opacity:.8">${last} Standard consomme les pièces les plus usées ; Soigné prend les meilleures.</p>
      ${recipes}
      <h3 style="grid-column:1/-1;margin:6px 0 0;font-family:var(--font-display)">Établi de réparation</h3>
      <p style="grid-column:1/-1;margin:0;font-size:0.85rem;opacity:.8">Pièce selon la catégorie : électronique → composants, outils → cuivre, bois → bois. Vêtements, nourriture et lingots : fournitures seulement.</p>
      ${repairs || '<p class="text-muted">Rien à retaper (qualité ≥ 90)</p>'}
      <h3 style="grid-column:1/-1;margin:6px 0 0;font-family:var(--font-display)">Étal de rue</h3>
      ${stalls || '<p class="text-muted">Inventaire vide</p>'}
    `;

    this.root.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'scavenge') this.onScavenge();
        if (action === 'complete') this.onComplete(btn.dataset.id);
        if (action === 'craft') this.onCraft(btn.dataset.id, btn.dataset.focus === '1');
        if (action === 'polish') this.onPolish(btn.dataset.item, Number(btn.dataset.quality), Number(btn.dataset.perfection));
        if (action === 'stall') this.onStall(btn.dataset.item, Number(btn.dataset.quality), Number(btn.dataset.perfection), 1);
      });
    });
  }
}
