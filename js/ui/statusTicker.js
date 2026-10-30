/**
 * Bandeau d'actualité (#status-message) : défile seulement s'il déborde (sauf mouvement réduit,
 * géré en CSS), et se déplie au toucher/clic pour être lu en entier ; un 2e toucher ou un clic ailleurs le referme.
 */
export function initStatusTicker(el = document.getElementById('status-message')) {
  if (!el || el.dataset.ticker) return;
  el.dataset.ticker = '1';
  el.tabIndex = 0;
  el.setAttribute('aria-expanded', 'false');
  el.title = 'Toucher pour lire en entier';
  const measure = () => {
    el.classList.remove('marquee');
    if (el.classList.contains('expanded')) return;
    const dist = el.scrollWidth - el.clientWidth;
    if (dist > 4) {
      el.style.setProperty('--marquee-dist', `${dist + 12}px`);
      el.style.setProperty('--marquee-dur', `${Math.max(4, dist / 30).toFixed(1)}s`);
      el.classList.add('marquee');
    }
  };
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
