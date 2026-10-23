/**
 * Ajoute des méthodes au prototype d'une classe, comme si elles y étaient déclarées
 * (non énumérables, accesseurs conservés). Sert à découper les grosses classes en sous-modules.
 */
export function mixin(Cls, ...sources) {
  for (const src of sources) {
    const desc = Object.getOwnPropertyDescriptors(src);
    for (const key of Object.keys(desc)) {
      const d = desc[key];
      d.enumerable = false;
      Object.defineProperty(Cls.prototype, key, d);
    }
  }
  return Cls;
}
