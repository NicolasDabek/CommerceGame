import { filterCommands, norm } from '../js/ui/CommandPalette.js';
import { classifyStatus } from '../js/ui/Notifications.js';
import { assert, assertEqual, runSuite } from './assert.js';

export function run() {
  const cmds = [
    { title: 'Aller : Atelier', pinned: true },
    { title: 'Pain de campagne — fiche', keywords: 'Nourriture' },
    { title: 'Acheter Pain de campagne', keywords: 'achat' },
    { title: 'Marchand : Léa Martin', keywords: 'pnj' },
    { title: 'Emprunter au Comptoir (crédit)', keywords: 'pret' }
  ];
  return runSuite('interface', [
    ['palette : recherche sans accents, tous les mots, titres commençant par la requête d\'abord', async () => {
      assertEqual(norm('Crédit Léa'), 'credit lea');
      assertEqual(filterCommands(cmds, 'lea')[0].title, 'Marchand : Léa Martin');
      assertEqual(filterCommands(cmds, 'credit').length, 1);
      const pain = filterCommands(cmds, 'pain');
      assertEqual(pain[0].title, 'Pain de campagne — fiche', 'commence par la requête');
      assertEqual(filterCommands(cmds, 'acheter pain').length, 1, 'tous les mots');
      assertEqual(filterCommands(cmds, '').length, 1, 'vide → épinglés');
      assertEqual(filterCommands(cmds, 'zzz').length, 0);
    }],
    ['notifications : classement alertes / affaires / événements', async () => {
      assertEqual(classifyStatus('🔔 Pain sous 2 €'), 'alert');
      assertEqual(classifyStatus('Crédit remboursé automatiquement : −20 €'), 'deal');
      assertEqual(classifyStatus('Événement : Bonne récolte'), 'event');
      assert(true);
    }]
  ]);
}
