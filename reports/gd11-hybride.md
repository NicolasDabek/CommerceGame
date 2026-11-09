# GD passe 11 — trader hybride (crédit + clients d'étal), 20 graines appariées, 120 j

| robot | €/j moyen | IC95 | masse min–max | paiements PNJ ≤ 0 | trésorerie PNJ min | ventes d'étal/j |
|---|---|---|---|---|---|---|
| honest | 6.57 | ±0.87 | 1.002–1.024 | 0 | 1.27 | 0 |
| haggler | 8.02 | ±1.16 | 0.974–1.045 | 0 | 1.86 | 0.45 |
| trader | 8.49 | ±1.4 | 1.002–1.054 | 0 | 0.93 | 0 |
| trader_no_loan | 7.23 | ±0.79 | 0.989–1.024 | 0 | 1.54 | 0 |
| trader_hybrid | 7.45 | ±1.18 | 1.002–1.055 | 0 | 1.58 | 0.44 |
| trader_hybrid_no_loan | 6.98 | ±0.74 | 0.953–1.022 | 0 | 1.32 | 0.44 |
| trader_hybrid_keep | 9.07 | ±1.18 | 1.002–1.057 | 0 | 1.62 | 0.33 |
| trader_hybrid_keep_no_loan | 7.84 | ±1.14 | 0.971–1.028 | 0 | 0.98 | 0.31 |

## Ratios et différences appariées (par graine)

- hybride / honnête : 1.13 (cible ≤ 1,35) ; différence appariée 0.88 ± 1.32 €/j
- crédit, hybride : 1.07 (cible 1,15–1,25) ; différence appariée 0.47 ± 1.21 €/j
- historique trader / honnête : 1.29 ; crédit historique : 1.17
- apport des clients d'étal au trader (hybride − historique) : -1.04 ± 1.14 €/j
- hybride « garde son stock » / honnête : 1.38 ; crédit : 1.16 ; différence appariée 1.23 ± 1.53 €/j
- marchandeur / honnête : 1.22 (cible 1,20–1,35) ; différence appariée 1.45 ± 1.52 €/j

## Marchandeur : accords, tickets d'étal

- accords marchandés/j : 1.42 (cible ≥ 1,5) ; ventes marchandées/j : 0.45 (cible ≥ 0,4)
- gain moyen par accord : 1.34 € (visé 0,9–1,1 €)
- tickets d'étal (1067 ventes) : p10 5.53 € · médiane 17.86 € · p90 80.95 € · max 661.76 €
- marge totale des ventes d'étal : 2.43 €/j

## Frontière : plafond anti-flip à l'étal (STALL_TUNING.flipCap, désactivé)

| réaction du marchandeur | €/j (20 graines) | / honnête (cible ≥ 1,20) | / honnête, 3 premières graines (garde-fou ≥ 0,85) | ventes marchandées/j (≥ 0,4) | accords/j (≥ 1,3) |
|---|---|---|---|---|---|
| sans plafond (jeu actuel) | 8.02 | 1.22 | 1.02 | 0.45 | 1.42 |
| marge 1,05 sur revente rapide | 8.18 | 1.25 | 0.82 | 0.48 | 1.49 |
| marge 1,08 (inchangée) | 7.86 | 1.2 | 1.3 | 0.47 | 1.45 |
| ignore les reventes rapides | 8.07 | 1.23 | 1.06 | 0.24 | 1.18 |
| [hybride « garde son stock »] plafond 2 j | 8.57 | 1.3 | 0.91 | 0.39 | 0.91 |
| [hybride « garde son stock »] plafond 1 j | 9.42 | 1.43 | 1.33 | 0.37 | 0.88 |
| [marchandeur] plafond 1 j (jour même) | 8.31 | 1.26 | 0.99 | 0.44 | 1.44 |

