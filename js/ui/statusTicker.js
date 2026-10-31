/**
 * Bandeau d'actualité (#status-message) : une seule ligne tronquée par une ellipse (le début reste visible), et se déplie au toucher/clic pour être lu en entier ; un 2e toucher ou un clic ailleurs le referme.
 */
export function initStatusTicker(el = document.getElementById('status-message')) {
  if (!el || el.dataset.ticker) return;
  el.dataset.ticker = '1';
  el.tabIndex = 0;
  el.setAttribute('aria-expanded', 'false');
  el.title = 'Toucher pour lire en entier';
  // Passe 7 : plus de défilement — une ligne tronquée (début toujours visible), texte complet au toucher.
  const measure = () => { el.classList.remove('marquee'); };
  const setExpanded = (on) => {
    el.classList.toggle('expanded', on);
    el.setAttribute('aria-expanded', String(on));
    measure();
  };
  el.addEventListener('click', (e) => { e.stopPropagation(); setExpanded(!el.classList.contains('expanded')); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
  document.addEventListener('click', () => { if (el.classList.contains('expanded')) setExpanded(false); });
  new MutationObserver(() => requestAnimationFrame(measure)).observe(el, { childList: true, characterData: true, subtree: true });
  window.addEventListener('resize', measure);
  requestAnimationFrame(measure);
}
