# Creative Expansion Specification: Corrosive Miasmic Flask & Bio-Electric Neuro-Overload
**Date:** 2026-11-13  
**Division:** Creative Expansion Division (7 Subagents)

## 1. 14th Relic: Corrosive Miasmic Flask (`CORROSIVE_MIASMIC_FLASK`)
- **Id:** `corrosive_miasmic_flask`
- **Rarity:** Epic (`🧪☣️`)
- **Internal Cooldown (ICD):** 500ms
- **Effect:** Bomb detonations release a corrosive acid cloud. Deals 45 acid damage and inflicts a 35% slow for 2.0s to up to 3 non-defeated targets within a 2.5-tile radius.
- **Combat Text:** `'☣️ MIASMIC CORROSION!'` (+150 score, +3 ult charge)

## 2. 10th Synergy: Bio-Electric Neuro-Overload
- **Partners:** `TESLA_OVERCHARGE_COIL` + `CORROSIVE_MIASMIC_FLASK`
- **Icon:** `⚡☣️`
- **Effect:** Bomb detonations cause an explosive neuro-electric shockwave. Radius expands to 3.5 tiles, dealing 130 damage, 50% slow for 3.0s, and a 2.0s EMP shock/stun.
- **Combat Text:** `'⚡☣️ NEURO-OVERLOAD!'` (+350 score, +5 ult charge)

## 3. Catalog Integrity
- 14 Relics, 10 Synergies, 91 Pairwise Combinations ($C(14, 2) = 91$).
- Full save/load serialization roundtrip verified.
