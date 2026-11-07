/** Réglages du marchandage : marges, styles de marchand, bonus de personnalité. */

export const NEGOTIATION_TUNING = {
  baseFlex: 0.03,          // marge de base (3 %)
  trustFlex: 0.07,         // + jusqu'à 7 % avec une confiance maximale
  moodFlex: 0.02,
  surplusFlex: 0.04,       // la ville déborde de cet objet
  shortageFlex: -0.04,     // pénurie : le PNJ ne lâche rien
  overstockFlex: 0.03,
  dryFlex: 0.04,           // trésorerie à sec : il a besoin de vendre
  collectorFlex: -0.05,    // collectionneur sur ses favoris
  maxFlex: 0.06,           // GD passe 8 : 7 % → 6 % (le robot marchandeur marchande 2× plus d'offres) ; GD passe 6 : 6,5 % → 7 % (7,5 % : marchandeur +98 %) ; passe 3 : rabais maximal −8 % ; passe 4 : plafond de la marge PERSONNELLE ; passe 5 : 8 % → 6,5 % (compense la patience du « bon client »)
  maxFlexTotal: 0.11,      // passe 4 : plafond absolu une fois ajoutés lot entier, argument et « bon client »
  winPatience: 0.08,       // GD passe 7 : 15 % → 8 % ; passe 3 : chaque marchandage réussi avec un PNJ abaisse sa patience…
  winPatienceDays: 2,      // … pendant 2 jours (GD passe 7 : 3 → 2)
  flipDays: 2,             // GD passe 8 : revendre un produit acheté il y a moins de 2 jours…
  flipFlexFactor: 0.5,     // … → marge de marchandage plafonnée à maxFlex × 0,5
  winFlex: true,           // … et sa marge de concession d'autant
  minBuyFlex: 0.05,        // passe 2 : −8 % ; passe 3 : −5 % (marge de base), le plafond passant à −8 %
  floorRef: 0.9,           // jamais sous 90 % du prix de référence
  ceilRef: 1.04,           // jamais au-dessus de 104 % du prix de référence (vente au PNJ)
  sellFlexFactor: 0.6,     // un PNJ acheteur lâche moins qu'un PNJ vendeur
  counterBand: 0.08,       // proposition à moins de 8 % du plancher → contre-offre
  insultRatio: 0.85,       // sous 85 % du plancher → offense
  insultTrust: 0.05,
  dealsPerNpc: 2,          // accords par marchand et par jour
  noBuyoutMarkup: 1.1,     // annonce sans achat immédiat : prix demandé = départ + 10 % (min. référence)
  bundleFlex: 0.02,        // lot entier (3+) : +2 % de marge
  bundleMinQty: 3,
  bluffFlex: 0.005,        // chaque « bluff » mémorisé retire 0,5 % de marge…
  bluffFlexMax: 0.019,     // … jusqu'à 1,9 % (passe 5 : 3 % → 2,5 % ; GD passe 6 : 2 % ; GD passe 7 : 1,9 %)
  bluffDecay: 0.7,         // la mémoire s'estompe chaque jour
  dealFlex: 0.004,         // un bon client (accords passés) gagne un peu de marge…
  dealFlexMax: 0.005,      // … jusqu'à 0,5 % (passe 4 : 2 % → 0,5 %, désormais hors plafond personnel)
  dealPatience: 2,         // GD passe 7 : 1 → 2 ; passe 5 : chaque accord passé efface des marchandages de la lassitude…
  dealPatienceMax: 3,      // … au plus 3
  dealPatienceFlex: true,  // … y compris sur la marge (sinon : seulement sur le nombre de tours)
  chanceSigma: 0.015       // incertitude de l'estimation de chance (± 1,5 % du prix)
};

/** Styles de marchandage (selon la personnalité). Concessions décroissantes : first × decay^(tour−1). */
export const HAGGLE_STYLES = {
  stubborn: { id: 'stubborn', label: 'Têtu', icon: '🪨', patience: 3, first: 0.3, decay: 0.45, text: 'Lâche peu et de moins en moins ; n\'aime pas les offres basses.' },
  generous: { id: 'generous', label: 'Arrangeant', icon: '😊', patience: 5, first: 0.55, decay: 0.7, text: 'Fait de vraies concessions et garde patience.' },
  greedy: { id: 'greedy', label: 'Gourmand', icon: '🦊', patience: 4, first: 0.35, decay: 0.55, text: 'Discute volontiers mais ses contre-offres restent hautes.' },
  impatient: { id: 'impatient', label: 'Pressé', icon: '⏱️', patience: 3, first: 0.6, decay: 0.5, text: 'Cède vite au début puis coupe court.' }
};
const STYLE_BY_PERSONALITY = { prudent: 'stubborn', collectionneur: 'stubborn', 'épicier': 'generous', artisan: 'generous', agressif: 'greedy', opportuniste: 'impatient' };
export function styleFor(npc) { return HAGGLE_STYLES[STYLE_BY_PERSONALITY[npc?.personality]] || HAGGLE_STYLES.greedy; }

export const personalityBonus = {
  agressif: 0.01,      // veut du volume
  'épicier': 0.015,    // rotation rapide
  prudent: -0.01,
  collectionneur: -0.01
};
