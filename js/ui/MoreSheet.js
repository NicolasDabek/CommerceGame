/**
 * Panneau « Plus » : aria-modal, piège de focus, Échap, retour du focus à #btn-more,
 * et masquage des outils rapides qui chevauchent le panneau en 390 px.
 */
import { createFocusTrap } from './focusTrap.js';

export function initMoreSheet() {
  const sheet = document.getElementById('more-sheet');
  const btnMore = document.getElementById('btn-more');
  if (!sheet || !btnMore) return;

  sheet.setAttribute('aria-modal', 'true');
  if (!sheet.hasAttribute('tabindex')) sheet.setAttribute('tabindex', '-1');

  let trap = null;

  const applyOpen = (open) => {
    sheet.hidden = !open;
    btnMore.setAttribute('aria-expanded', String(!!open));
    document.body.classList.toggle('more-open', !!open);
    if (open) {
      trap?.release(false);
      trap = createFocusTrap(sheet, {
        onEscape: () => window.toggleMoreSheet?.(false),
        restoreFocus: btnMore,
        initialFocus: sheet.querySelector('.more-btn, button')
      });
    } else {
      trap?.release(true);
      trap = null;
    }
  };

  // Remplace le basculement inline : même API (toggleMoreSheet), comportement a11y enrichi.
  window.toggleMoreSheet = (open) => {
    const next = open == null ? sheet.hidden : !!open;
    applyOpen(next);
  };

  // Si le script inline a déjà ouvert/fermé avant ce module, resynchroniser l'état.
  if (!sheet.hidden) applyOpen(true);
}
