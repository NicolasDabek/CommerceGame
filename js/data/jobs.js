/**
 * Tables de données des métiers du joueur : paliers, réparations, récupération, recettes.
 * (extraites de systems/JobBoard.js)
 */

/** Paliers d'expérience des métiers du joueur (niveaux 1 à 5). */
export const PROFESSION_LEVELS = [0, 40, 120, 250, 450];

export const PLAYER_PROFESSIONS = {
  repair: { id: 'repair', label: 'Réparateur', icon: '🔧', text: 'Remet en état les objets abîmés sur l\'établi.' },
  craft: { id: 'craft', label: 'Artisan', icon: '🛠️', text: 'Fabrique des objets à partir de matériaux.' },
  trade: { id: 'trade', label: 'Négociant', icon: '📦', text: 'Livre les contrats et les commandes des marchands.' }
};

export function professionLevel(xp = 0) {
  let level = 1;
  PROFESSION_LEVELS.forEach((min, i) => { if (xp >= min) level = i + 1; });
  return level;
}

/** Réglages de l'établi de réparation. */
export const REPAIR_TUNING = {
  quickRestore: 15,            // points d'état gagnés par une réparation rapide
  quickHours: 4,               // durée (heures de jeu)
  refurbishBase: 85,           // état visé par une remise à neuf (+2 par niveau)
  refurbishHours: 10,
  suppliesBase: 2,             // fournitures : 2 € + état restauré × prix de base × 0,15 %
  suppliesRate: 0.0015,
  discountPerLevel: 0.06,      // −6 % de fournitures par niveau
  speedPerLevel: 0.1,          // −10 % de temps par niveau
  rareLevel: 2,                // niveau requis pour les objets rares
  epicLevel: 3                 // … et épiques
};

export const RARITY_LEVEL = { 'Commun': 1, 'Rare': REPAIR_TUNING.rareLevel, 'Épique': REPAIR_TUNING.epicLevel };

export const VAULT_DAILY_CAP = 300;

export const SCAVENGE_TABLE = [
  { itemId: 'item_012', w: 22 },
  { itemId: 'item_010', w: 20 },
  { itemId: 'item_004', w: 16 },
  { itemId: 'item_002', w: 14 },
  { itemId: 'item_006', w: 12 },
  { itemId: 'item_008', w: 8 },
  { itemId: 'item_011', w: 5 },
  { itemId: 'item_005', w: 3 }
];

export const RECIPES = [
  {
    id: 'craft_box',
    name: 'Coffret gourmand',
    minLevel: 1,
    cost: 3,
    focusCost: 2,
    qualityBonus: 8,
    inputs: [{ itemId: 'item_004', qty: 2 }],
    output: { itemId: 'item_005', qty: 1 }
  },
  {
    id: 'craft_drill',
    name: 'Assembler une perceuse',
    minLevel: 1,
    cost: 4,
    focusCost: 3,
    qualityBonus: 6,
    inputs: [{ itemId: 'item_012', qty: 2 }, { itemId: 'item_010', qty: 2 }],
    output: { itemId: 'item_008', qty: 1 }
  },
  {
    id: 'craft_jacket',
    name: 'Retaper une veste',
    minLevel: 1,
    cost: 5,
    focusCost: 3,
    qualityBonus: 10,
    inputs: [{ itemId: 'item_006', qty: 1 }, { itemId: 'item_012', qty: 1 }],
    output: { itemId: 'item_006', qty: 1 }
  },
  {
    id: 'craft_watch',
    name: 'Monter une montre',
    minLevel: 2,
    cost: 9,
    focusCost: 5,
    qualityBonus: 8,
    inputs: [{ itemId: 'item_011', qty: 1 }, { itemId: 'item_002', qty: 1 }],
    output: { itemId: 'item_013', qty: 1 }
  },
  {
    id: 'craft_saw',
    name: 'Monter une scie pro',
    minLevel: 2,
    cost: 12,
    focusCost: 6,
    qualityBonus: 7,
    inputs: [{ itemId: 'item_008', qty: 1 }, { itemId: 'item_010', qty: 3 }, { itemId: 'item_012', qty: 2 }],
    output: { itemId: 'item_009', qty: 1 }
  },
  {
    id: 'craft_phone',
    name: 'Reconditionner un smartphone',
    minLevel: 3,
    cost: 18,
    focusCost: 8,
    qualityBonus: 9,
    inputs: [{ itemId: 'item_013', qty: 1 }, { itemId: 'item_011', qty: 1 }, { itemId: 'item_002', qty: 1 }],
    output: { itemId: 'item_001', qty: 1 }
  }
];
