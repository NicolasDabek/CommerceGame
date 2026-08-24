/**
 * 15 objets d'exemple — Univers contemporain
 * Chaque objet possède : id, name, category, rarity, basePrice, description
 * quality & perfection sont gérés par instance dans l'inventaire / les offres
 */

export const ITEMS = [
  {
    id: 'item_001',
    name: 'Smartphone reconditionné',
    category: 'Électronique',
    rarity: 'Commun',
    basePrice: 180.00,
    icon: '📱',
    description: 'Téléphone remis à neuf, bon état général. Très demandé.'
  },
  {
    id: 'item_002',
    name: 'Écouteurs sans fil',
    category: 'Électronique',
    rarity: 'Commun',
    basePrice: 45.00,
    icon: '🎧',
    description: 'Autonomie correcte, son correct. Produit d’appel.'
  },
  {
    id: 'item_003',
    name: 'Ordinateur portable d’occasion',
    category: 'Électronique',
    rarity: 'Rare',
    basePrice: 420.00,
    icon: '💻',
    description: 'Modèle récent, quelques traces d’usage. Forte valeur.'
  },
  {
    id: 'item_004',
    name: 'Café en grains (1kg)',
    category: 'Nourriture',
    rarity: 'Commun',
    basePrice: 12.50,
    icon: '☕',
    description: 'Arabica de qualité moyenne. Consommation régulière.'
  },
  {
    id: 'item_005',
    name: 'Chocolat artisanal (boîte)',
    category: 'Nourriture',
    rarity: 'Rare',
    basePrice: 28.00,
    icon: '🍫',
    description: 'Production limitée. Prix sensible aux saisons.'
  },
  {
    id: 'item_006',
    name: 'Veste en jean vintage',
    category: 'Vêtements',
    rarity: 'Commun',
    basePrice: 55.00,
    icon: '🧥',
    description: 'Coupe classique, bon état. Toujours en demande.'
  },
  {
    id: 'item_007',
    name: 'Sneakers édition limitée',
    category: 'Vêtements',
    rarity: 'Épique',
    basePrice: 220.00,
    icon: '👟',
    description: 'Modèle rare, très recherché par les collectionneurs.'
  },
  {
    id: 'item_008',
    name: 'Perceuse-visseuse',
    category: 'Outils',
    rarity: 'Commun',
    basePrice: 65.00,
    icon: '🔩',
    description: 'Outil polyvalent, indispensable pour le bricolage.'
  },
  {
    id: 'item_009',
    name: 'Scie circulaire pro',
    category: 'Outils',
    rarity: 'Rare',
    basePrice: 175.00,
    icon: '⚙️',
    description: 'Matériel professionnel. Usure importante possible.'
  },
  {
    id: 'item_010',
    name: 'Cuivre recyclé (lingot)',
    category: 'Ressources',
    rarity: 'Commun',
    basePrice: 8.40,
    icon: '🟠',
    description: 'Matière première. Prix très sensible à l’offre mondiale.'
  },
  {
    id: 'item_011',
    name: 'Composants électroniques',
    category: 'Ressources',
    rarity: 'Rare',
    basePrice: 35.00,
    icon: '🔌',
    description: 'Lot de composants divers. Utile pour le craft.'
  },
  {
    id: 'item_012',
    name: 'Bois de palette traité',
    category: 'Ressources',
    rarity: 'Commun',
    basePrice: 4.20,
    icon: '🪵',
    description: 'Matériau de base pour le craft et la construction.'
  },
  {
    id: 'item_013',
    name: 'Montre connectée',
    category: 'Électronique',
    rarity: 'Rare',
    basePrice: 95.00,
    icon: '⌚',
    description: 'Suivi sportif + notifications. Bon rapport qualité/prix.'
  },
  {
    id: 'item_014',
    name: 'Parfum de niche (50ml)',
    category: 'Divers',
    rarity: 'Épique',
    basePrice: 140.00,
    icon: '🧴',
    description: 'Édition limitée. Forte marge possible.'
  },
  {
    id: 'item_015',
    name: 'Drone d’occasion',
    category: 'Électronique',
    rarity: 'Épique',
    basePrice: 310.00,
    icon: '🛸',
    description: 'Quelques heures de vol. Pièce convoitée.'
  }
];

/**
 * Helper : retrouve un objet par son id
 */
export function getItemById(id) {
  return ITEMS.find(item => item.id === id) || null;
}

/**
 * Helper : filtre par catégorie
 */
export function getItemsByCategory(category) {
  if (category === 'all') return ITEMS;
  return ITEMS.filter(item => item.category === category);
}
