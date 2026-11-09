/**
 * Piège de focus pour les dialogues (palette, panneau Plus…).
 * Tab / Shift+Tab restent dans le conteneur ; Échap est géré au niveau document
 * tant que le piège est actif (même si le focus a fuité).
 */

const FOCUSABLE_SEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function isShown(el) {
  if (!(el instanceof Element)) return false;
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
  for (let n = el; n; n = n.parentElement) {
    if (n.hidden) return false;
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Éléments focusables visibles dans `root` (hors descendants [hidden]). */
export function getFocusable(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE_SEL)].filter(isShown);
}

/**
 * Active un piège de focus sur `container`.
 * @param {HTMLElement} container
 * @param {{ onEscape?: () => void, initialFocus?: HTMLElement|null, restoreFocus?: HTMLElement|null }} [opts]
 * @returns {{ release: (restore?: boolean) => void }}
 */
export function createFocusTrap(container, opts = {}) {
  const { onEscape, initialFocus = null, restoreFocus = null } = opts;
  const prev = restoreFocus
    || (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (!onEscape) return;
      e.preventDefault();
      e.stopPropagation();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = getFocusable(container);
    if (!nodes.length) {
      e.preventDefault();
      container.focus?.();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    const inside = active instanceof Node && container.contains(active);
    if (e.shiftKey) {
      if (!inside || active === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (!inside || active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Capture : Échap et Tab restent efficaces même si le focus a quitté le dialogue.
  document.addEventListener('keydown', onKeyDown, true);

  const target = initialFocus && isShown(initialFocus)
    ? initialFocus
    : getFocusable(container)[0] || container;
  if (target && typeof target.focus === 'function') {
    try { target.focus({ preventScroll: true }); } catch { try { target.focus(); } catch { /* ignore */ } }
  }

  let released = false;
  return {
    release(restore = true) {
      if (released) return;
      released = true;
      document.removeEventListener('keydown', onKeyDown, true);
      if (restore && prev && typeof prev.focus === 'function' && document.contains(prev)) {
        try { prev.focus({ preventScroll: true }); } catch { try { prev.focus(); } catch { /* ignore */ } }
      }
    }
  };
}
