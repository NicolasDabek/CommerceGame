/** Petit stockage mémoire pour les tests (remplace localStorage du navigateur). */
export function installMemoryStorage() {
  const store = new Map();
  const mem = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear()
  };
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const prev = globalThis.localStorage;
  globalThis.localStorage = mem;
  return () => {
    if (had) globalThis.localStorage = prev;
    else delete globalThis.localStorage;
  };
}

/** Jeu complet (Game + GamePatch) avec un stockage mémoire. */
export async function makeGame() {
  const restore = installMemoryStorage();
  const { Game } = await import('../js/core/Game.js');
  const { enhanceGame } = await import('../js/core/GamePatch.js');
  const game = new Game();
  enhanceGame(game);
  return { game, restore };
}

/** Vide le stock d'un objet chez tous les PNJ, dans les annonces et au Comptoir. */
export function drainItem(game, itemId) {
  Object.values(game.npcController.npcStates).forEach(st => {
    st.inventory = st.inventory.filter(s => s.itemId !== itemId);
  });
  game.offers.forEach(o => { if (o.itemId === itemId && o.type === 'sell') o.status = 'cancelled'; });
  if (game.reserve.stock[itemId]) game.reserve.stock[itemId] = 0;
}

/** Masse monétaire totale (joueur + PNJ + offres bloquées + Comptoir + caisse des frais). */
export function totalMoney(game) {
  const npc = Object.values(game.npcController.npcStates).reduce((t, s) => t + (s.capital || 0), 0);
  let locked = 0;
  game.offers.forEach(o => {
    if (o.status !== 'active') return;
    if (o.type === 'buy') locked += o.price * o.quantity;
    if (o.type === 'sell' && o.currentBid != null) locked += o.currentBid * o.quantity;
  });
  return Math.round((game.player.money + npc + locked + (game.reserve?.treasury || 0) + (game.jobBoard?.feeVault || 0)) * 100) / 100;
}
