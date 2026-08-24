/**
 * 15 PNJ marchands — profils un peu intelligents
 * Chaque PNJ a un style de jeu qui influence ses décisions
 */

export const NPCS = [
  {
    id: 'npc_01',
    name: 'Léa Martin',
    personality: 'prudent',          // vend un peu plus cher, achète moins cher
    preferredCategories: ['Électronique', 'Divers'],
    aggressiveness: 0.3,             // 0 = passif, 1 = très actif
    capital: 800,
    description: 'Revendeuse prudente, préfère les petites marges sûres.'
  },
  {
    id: 'npc_02',
    name: 'Karim Benali',
    personality: 'agressif',
    preferredCategories: ['Ressources', 'Outils'],
    aggressiveness: 0.8,
    capital: 1500,
    description: 'Spéculateur, n’hésite pas à prendre des risques.'
  },
  {
    id: 'npc_03',
    name: 'Sophie Dubois',
    personality: 'artisan',
    preferredCategories: ['Outils', 'Ressources'],
    aggressiveness: 0.4,
    capital: 600,
    description: 'Achète des matériaux, revend des objets craftés plus tard.'
  },
  {
    id: 'npc_04',
    name: 'Thomas Leroy',
    personality: 'collectionneur',
    preferredCategories: ['Électronique', 'Vêtements'],
    aggressiveness: 0.5,
    capital: 2000,
    description: 'Cherche les objets rares et éditions limitées.'
  },
  {
    id: 'npc_05',
    name: 'Fatima Zahra',
    personality: 'épicier',
    preferredCategories: ['Nourriture'],
    aggressiveness: 0.6,
    capital: 450,
    description: 'Tourne rapidement les produits alimentaires.'
  },
  {
    id: 'npc_06',
    name: 'Nicolas Petit',
    personality: 'opportuniste',
    preferredCategories: ['Électronique', 'Divers'],
    aggressiveness: 0.7,
    capital: 1200,
    description: 'Surveille les bons plans et les erreurs de prix.'
  },
  {
    id: 'npc_07',
    name: 'Camille Rousseau',
    personality: 'prudent',
    preferredCategories: ['Vêtements', 'Divers'],
    aggressiveness: 0.35,
    capital: 700,
    description: 'Mode et accessoires, marges confortables.'
  },
  {
    id: 'npc_08',
    name: 'Mehdi Saïd',
    personality: 'agressif',
    preferredCategories: ['Ressources', 'Électronique'],
    aggressiveness: 0.85,
    capital: 1800,
    description: 'Gros volumes, prix serrés.'
  },
  {
    id: 'npc_09',
    name: 'Emma Bernard',
    personality: 'artisan',
    preferredCategories: ['Outils', 'Ressources'],
    aggressiveness: 0.45,
    capital: 550,
    description: 'Bricoleuse, revend du matériel reconditionné.'
  },
  {
    id: 'npc_10',
    name: 'Lucas Moreau',
    personality: 'collectionneur',
    preferredCategories: ['Électronique'],
    aggressiveness: 0.55,
    capital: 2500,
    description: 'Passionné de tech, paie le prix fort pour les pépites.'
  },
  {
    id: 'npc_11',
    name: 'Amina Khelifi',
    personality: 'épicier',
    preferredCategories: ['Nourriture', 'Divers'],
    aggressiveness: 0.5,
    capital: 380,
    description: 'Petits lots, rotation rapide.'
  },
  {
    id: 'npc_12',
    name: 'Julien Garcia',
    personality: 'opportuniste',
    preferredCategories: ['Vêtements', 'Électronique'],
    aggressiveness: 0.75,
    capital: 1100,
    description: 'Flair pour les tendances du moment.'
  },
  {
    id: 'npc_13',
    name: 'Chloé Lefebvre',
    personality: 'prudent',
    preferredCategories: ['Divers', 'Nourriture'],
    aggressiveness: 0.3,
    capital: 650,
    description: 'Gestion prudente, évite les gros risques.'
  },
  {
    id: 'npc_14',
    name: 'Hugo Fontaine',
    personality: 'agressif',
    preferredCategories: ['Outils', 'Ressources'],
    aggressiveness: 0.9,
    capital: 1600,
    description: 'Toujours à l’affût d’une bonne affaire volume.'
  },
  {
    id: 'npc_15',
    name: 'Sarah Cohen',
    personality: 'collectionneur',
    preferredCategories: ['Vêtements', 'Divers'],
    aggressiveness: 0.5,
    capital: 1900,
    description: 'Objets de caractère et pièces limitées.'
  }
];

export function getNpcById(id) {
  return NPCS.find(n => n.id === id) || null;
}
