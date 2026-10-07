/**
 * Interface — Atelier : métiers, contrats, commandes des marchands, établi de réparation.
 */
import { formatMoney } from './TradeInsights.js';

function money(n) {
  return formatMoney(Number(n || 0));
}

function dec(n, digits = 1) {
  return Number(n || 0).toFixed(digits).replace('.', ',');
}

const SHORTAGE_CHIP = {
  shortage: '<span class="sd-chip sd-shortage">Pénurie</span>',
  tight: '<span class="sd-chip sd-tight">Tendu</span>',
  balanced: '<span class="sd-chip sd-balanced">Équilibré</span>',
  low: '<span class="sd-chip sd-tight">Stock bas</span>',
  surplus: '<span class="sd-chip sd-surplus">Surplus</span>'
};

function profitHtml(value, { suffix = '' } = {}) {
  const cls = value >= 0 ? 'text-success' : 'text-danger';
  return `<strong class="${cls}">${value >= 0 ? '+' : ''}${money(value)} €${suffix}</strong>`;
}

export class JobsUI {
  constructor(options = {}) {
    this.getView = options.getView || (() => ({ contracts: [], recipes: [], stallItems: [], stats: {} }));
    this.getMsPerGameDay = options.getMsPerGameDay || (() => 24 * 60 * 60 * 1000);
    this.onScavenge = options.onScavenge || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onStall = options.onStall || (() => {});
    this.onCraft = options.onCraft || (() => {});
    this.onPolish = options.onPolish || (() => {});
    this.onRepair = options.onRepair || ((itemId, q, p) => this.onPolish(itemId, q, p));
    this.onService = options.onService || (() => {});
    this.onSalvage = options.onSalvage || (() => {});
    this.onNpcOrder = options.onNpcOrder || (() => {});
    this.onBuyDeal = options.onBuyDeal || (() => {});
    this.root = document.getElementById('jobs-root');
    this.vaultEl = document.getElementById('jobs-vault');
    this.tab = 'jobs';
  }

  _hours(ms) {
    const h = (ms / this.getMsPerGameDay()) * 24;
    if (h >= 1) return `${dec(h)} h`;
    return `${Math.max(1, Math.round(h * 60))} min`;
  }

  _section(title, hint = '') {
    return `<h3 class="jobs-section">${title}</h3>${hint ? `<p class="jobs-hint">${hint}</p>` : ''}`;
  }

  _professions(view) {
    return (view.professions || []).map(p => {
      const pct = Math.round((p.progress || 0) * 100);
      const next = p.nextXp != null ? `${p.xp} / ${p.nextXp} XP` : `${p.xp} XP · niveau max`;
      return `
        <article class="job-card prof-card" data-prof="${p.id}">
          <div class="goal-head">
            <h3>${p.icon} ${p.label}</h3>
            <span class="prof-level" title="Niveau du métier (1 à 5)">niv. ${p.level}</span>
          </div>
          <div class="prof-bar" title="${next}"><span style="width:${pct}%"></span></div>
          <small class="text-muted">${next} · ${p.text}</small>
          <ul class="prof-perks">${p.perks.map(x => `<li>${x}</li>`).join('')}</ul>
        </article>`;
    }).join('');
  }

  _contracts(view) {
    return (view.contracts || []).map(job => {
      const done = job.status === 'done';
      const profit = job.reward - (job.value || 0);
      return `
        <article class="job-card ${done ? 'completed' : ''} ${job.rush ? 'scavenge-card' : ''}">
          <div class="goal-head">
            <h3>${job.title}</h3>
            <span class="text-money" title="Payé par le Comptoir municipal">${money(job.reward)} €</span>
          </div>
          <p>${SHORTAGE_CHIP[job.shortage] || ''} ${job.reason}</p>
          <p class="jobs-small">${job.quantity} × ${job.item?.icon || ''} ${job.item?.name || ''} · valeur marché ${money(job.value)} € · prime ${profitHtml(profit)} (+${job.premiumPct} %)</p>
          <div class="goal-foot">
            <span>Votre stock : ${job.owned} / ${job.quantity}</span>
            ${done
              ? '<span class="text-success">Livré</span>'
              : `<button class="btn btn-small ${job.canComplete ? 'btn-success' : 'btn-ghost'}" data-action="complete" data-id="${job.id}" ${job.canComplete ? '' : 'disabled'}>Livrer</button>`}
          </div>
        </article>`;
    }).join('');
  }

  _npcOrders(view) {
    return (view.npcOrders || []).map(o => {
      const done = o.status === 'done';
      const days = o.daysLeft <= 0 ? "aujourd'hui" : `${o.daysLeft + 1} jour(s)`;
      return `
        <article class="job-card npc-order ${done ? 'completed' : ''}">
          <div class="goal-head">
            <h3>${o.npcName} commande</h3>
            <span class="text-money">${money(o.pay)} €</span>
          </div>
          <p>${o.quantity} × ${o.item?.icon || ''} ${o.item?.name || ''} · état Q${o.minQuality}+ minimum</p>
          <p class="jobs-small">Payé avec l'argent du marchand · ${profitHtml(o.premium)} au-dessus du marché · reste ${days}</p>
          <div class="goal-foot">
            <span>Vous : ${o.owned} / ${o.quantity}</span>
            ${done
              ? '<span class="text-success">Livré</span>'
              : `<button class="btn btn-small ${o.canDeliver ? 'btn-success' : 'btn-ghost'}" data-action="npc-order" data-id="${o.id}" ${o.canDeliver ? '' : 'disabled'}>Livrer</button>`}
          </div>
        </article>`;
    }).join('');
  }

  _services(view) {
    const leftService = (view.maxServicesPerDay || 4) - (view.servicesUsedToday || 0);
    return (view.services || []).map(job => {
      const done = job.status === 'done';
      const name = job.item ? `${job.item.icon || ''} ${job.item.name}` : job.itemId;
      if (job.kind === 'repair') {
        const partLine = job.part
          ? `${job.part.icon || ''} Matériaux : ${job.part.qty} × ${job.part.name} (${job.hasPart ? 'en stock' : 'manque'}, ~${money(job.partCost)} €)`
          : 'Fournitures seulement, pas de matériaux.';
        return `
          <article class="job-card ${done ? 'completed' : ''} scavenge-card">
            <div class="goal-head">
              <h3>Réparer pour ${job.npcName}</h3>
              <span class="text-money">${money(job.pay)} €</span>
            </div>
            <p>${name} Q${job.quality} → Q${job.nextQuality}</p>
            <p class="jobs-small">${partLine} · gain net ${profitHtml(job.pay - (job.partCost || 0))}</p>
            <div class="goal-foot">
              <span>${leftService} serv.</span>
              ${done
                ? '<span class="text-success">Rendu</span>'
                : `<button class="btn btn-small ${job.canFulfill ? 'btn-warning' : 'btn-ghost'}" data-action="service" data-id="${job.id}" ${job.canFulfill ? '' : 'disabled'}>Réparer</button>`}
            </div>
          </article>`;
      }
      const loot = (job.outputs || []).map(o => `${o.icon || ''} ${o.name} x${o.qty}`).join(' · ');
      return `
        <article class="job-card ${done ? 'completed' : ''} scavenge-card">
          <div class="goal-head">
            <h3>Démanteler pour ${job.npcName}</h3>
            <span class="text-money">${money(job.pay)} €</span>
          </div>
          <p>${name} Q${job.quality} — le client récupère : ${loot || 'ressources'}</p>
          <div class="goal-foot">
            <span>${leftService} serv.</span>
            ${done
              ? '<span class="text-success">Traité</span>'
              : `<button class="btn btn-small ${job.canFulfill ? 'btn-warning' : 'btn-ghost'}" data-action="service" data-id="${job.id}" ${job.canFulfill ? '' : 'disabled'}>Démanteler</button>`}
          </div>
        </article>`;
    }).join('');
  }

  _bench(view) {
    const slots = view.benchSlots || 1;
    const cards = (view.bench || []).map(e => {
      const pct = Math.round((e.progress || 0) * 100);
      const ready = e.remainingMs <= 0;
      return `
        <article class="job-card bench-card">
          <div class="goal-head">
            <h3>${e.item?.icon || ''} ${e.item?.name || e.itemId}</h3>
            <span>${e.mode === 'refurbish' ? 'Remise à neuf' : 'Réparation rapide'}</span>
          </div>
          <p>État Q${e.quality} → <strong>Q${e.toQuality}</strong> · vaudra ~${money(e.valueAfter)} €</p>
          <div class="prof-bar bench-bar"><span style="width:${pct}%"></span></div>
          <small class="text-muted">${ready ? 'Terminé — libérez une case du sac pour le récupérer' : `Prêt dans ${this._hours(e.remainingMs)} (temps de jeu)`}</small>
        </article>`;
    });
    for (let i = cards.length; i < slots; i++) {
      cards.push('<article class="job-card bench-card bench-empty"><p class="text-muted">Place libre sur l\'établi — choisissez un objet ci-dessous.</p></article>');
    }
    return cards.join('');
  }

  _repairOption(slot, quote, label, cls, blocked = '') {
    if (!quote) return '';
    if (!quote.ok) {
      return `<div class="repair-opt locked"><strong>${label}</strong><small>${quote.error}</small></div>`;
    }
    const mat = quote.materials
      ? `${quote.materials.icon} ${quote.materials.qty} × ${quote.materials.name} <span class="${quote.hasMaterials ? 'text-success' : 'text-danger'}">(${quote.materials.owned} en stock)</span> ~${money(quote.materials.value)} €`
      : 'Pas de matériaux';
    const tip = `Valeur avant : ${money(quote.valueBefore)} €\nValeur après : ${money(quote.valueAfter)} €\nFournitures : ${money(quote.supplies)} € (payées au Comptoir)\nMatériaux : ${quote.materials ? money(quote.materials.value) + ' €' : '0 €'}\nProfit attendu = après − avant − coûts`;
    return `
      <div class="repair-opt" title="${tip}">
        <strong>${label} · Q${quote.toQuality}</strong>
        <small>${mat}</small>
        <small>Fournitures ${money(quote.supplies)} € · ${dec(quote.hours)} h</small>
        <small>Profit attendu ${profitHtml(quote.profit)}</small>
        ${(() => {
          const reason = blocked || (!quote.hasMaterials ? 'Matériaux manquants' : '');
          return `<button class="btn btn-small ${reason ? 'btn-ghost' : cls}" data-action="repair" data-mode="${quote.mode}" data-item="${slot.itemId}" data-quality="${slot.quality}" data-perfection="${slot.perfection}" ${reason ? `disabled title="${reason}"` : ''}>${reason || label}</button>`;
        })()}
      </div>`;
  }

  _repairs(view) {
    const benchFull = (view.bench || []).length >= (view.benchSlots || 1);
    const noneLeft = (view.maxRepairsToday || 4) - (view.repairsUsedToday || 0) <= 0;
    const blocked = benchFull ? 'Établi plein' : noneLeft ? 'Plus de réparations aujourd\'hui' : '';
    return (view.repairItems || []).map(slot => {
      const name = slot.item ? `${slot.item.icon || ''} ${slot.item.name}` : slot.itemId;
      return `
        <article class="job-card repair-card">
          <div class="goal-head">
            <h3>${name}</h3>
            <span title="État actuel">${slot.condition} · Q${slot.quality}</span>
          </div>
          <div class="repair-opts">
            ${this._repairOption(slot, slot.quick, 'Réparation rapide', 'btn-warning', blocked)}
            ${this._repairOption(slot, slot.refurbish, 'Remise à neuf', 'btn-success', blocked)}
          </div>
        </article>`;
    }).join('');
  }

  _deals(view) {
    return (view.refurbishDeals || []).map(d => `
      <article class="job-card deal-card">
        <div class="goal-head">
          <h3>${d.item?.icon || ''} ${d.item?.name || d.itemId}</h3>
          <span class="text-money">${money(d.price)} €</span>
        </div>
        <p>Q${d.quality} chez ${d.sellerName} → ${d.mode === 'refurbish' ? 'remise à neuf' : 'réparation'} Q${d.toQuality} (${dec(d.hours)} h)</p>
        <p class="jobs-small">Coûts atelier ${money(d.totalCost)} €${d.materials ? ` (dont ${d.materials.qty} × ${d.materials.name})` : ''} · revente ~${money(d.valueAfter)} €</p>
        <div class="goal-foot">
          <span>Profit ${profitHtml(d.profit)} · ${d.roi} %</span>
          <button class="btn btn-small ${d.canAfford ? 'btn-primary' : 'btn-ghost'}" data-action="buy-deal" data-id="${d.offerId}" ${d.canAfford ? '' : 'disabled'}>Acheter</button>
        </div>
      </article>`).join('');
  }

  _recipes(view) {
    const leftCraft = (view.maxCraftsPerDay || 6) - (view.craftsUsedToday || 0);
    return (view.recipes || []).map(r => {
      const needs = r.inputs.map(input => `${input.item?.icon || ''} ${input.owned}/${input.qty}`).join(' · ');
      const lock = r.unlocked ? '' : ` · Artisan niv. ${r.minLevel}`;
      return `
        <article class="job-card ${r.unlocked ? '' : 'completed'}">
          <div class="goal-head">
            <h3>${r.name}</h3>
            <span class="text-money">~${money(r.value)} €</span>
          </div>
          <p>Produit ${r.outputItem?.icon || ''} ${r.outputItem?.name || ''} · Q${r.preview?.quality || '?'} (soigné Q${r.previewFocus?.quality || '?'})</p>
          <p class="jobs-small">${needs} · fournitures ${money(r.cost)} € / soigné ${money(r.cost + r.focusCost)} €</p>
          <div class="goal-foot">
            <span>${leftCraft} fab.${lock}</span>
            <span>
              <button class="btn btn-small ${r.canCraft ? 'btn-primary' : 'btn-ghost'}" data-action="craft" data-id="${r.id}" data-focus="0" ${r.canCraft ? '' : 'disabled'}>Fabriquer</button>
              <button class="btn btn-small ${r.canFocus ? 'btn-success' : 'btn-ghost'}" data-action="craft" data-id="${r.id}" data-focus="1" ${r.canFocus ? '' : 'disabled'}>Soigné</button>
            </span>
          </div>
        </article>`;
    }).join('');
  }

  _salvages(view) {
    const leftSalvage = (view.maxSalvagePerDay || 4) - (view.salvageUsedToday || 0);
    return (view.salvageItems || []).map(slot => {
      const name = slot.item ? `${slot.item.icon || ''} ${slot.item.name}` : slot.itemId;
      const loot = (slot.outputs || []).map(o => `${o.icon || ''} ${o.name} x${o.qty}`).join(' · ');
      return `
        <article class="job-card">
          <div class="goal-head"><h3>${name}</h3><span>Q${slot.quality}</span></div>
          <p>Récupère ${loot || 'rien'}</p>
          <div class="goal-foot">
            <span>${leftSalvage} rest.</span>
            <button class="btn btn-small ${leftSalvage > 0 ? 'btn-primary' : 'btn-ghost'}" data-action="salvage" data-item="${slot.itemId}" data-quality="${slot.quality}" data-perfection="${slot.perfection}" ${leftSalvage > 0 ? '' : 'disabled'}>Démanteler 1</button>
          </div>
        </article>`;
    }).join('');
  }

  _stalls(view) {
    const leftStall = (view.maxStallPerDay || 3) - (view.stallUsedToday || 0);
    return (view.stallItems || []).map(slot => {
      const name = slot.item ? `${slot.item.icon || ''} ${slot.item.name}` : slot.itemId;
      const price = Math.round(slot.unit * 0.9 * 100) / 100;
      return `
        <article class="job-card">
          <div class="goal-head"><h3>${name}</h3><span class="text-money">${money(price)} €</span></div>
          <p>x${slot.quantity} · Q${slot.quality} · vente directe à 90 % du marché, 0 frais</p>
          <div class="goal-foot">
            <span>${leftStall} vente(s) d'étal</span>
            <button class="btn btn-small btn-success" data-action="stall" data-item="${slot.itemId}" data-quality="${slot.quality}" data-perfection="${slot.perfection}" ${leftStall > 0 ? '' : 'disabled'}>Vendre 1</button>
          </div>
        </article>`;
    }).join('');
  }

  render() {
    if (!this.root) return;
    const view = this.getView();
    if (this.vaultEl) {
      const streak = view.streak ? ` · série ${view.streak} j` : '';
      this.vaultEl.textContent = `Caisse municipale : ${money(view.feeVault)} €${streak}`;
    }
    const leftS = (view.maxScavengePerDay || 4) - (view.scavengeUsedToday || 0);
    const loot = view.lastLoot;
    const lootLine = loot?.type === 'cash'
      ? `Dernière trouvaille : ${money(loot.amount)} €`
      : loot?.type === 'item'
        ? `Dernière trouvaille : ${loot.icon || ''} ${loot.name || loot.itemId} x${loot.quantity} (Q${loot.quality})`
        : 'Partez en tournée pour trouver du stock sans frais.';
    const repairsLeft = (view.maxRepairsToday || 4) - (view.repairsUsedToday || 0);
    const benchUsed = (view.bench || []).length;
    const last = view.lastCraft
      ? `Dernier ouvrage : ${view.lastCraft.icon || ''} ${view.lastCraft.name} Q${view.lastCraft.quality} (~${money(view.lastCraft.value)} €).`
      : 'La qualité du résultat dépend des pièces utilisées.';

    const tabs = `
      <div class="tabs jobs-tabs">
        <button class="tab ${this.tab === 'jobs' ? 'active' : ''}" data-jobs-tab="jobs">Métiers &amp; contrats</button>
        <button class="tab ${this.tab === 'workshop' ? 'active' : ''}" data-jobs-tab="workshop">Établi de réparation${benchUsed ? ` (${benchUsed})` : ''}</button>
      </div>`;

    const jobsTab = `
      ${this._section('Vos métiers', 'Chaque réparation, fabrication ou livraison fait progresser le métier correspondant (niveaux 1 à 5) et débloque des avantages.')}
      ${this._professions(view)}
      ${this._section('Contrats du Comptoir', 'La ville commande d\'abord ce qui manque (stock < 2 jours de demande). Les objets livrés rejoignent le stock du Comptoir, ce qui résorbe la pénurie.')}
      ${this._contracts(view) || '<p class="text-muted">Aucun contrat</p>'}
      ${this._section('Commandes des marchands', 'Un marchand à court de stock vous paie un peu plus que le marché, avec son propre argent, avant la date limite.')}
      ${this._npcOrders(view) || '<p class="text-muted">Aucune commande pour le moment</p>'}
      ${this._section('Atelier client · PNJ', 'Réparer : vous fournissez les matériaux, le marchand paie. Démanteler : il récupère les ressources, vous êtes payé pour la main-d\'œuvre.')}
      ${this._services(view) || '<p class="text-muted">Aucune demande client pour aujourd\'hui</p>'}
      ${this._section('Tournée de chinage')}
      <article class="job-card scavenge-card">
        <div class="goal-head"><h3>Tournée de chinage</h3><span>${leftS} restante(s)</span></div>
        <p>${lootLine}</p>
        <div class="goal-foot">
          <span>Gains travail : ${money(view.stats?.earned)} €</span>
          <button class="btn btn-small btn-primary" data-action="scavenge" ${leftS > 0 ? '' : 'disabled'}>Partir en tournée</button>
        </div>
      </article>`;

    const workshopTab = `
      ${this._section(`Établi · ${benchUsed}/${view.benchSlots || 1} place(s) · ${Math.max(0, repairsLeft)} réparation(s) restante(s) aujourd'hui`, 'L\'objet quitte votre sac pendant la réparation et revient tout seul quand c\'est prêt. Réparation rapide : 1 matériau bon marché (cuivre pour l\'électronique, bois pour les outils). Remise à neuf : composants (1 par 75 points d\'état, cuivre pour la petite électronique) ou cuivre pour les outils (1 par 30 points). Vêtements : fournitures seulement. Les fournitures sont payées au Comptoir municipal.')}
      ${this._bench(view)}
      ${this._section('Bonnes affaires à retaper', 'Objets abîmés en vente dont la réparation est rentable : achetez, réparez, revendez. Les marchands réparateurs chassent aussi ces affaires !')}
      ${this._deals(view) || '<p class="text-muted">Aucune affaire rentable en ce moment (revenez après la consommation de la ville).</p>'}
      ${this._section('Réparer vos objets', 'Profit attendu = valeur après réparation − valeur actuelle − fournitures − matériaux. Survolez une option pour le détail.')}
      ${this._repairs(view) || '<p class="text-muted">Rien à réparer (électronique, outils ou vêtements sous Q90).</p>'}
      ${this._section(`Fabrication · Artisan niv. ${view.workshopLevel || 1}`, `${last} Standard consomme les pièces les plus usées ; Soigné prend les meilleures.`)}
      ${this._recipes(view)}
      ${this._section('Démantèlement', 'Électronique → composants. Outils → cuivre (et bois si bonne qualité). L\'objet est détruit.')}
      ${this._salvages(view) || '<p class="text-muted">Rien à démonter (électronique ou outils)</p>'}
      ${this._section('Étal de rue')}
      ${this._stalls(view) || '<p class="text-muted">Inventaire vide</p>'}`;

    this.root.innerHTML = tabs + (this.tab === 'workshop' ? workshopTab : jobsTab);

    this.root.querySelectorAll('[data-jobs-tab]').forEach(btn => {
      btn.addEventListener('click', () => { this.tab = btn.dataset.jobsTab; this.render(); });
    });
    this.root.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const q = Number(btn.dataset.quality);
        const p = Number(btn.dataset.perfection);
        if (action === 'scavenge') this.onScavenge();
        if (action === 'complete') this.onComplete(btn.dataset.id);
        if (action === 'craft') this.onCraft(btn.dataset.id, btn.dataset.focus === '1');
        if (action === 'polish') this.onPolish(btn.dataset.item, q, p);
        if (action === 'repair') this.onRepair(btn.dataset.item, q, p, btn.dataset.mode);
        if (action === 'service') this.onService(btn.dataset.id);
        if (action === 'salvage') this.onSalvage(btn.dataset.item, q, p);
        if (action === 'stall') this.onStall(btn.dataset.item, q, p, 1);
        if (action === 'npc-order') this.onNpcOrder(btn.dataset.id);
        if (action === 'buy-deal') this.onBuyDeal(btn.dataset.id);
      });
    });
  }
}
