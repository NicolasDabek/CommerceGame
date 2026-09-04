/**
 * 15 PNJ marchands — profils un peu intelligents
 * Chaque PNJ a un style de jeu qui influence ses décisions
 */

export const CLANS = [
  {
    id: 'circuit',
    name: 'Circuit Nord',
    icon: '🔌',
    color: '#3d8bfd',
    specialty: 'Électronique',
    rivalId: 'forge',
    motto: 'Pièces nettes, marges nettes.',
    joinRep: 8
  },
  {
    id: 'forge',
    name: 'Forge Ouest',
    icon: '⚒️',
    color: '#d97706',
    specialty: 'Outils & ressources',
    rivalId: 'circuit',
    motto: 'Volume et ferraille.',
    joinRep: 8
  },
  {
    id: 'halle',
    name: 'Halle Centrale',
    icon: '🥖',
    color: '#16a34a',
    specialty: 'Nourriture',
    rivalId: 'atelier',
    motto: 'Rotation rapide, caisse pleine.',
    joinRep: 6
  },
  {
    id: 'atelier',
    name: 'Atelier des rives',
    icon: '🧵',
    color: '#a855f7',
    specialty: 'Mode & collections',
    rivalId: 'halle',
    motto: 'Le rare se paie.',
    joinRep: 10
  }
];

export function getClanById(id) {
  return CLANS.find(c => c.id === id) || null;
}

export const NPCS = [
  {
    id: 'npc_01',
    name: 'Léa Martin',
    personality: 'prudent',
    preferredCategories: ['Électronique', 'Divers'],
    aggressiveness: 0.3,
    capital: 800,
    clanId: 'circuit',
    description: 'Revendeuse prudente, préfère les petites marges sûres.'
  },
  {
    id: 'npc_02',
    name: 'Karim Benali',
    personality: 'agressif',
    preferredCategories: ['Ressources', 'Outils'],
    aggressiveness: 0.8,
    capital: 1500,
    clanId: 'forge',
    description: 'Spéculateur, n’hésite pas à prendre des risques.'
  },
  {
    id: 'npc_03',
    name: 'Sophie Dubois',
    personality: 'artisan',
    preferredCategories: ['Outils', 'Ressources'],
    aggressiveness: 0.4,
    capital: 600,
    clanId: 'forge',
    description: 'Achète des matériaux, revend des objets craftés plus tard.'
  },
  {
    id: 'npc_04',
    name: 'Thomas Leroy',
    personality: 'collectionneur',
    preferredCategories: ['Électronique', 'Vêtements'],
    aggressiveness: 0.5,
    capital: 2000,
    clanId: 'atelier',
    description: 'Cherche les objets rares et éditions limitées.'
  },
  {
    id: 'npc_05',
    name: 'Fatima Zahra',
    personality: 'épicier',
    preferredCategories: ['Nourriture'],
    aggressiveness: 0.6,
    capital: 450,
    clanId: 'halle',
    description: 'Tourne rapidement les produits alimentaires.'
  },
  {
    id: 'npc_06',
    name: 'Nicolas Petit',
    personality: 'opportuniste',
    preferredCategories: ['Électronique', 'Divers'],
    aggressiveness: 0.7,
    capital: 1200,
    clanId: 'circuit',
    description: 'Surveille les bons plans et les erreurs de prix.'
  },
  {
    id: 'npc_07',
    name: 'Camille Rousseau',
    personality: 'prudent',
    preferredCategories: ['Vêtements', 'Divers'],
    aggressiveness: 0.35,
    capital: 700,
    clanId: 'atelier',
    description: 'Mode et accessoires, marges confortables.'
  },
  {
    id: 'npc_08',
    name: 'Mehdi Saïd',
    personality: 'agressif',
    preferredCategories: ['Ressources', 'Électronique'],
    aggressiveness: 0.85,
    capital: 1800,
    clanId: 'forge',
    description: 'Gros volumes, prix serrés.'
  },
  {
    id: 'npc_09',
    name: 'Emma Bernard',
    personality: 'artisan',
    preferredCategories: ['Outils', 'Ressources'],
    aggressiveness: 0.45,
    capital: 550,
    clanId: 'forge',
    description: 'Bricoleuse, revend du matériel reconditionné.'
  },
  {
    id: 'npc_10',
    name: 'Lucas Moreau',
    personality: 'collectionneur',
    preferredCategories: ['Électronique'],
    aggressiveness: 0.55,
    capital: 2500,
    clanId: 'circuit',
    description: 'Passionné de tech, paie le prix fort pour les pépites.'
  },
  {
    id: 'npc_11',
    name: 'Amina Khelifi',
    personality: 'épicier',
    preferredCategories: ['Nourriture', 'Divers'],
    aggressiveness: 0.5,
    capital: 380,
    clanId: 'halle',
    description: 'Petits lots, rotation rapide.'
  },
  {
    id: 'npc_12',
    name: 'Julien Garcia',
    personality: 'opportuniste',
    preferredCategories: ['Vêtements', 'Électronique'],
    aggressiveness: 0.75,
    capital: 1100,
    clanId: 'atelier',
    description: 'Flair pour les tendances du moment.'
  },
  {
    id: 'npc_13',
    name: 'Chloé Lefebvre',
    personality: 'prudent',
    preferredCategories: ['Divers', 'Nourriture'],
    aggressiveness: 0.3,
    capital: 650,
    clanId: 'halle',
    description: 'Gestion prudente, évite les gros risques.'
  },
  {
    id: 'npc_14',
    name: 'Hugo Fontaine',
    personality: 'agressif',
    preferredCategories: ['Outils', 'Ressources'],
    aggressiveness: 0.9,
    capital: 1600,
    clanId: 'forge',
    description: 'Toujours à l’affût d’une bonne affaire volume.'
  },
  {
    id: 'npc_15',
    name: 'Sarah Cohen',
    personality: 'collectionneur',
    preferredCategories: ['Vêtements', 'Divers'],
    aggressiveness: 0.5,
    capital: 1900,
    clanId: 'atelier',
    description: 'Objets de caractère et pièces limitées.'
  }
];

export function getNpcById(id) {
  return NPCS.find(n => n.id === id) || null;
}
