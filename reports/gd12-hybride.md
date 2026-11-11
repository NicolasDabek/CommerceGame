# GD passe 12 — trader hybride (crédit + clients d'étal), 20 graines appariées, 120 j

| robot | €/j moyen | IC95 | masse min–max | paiements PNJ ≤ 0 | trésorerie PNJ min | ventes d'étal/j |
|---|---|---|---|---|---|---|
| honest | 6.57 | ±0.87 | 1.002–1.024 | 0 | 1.27 | 0 |
| haggler | 8.31 | ±1.14 | 1.002–1.027 | 0 | 1.86 | 0.44 |
| trader | 8.49 | ±1.4 | 1.002–1.054 | 0 | 0.93 | 0 |
| trader_no_loan | 7.23 | ±0.79 | 0.989–1.024 | 0 | 1.54 | 0 |
| trader_hybrid | 8.21 | ±1.22 | 1.002–1.054 | 0 | 0.98 | 0.47 |
| trader_hybrid_no_loan | 7.17 | ±0.9 | 0.953–1.047 | 0 | 1.27 | 0.46 |
| trader_hybrid_keep | 8.76 | ±0.83 | 1.002–1.048 | 0 | 0.81 | 0.34 |
| trader_hybrid_keep_no_loan | 8.03 | ±1.2 | 1.002–1.041 | 0 | 0.93 | 0.32 |

## Ratios et différences appariées (par graine)

- hybride / honnête : 1.25 (cible ≤ 1,35) ; différence appariée 1.63 ± 1.52 €/j
- crédit, hybride : 1.15 (cible 1,15–1,25) ; différence appariée 1.03 ± 1.62 €/j
- historique trader / honnête : 1.29 ; crédit historique : 1.17
- apport des clients d'étal au trader (hybride − historique) : -0.28 ± 1.51 €/j
- hybride « garde son stock » / honnête : 1.33 ; crédit : 1.09 ; différence appariée 0.73 ± 1.47 €/j
- marchandeur / honnête : 1.26 (cible 1,20–1,35) ; différence appariée 1.74 ± 1.29 €/j

## Marchandeur : accords, tickets d'étal

- accords marchandés/j : 1.44 (cible ≥ 1,5) ; ventes marchandées/j : 0.44 (cible ≥ 0,4)
- gain moyen par accord : 1.38 € (visé 0,9–1,1 €)
- tickets d'étal (1055 ventes) : p10 5.57 € · médiane 18.05 € · p90 90.49 € · max 661.76 €
- marge totale des ventes d'étal : 2.56 €/j

## Frontière : règles GD 12 retirées une à une (20 graines appariées)

| configuration | marchandeur ×honnête (1,20–1,35) | 3 premières graines (≥ 0,85) | hybride ×honnête (≤ 1,35) | crédit hybride (1,15–1,25) | « garde son stock » ×honnête (≤ 1,35) |
|---|---|---|---|---|---|
| jeu actuel (anti-flip jour même + gage) | 1.26 | 0.99 | 1.25 | 1.15 | 1.33 |
| sans anti-flip ni gage (GD 11) | 1.22 | 1.02 | 1.13 | 1.07 | 1.38 |
| anti-flip seul (jour même) | 1.26 | 0.99 | 1.1 | 1 | 1.43 |
| gage + anti-flip 2 j | 1.25 | 0.82 | 1.3 | 1.29 | 1.3 |

## Lecture (GD passe 12)

- Décision : anti-flip d'étal ACTIVÉ au jour même (`STALL_TUNING.flipCap`, `flipDays: 1`) + marchandise gagée (`STALL_TUNING.pledge`). Aucun réglage des robots modifié ; honnête, trader historique, exploit et mauvais payeur strictement inchangés (mêmes résultats graine par graine).
- Chaque règle seule échoue : l'anti-flip seul laisse « garde son stock » à 1,43 et annule l'apport du crédit (1,00) ; le gage seul (sans anti-flip) ne tient pas : apport du crédit 1,03 (graines du test) / 1,11 (autre lot), « garde son stock » 1,26 / 1,50 ; l'anti-flip sur 2 jours fait tomber le garde-fou 3 graines du marchandeur (0,82 < 0,85) et dépasse la borne haute du crédit (1,29).
- Contrôle sur 20 autres graines (lot hors test, 40 graines au total) : marchandeur ×1,31, hybride ×1,23, apport du crédit à l'hybride ×1,17 (différence appariée +1,17 ± 1,06 €/j, significative), « garde son stock » ×1,29.
- Sur les 20 graines du test, l'apport du crédit à l'hybride vaut 1,145 (affiché 1,15) : au bord bas de la cible, dans le bruit (IC95 de la différence ±1,6 €/j). Le test garde la borne haute 1,25 et un garde-fou bas 1,10.
- Restent ouverts (inchangés depuis GD 10/11) : 1,44 accord marchandé/j (cible 1,5), gain moyen par accord 1,38 € (visé 0,9–1,1 €), apport du crédit à la variante « garde son stock » 1,09.
