Commerce Tycoon — Prototype

Jeu de commerce inspiré des hôtels de vente de Dofus / Wakfu, avec des améliorations (hôtel d’achat, matching automatique, enchères, économie dynamique).

Prototype solo (avec PNJ), interface 2D, architecture prête pour un backend et un monde 3D (Three.js).



Démarrage rapide

Option recommandée — serveur local

cd /chemin/vers/commerce-tycoon
python3 -m http.server 8080

Ouvre ensuite : http://localhost:8080



Les modules ES (import / export) ne fonctionnent pas correctement en ouvrant le fichier via file://. Un serveur local est nécessaire.

Autres options

# Node
npx serve .

# PHP
php -S localhost:8080



Fonctionnalités actuelles

Commerce





Hôtel de vente





Prix de départ + prix d’achat immédiat (buyout) optionnel



Enchères (enchérir, argent bloqué, remboursement si surenchère)



Durées : 1 jour (3 % + 0,20 €), 2 jours (6 % + 0,20 €), 7 jours (10 % + 0,20 €)



Modification de prix (frais si le prix augmente)



Annulation (objets rendus, enchérisseur remboursé)



Hôtel d’achat





Offres d’achat multiples sur le même objet



Argent bloqué à l’avance



Bouton Vendre si tu possèdes l’objet demandé



Matching automatique





Si offre d’achat ≥ prix de vente → transaction au prix de vente



Surplus rendu à l’acheteur



Priorité FIFO (offre la plus ancienne d’abord)

Inventaire & joueur





10 cases (extensible plus tard), catégories, pas de poids



Qualité / perfection / rareté par stack



Prix moyen d’achat affiché et recalculé à l’empilement



Niveau, XP, réputation, stats de commerce



Liste noire (prévue)

Économie





Prix moyens mis à jour à chaque transaction



Inflation / déflation globale + par catégorie



Événements aléatoires (pénurie, récolte, criminalité, mode, etc.)

PNJ





15 marchands avec personnalités (prudent, agressif, collectionneur, etc.)



Ils vendent et achètent automatiquement selon leurs préférences



Noms affichés dans l’historique et les hôtels

Technique





100 % front-end (HTML / CSS / JS modules)



Sauvegarde automatique (localStorage)



Three.js déjà dans lib/ pour le futur monde 3D



Temps réel : 1 jour réel = 1 jour de jeu (expiration des offres)



Structure du projet

.
├── index.html              # Point d’entrée UI
├── css/style.css           # Style cartoon moderne
├── js/
│   ├── main.js             # Bootstrap, navigation, modals
│   ├── core/
│   │   ├── Game.js         # Orchestrateur principal
│   │   ├── Economy.js      # Prix, inflation, événements
│   │   └── TimeManager.js  # Jour / heure de jeu
│   ├── models/
│   │   ├── Player.js
│   │   ├── Inventory.js
│   │   ├── Offer.js
│   │   ├── Transaction.js
│   │   └── Item (via data/items.js)
│   ├── systems/
│   │   ├── MatchingEngine.js
│   │   ├── AuctionHouse.js
│   │   ├── BuyHouse.js
│   │   └── NPCController.js
│   ├── ui/
│   │   ├── HistoryUI.js
│   │   ├── AuctionHouseUI.js
│   │   ├── BuyHouseUI.js
│   │   └── InventoryUI.js
│   ├── data/
│   │   ├── items.js        # 15 objets d’exemple
│   │   └── npcs.js         # 15 PNJ
│   └── utils/
│       └── storage.js      # localStorage
└── lib/
    ├── three.module.js     # Three.js r170
    ├── OrbitControls.js
    ├── Scene3D.js          # Helper scène 3D
    └── README.md



Comment jouer (prototype)





Au premier lancement, tu reçois des objets de départ et 1 250 €.



Inventaire : regarde ce que tu as (prix moyen d’achat une fois que tu auras acheté).



Hôtel de vente : mets un objet en vente (prix de départ ± buyout).



Hôtel d’achat : crée une offre d’achat, ou vends directement à une offre PNJ si tu as l’objet.



Les PNJ postent des annonces toutes les ~8–30 s selon leur agressivité.



Historique : toutes les transactions (matching, buyout, fin d’enchère).

Reset de la sauvegarde

Dans la console du navigateur (F12) :

localStorage.clear();
location.reload();

Ou :

game.save(); // forcer une sauvegarde



Règles économiques (résumé)







Action



Effet





Mise en vente / offre d’achat



Frais % selon durée + 0,20 €





Matching auto



Transaction au prix de vente, surplus → acheteur





Enchère



Argent bloqué ; surenchère rembourse le précédent





Fin d’enchère



Plus offrant gagne ; sinon objets rendus au vendeur





Buyout



Achat immédiat au prix affiché





Vendre à une offre d’achat



Au prix proposé par l’acheteur



Roadmap (idées)





Métiers, récolte, craft, zones de production



Utilité des objets (combat, usure, démantèlement)



Graphiques de prix historiques



Ordres conditionnels



Taxes / listes noires côté UI



Plus d’objets et d’événements



Monde 3D (Three.js déjà prêt dans lib/)



Multijoueur / backend



Stack





HTML5 / CSS3 / JavaScript (ES modules)



Three.js r170 (préparé, non utilisé dans l’UI actuelle)



localStorage pour la persistance



Aucun framework UI (vanilla) pour rester léger et portable



Licence / notes

Prototype de développement. Univers contemporain, style cartoon, monnaie en euros (devise fictive possible plus tard).

Autres informations

Achat immédiat (buyout)

Les PNJ scrutent les annonces avec prix d’achat immédiat
Ils n’achètent que si c’est une bonne affaire (vs prix moyen) ou dans leurs catégories préférées
Le capital est vérifié et débité avant l’achat
Rollback automatique si la transaction échoue

Offres d’achat

Quantité limitée par le capital (réserve de 10 %)
Capital bloqué à la création de l’offre
Surplus remboursé si matching à un prix plus bas
Capital rendu si l’offre expire

Ventes

Toujours actives
Objets rendus au PNJ si l’annonce expire sans acheteur

Personnalités

Prudent : n’achète presque jamais trop cher
Collectionneur : accepte de payer plus pour ses catégories
Opportuniste / agressif : plus actifs sur les bonnes affaires

À chaque tick, un PNJ peut :

Faire un achat immédiat (buyout) s’il a assez de capital
Vendre à une offre d’achat s’il a l’objet en stock
Poster une annonce de vente
Poster une offre d’achat

Vente vers l’hôtel d’achat

Croisement inventaire PNJ ↔ offres d’achat actives
Quantité limitée par le stock du PNJ et la demande
Acceptation selon la personnalité :
Prudent : ne vend pas sous le prix moyen
Agressif : accepte dès ~85 % du marché
Opportuniste : à partir de ~90 %
Collectionneur : vend plus facilement ce qui n’est pas sa préférence

Objets retirés de l’inventaire PNJ
Capital crédité au vendeur via la transaction
L’acheteur (joueur ou PNJ) reçoit les objets

Tu verras dans l’historique des ventes où un PNJ est vendeur vers une offre d’achat. Recharge et laisse tourner quelques dizaines de secondes.