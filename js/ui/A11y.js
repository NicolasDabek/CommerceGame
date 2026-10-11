/**
 * Affichage & accessibilité : taille du texte, contraste renforcé, animations réduites.
 * Préférences locales (UiPrefs), appliquées dès le chargement.
 */
export const TEXT_SIZES = [
  { id: 's', label: 'Petit', pct: 90 },
  { id: 'm', label: 'Normal', pct: 100 },
  { id: 'l', label: 'Grand', pct: 115 },
  { id: 'xl', label: 'Très grand', pct: 130 }
];

export function a11ySettings(prefs) {
  const reduceDefault = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    textSize: prefs.get('textSize', 'm'),
    contrast: !!prefs.get('highContrast', false),
    reduceMotion: prefs.get('reduceMotion', reduceDefault)
  };
}

export function applyA11y(prefs) {
  const s = a11ySettings(prefs);
  const size = TEXT_SIZES.find(t => t.id === s.textSize) || TEXT_SIZES[1];
  document.documentElement.style.fontSize = `${size.pct}%`;
  document.body.classList.toggle('high-contrast', s.contrast);
  document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
  return s;
}

export function openA11yModal({ Modal, prefs, setStatus }) {
  const s = a11ySettings(prefs);
  Modal.open({
    title: '👁️ Affichage & accessibilité',
    bodyHTML: `
      <fieldset class="a11y-group"><legend>Taille du texte</legend>
        ${TEXT_SIZES.map(t => `<label class="a11y-opt"><input type="radio" name="a11y-size" value="${t.id}" ${t.id === s.textSize ? 'checked' : ''}/> <span style="font-size:${t.pct / 100}rem">${t.label}</span></label>`).join('')}
      </fieldset>
      <label class="a11y-opt"><input type="checkbox" id="a11y-contrast" ${s.contrast ? 'checked' : ''}/> Contraste renforcé <small class="text-muted">(textes plus clairs, bordures et focus bien visibles)</small></label>
      <label class="a11y-opt"><input type="checkbox" id="a11y-motion" ${s.reduceMotion ? 'checked' : ''}/> Réduire les animations</label>
      <p class="text-muted" style="margin-top:10px">Navigation clavier : <kbd>Tab</kbd> parcourt les boutons et les cases du sac, <kbd>Entrée</kbd> valide, <kbd>Ctrl</kbd>+<kbd>K</kbd> ouvre la recherche de commandes.</p>`,
    buttons: [{ label: 'Fermer', className: 'btn-primary', onClick: () => Modal.close() }]
  });
  const body = document.getElementById('modal-body');
  const update = () => {
    prefs.set('textSize', body.querySelector('input[name="a11y-size"]:checked')?.value || 'm');
    prefs.set('highContrast', body.querySelector('#a11y-contrast').checked);
    prefs.set('reduceMotion', body.querySelector('#a11y-motion').checked);
    applyA11y(prefs);
    setStatus?.('Affichage mis à jour');
  };
  body.querySelectorAll('input').forEach(i => i.addEventListener('change', update));
}
