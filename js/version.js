/**
 * Version du jeu et du format de sauvegarde.
 * GAME_VERSION suit le versionnage sémantique (package.json, CHANGELOG.md, tag Git).
 * SAVE_VERSION n'augmente que si le format de la sauvegarde change : ajoutez alors une étape dans
 * js/core/game/saveMigration.js (MIGRATIONS[n] : format n → n + 1) pour que les anciennes parties restent jouables.
 */
export const GAME_VERSION = '1.0.0';
export const SAVE_VERSION = 1;
