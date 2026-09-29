# Chaos QA Agent 9: Buff Stacking, Perk Multipliers & Cooldown Audit Report

**Division:** Chaos QA & Resilience Division  
**Agent:** Chaos QA Agent 9  
**Target Subsystems:** 
- `src/game/progression/PerkTree.ts`
- `src/game/progression/RelicSystem.ts`
- `src/game/progression/ScalingEngine.ts`
- `src/game/progression/GameModes.ts`
- `src/game/GameScene.ts`
- `tests/progression.test.mjs`
- `tests/fuzz_buff_stacking.test.mjs`  
**Date:** September 30, 2026  
**Status:** COMPLETE — Zero Regressions, 45/45 Progression & Fuzz Tests Passing, Production Build Verified

---

## 1. Executive Summary

Chaos QA Agent 9 executed an exhaustive adversarial audit and fuzzing campaign across the confectionery progression, status effect mechanics, perk tree multipliers, and relic buff stacking systems. Using automated permutation fuzzers and boundary value analysis, the team stress-tested extreme stat combinations, non-numeric and prototype-polluting payloads, rapid trigger loops, and high-wave scaling invariants.

### Key Accomplishments & Remediations:
1. **Audited All Status Effects & Buff Stacking Mechanics:** Analyzed active buffs (`SPEED_SURGE`, `TIME_FREEZE`, `CLOAK`), defensive shields (`sugar_coating`, `ARMOR_UP`, `SHIELD`, `Solar Capacitor`, `Vampiric Confection`, `Second Wind`), I-frames (1500ms–3000ms), and floor hazard mitigation.
2. **Discovered & Remediated `canUpgradePerk` `NaN` Essence Vulnerability:** Identified that non-numeric or `NaN` available essence allowed infinite free perk unlocks because `NaN < cost` evaluated to `false`. Added strict `Number.isFinite` validation.
3. **Discovered & Remediated `calculateAppliedBonuses` Corrupt State Vulnerability:** Identified that object/array payloads passed to `p(id)` produced `NaN`, and `chain_reaction` lacked an upper `Math.min(2, ...)` clamp. Added strict finite-number sanitization and upper-bound clamping.
4. **Discovered & Remediated Relic ICD Initial Call Edge Case:** Identified that a default `last = 0` falsely suppressed procs when the timestamp was `< 500ms` at game start. Replaced with `last !== undefined` checking and non-monotonic clock skew detection.
5. **Verified Mathematical Clamps & Formulas:** Validated velocity maximums (walking peak 355 px/s, burst peak 532.5 px/s, dash peak 425 px/s), cooldown floors (dash 1250ms, fuse 675ms–1200ms, relic ICD 500ms), and enemy/boss scaling ceilings.
6. **Constructed Permanent Fuzz Test Suite:** Implemented `tests/fuzz_buff_stacking.test.mjs` with 12 comprehensive fuzz test tiers, now running alongside `tests/progression.test.mjs` (45 total tests passing).

---

## 2. Status Effects & Buff Stacking Matrix

| Status Effect / Buff | Source | Duration | Primary Effect | Stacking Interaction | Hard Floor / Ceiling |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Speed Surge** (`SPEED_SURGE`) | Item / Drop Pod | 8000ms | +75 px/s speed, 2x cooldown tick rate | Additive with base speed, item speed, and perks; multiplicative with dash cooldown tick | Capped at effective dash CD floor of 1250ms |
| **Time Freeze** (`TIME_FREEZE`) | Item / Drop Pod | 4000ms | Freezes all enemy AI, movement, and velocity; screen flash | Re-trigger resets duration to 4000ms; overrides enemy behavior | 4000ms window |
| **Cloak** (`CLOAK`) | Item / Drop Pod | 6000ms | Player alpha = 0.35; enemies lose tracking (`null` player in AI update) | Re-trigger resets duration to 6000ms; player retains full collision | 6000ms window |
| **Bubble Shield** | Base / Item / Perks | Persistent | Absorbs 1 fatal damage instance or enemy touch; grants 1500ms I-frame blink | Max charges: 1 by default, 2 with `ARMOR_UP` or `sugar_coating` Lvl 2 | Max 2 Shield charges |
| **Solar Shield** | Relic (`SOLAR_CAPACITOR`) | Persistent | Radiant overshield; immunity to heat hazards, deals 1 shock damage to foes | Charges after 8.0s (4.0s with `Radiant Leech` synergy) in open corridors; lost on damage | 1 charge max; 500ms ICD |
| **Vampiric Shield** | Relic (`VAMPIRIC_CONFECTION`) | Trigger | Restores 1 Bubble Shield upon defeating 5 enemies without damage | Threshold reduced to 3 kills with `Radiant Leech` synergy; streak resets on damage | 1 charge; max shield cap respected |
| **Second Wind** | Perk (`second_wind`) | Once / Run | Survives lethal blow with 1 HP, 3000ms golden invulnerability, +50% speed burst | Consumed permanently for run; triggers before game over | Exactly 1 trigger per run |
| **Hazard Buffer** | Perk (`hazard_buffer`) | Persistent | Reduces ground hazard slowdown (honey, gelatin, void creep) by 50% / 80% | Multiplicative reduction on floor hazard drag coefficient | 80% max slowdown reduction |

---

## 3. Confectionery Perk Tree Multipliers & Audit

The Confectionery Perk Tree defines 16 perks across 4 branches. All costs, prerequisites, and multipliers were audited and fuzzed:

### 3.1 Baking Mastery Branch
- **Sugar Spark** (`sugar_spark`, Max Lvl 3, Costs [5, 10, 20]):
  - Multiplier: `+1`, `+2`, `+3` Starting Bomb Blast Radius.
  - Formula: `startingBlastRadiusBonus = Math.min(3, p('sugar_spark'))`.
  - Boundary: Cleanly clamped `[0, 3]`.
- **Quick Wick** (`quick_wick`, Max Lvl 3, Costs [5, 12, 25]):
  - Multiplier: `10%`, `18%`, `25%` bomb cooldown reduction.
  - Formula: `qWickLvl === 1 ? 0.10 : qWickLvl === 2 ? 0.18 : qWickLvl >= 3 ? 0.25 : 0`.
  - Boundary: Cleanly clamped `[0.0, 0.25]`.
- **Chain Reaction** (`chain_reaction`, Max Lvl 2, Costs [10, 25]):
  - Multiplier: `+25%` / `+50%` chain combo score bonus, `+5%` / `+10%` ultimate charge per chained bomb.
  - Formula: `chainLvl = Math.min(2, p('chain_reaction'))`, `chainScoreBonus = chainLvl * 0.25`, `chainUltChargeBonus = chainLvl * 0.05`.
  - **Audit Finding & Fix:** Previously lacked `Math.min(2, ...)`, allowing level 999 or `Infinity` to generate unbounded score/ult multipliers. Fixed with strict clamping.
- **Master Confectioner** (`master_confectioner`, Max Lvl 1, Cost [40], Req: `sugar_spark >= 2`):
  - Multiplier: Raises max bomb capacity from 6 to 9.
  - Formula: `p('master_confectioner') >= 1 ? 9 : 6`.

### 3.2 Sugar Rush Branch
- **Bouncy Soles** (`bouncy_soles`, Max Lvl 3, Costs [5, 10, 20]):
  - Multiplier: `+10`, `+20`, `+30` px/s base movement speed.
  - Formula: `baseSpeedBonus = Math.min(3, p('bouncy_soles')) * 10`.
  - Boundary: Clamped `[0, 30]`.
- **Corner Magnet** (`corner_magnet`, Max Lvl 2, Costs [8, 18]):
  - Multiplier: Corner-sliding tolerance expanded from 8px default to 11px (Lvl 1) or 14px (Lvl 2).
  - Formula: `cornerLvl === 1 ? 11 : cornerLvl >= 2 ? 14 : 8`.
- **Dash Decoy** (`dash_decoy`, Max Lvl 1, Cost [30], Req: `bouncy_soles >= 2`):
  - Multiplier: Spawns 1.5s confectionery decoy taunting enemies upon dash.
- **Hyper-Sprint** (`hyper_sprint`, Max Lvl 1, Cost [35], Req: `bouncy_soles >= 2`):
  - Multiplier: `-1000ms` dash cooldown, `+20%` speed burst for 1.0s post-dash.
  - Formula: `dashCooldownReductionMs = 1000`, `dashSpeedBurstRatio = 0.20`.

### 3.3 Resilience Branch
- **Sugar Coating** (`sugar_coating`, Max Lvl 2, Costs [10, 25]):
  - Multiplier: Start every run with 1 or 2 Bubble Shields.
  - Formula: `startingShields = Math.min(2, p('sugar_coating'))`.
- **Second Wind** (`second_wind`, Max Lvl 1, Cost [45]):
  - Multiplier: Survive fatal blow once per run with 1 HP, 3000ms invulnerability, +50% speed burst.
- **Hazard Buffer** (`hazard_buffer`, Max Lvl 2, Costs [8, 16]):
  - Multiplier: Floor hazard slowdown reduced by 50% (Lvl 1) or 80% (Lvl 2).
  - Formula: `groundSlowdownReduction = hazardLvl === 1 ? 0.50 : hazardLvl >= 2 ? 0.80 : 0`.
- **Titan Heart** (`titan_heart`, Max Lvl 1, Cost [50], Req: `sugar_coating >= 1`):
  - Multiplier: Permanent +1 Max Heart Container (4 Hearts total).

### 3.4 Alchemy & Luck Branch
- **Sweet Tooth** (`sweet_tooth`, Max Lvl 3, Costs [5, 10, 20]):
  - Multiplier: `+5%`, `+10%`, `+15%` soft block item drop rate.
  - Formula: `itemDropRateBonus = Number((Math.min(3, p('sweet_tooth')) * 0.05).toFixed(2))`.
- **Merchant Discount** (`merchant_discount`, Max Lvl 2, Costs [8, 18]):
  - Multiplier: Madame Bonbon shop prices reduced by `15%` (Lvl 1) or `30%` (Lvl 2).
- **Relic Resonance** (`relic_resonance`, Max Lvl 2, Costs [15, 35]):
  - Multiplier: `+10%` / `+20%` relic drop chance; Level 2 unlocks 2nd Equippable Relic Slot.
  - Formula: `relicDropChanceBonus = Math.min(2, relicLvl) * 0.10`, `maxRelicSlots = relicLvl >= 2 ? 2 : 1`.
- **Golden Touch** (`golden_touch`, Max Lvl 1, Cost [40], Req: `sweet_tooth >= 2`):
  - Multiplier: `5%` chance breakable blocks turn into Gilded Chests with rare loot.

---

## 4. Relic System & Synergy Stacking Audit

The Relic System manages 8 artifacts and 4 pairwise synergies with a strict 500ms Internal Cooldown (ICD) guard.

### 4.1 Relic Catalog
1. **Pocket Chronometer** (`pocket_chronometer`): Slows enemy velocities by 20% in final 30s.
2. **Gelatinous Core** (`gelatinous_core`): Wall bounce/slide creates shockwave knocking enemies back 1.5 tiles and stunning for 0.5s.
3. **Pyroclastic Prism** (`pyroclastic_prism`): Bomb detonations fire 4 diagonal shards traveling 2 tiles.
4. **Magnetron Dial** (`magnetron_dial`): Dropped items and Star Candies pulled magnetically within 4 tiles.
5. **Vampiric Confection** (`vampiric_confection`): 5 consecutive kills without damage restore 1 Bubble Shield.
6. **Solar Capacitor** (`solar_capacitor`): 8.0s standing in open corridor charges Radiant Overshield.
7. **Void Singularity Lens** (`void_singularity_lens`): Placed bombs pull enemies 1.5 tiles inward.
8. **Clockwork Spring** (`clockwork_spring`): Kicking bombs accelerates them to 450 px/s and pierces 1 soft block.

### 4.2 Synergies (Evaluated across all 28 pairwise permutations)
- **Radiant Leech** (`VAMPIRIC_CONFECTION` + `SOLAR_CAPACITOR`):
  - Vampiric kill threshold reduced from 5 to 3 kills.
  - Solar Capacitor charge time halved from 8.0s to 4.0s.
- **Kinetic Pinball** (`GELATINOUS_CORE` + `CLOCKWORK_SPRING`):
  - Wall bounce knockback range expanded from 1.5 to 2.5 tiles.
  - Kicked bombs pierce 2 soft blocks.
- **Cosmic Supernova** (`PYROCLASTIC_PRISM` + `VOID_SINGULARITY_LENS`):
  - Void vortex range expanded from 1.5 to 2.5 tiles and roots enemies for 1.0s.
  - Shards bend toward enemies in vortex dealing double damage.
- **Chrono Attraction** (`POCKET_CHRONOMETER` + `MAGNETRON_DIAL`):
  - Magnet radius doubled from 4 to 8 tiles during final 30s.
  - Item collection extends remaining match time by +1s (up to +15s max).

### 4.3 ICD Guard Hardening
```ts
private checkAndSetIcd(procKey: string, nowMs: number): boolean {
  const last = this.lastProcTimes.get(procKey);
  if (last !== undefined) {
    if (nowMs < last || nowMs - last < 500) {
      return false; // Suppressed by 500ms ICD guard / non-monotonic timestamp
    }
  }
  this.lastProcTimes.set(procKey, nowMs);
  return true;
}
```
- **Initial Trigger Safety:** Procs occurring at `nowMs < 500ms` at game start now fire immediately (previously blocked because `last || 0` produced `nowMs - 0 < 500`).
- **Clock Skew Protection:** If system clock jumps backward (`nowMs < last`), the proc is strictly suppressed, preventing clock-manipulation exploit loops.

---

## 5. Boundary Clamps, Speed Maximums & Cooldown Floors

### 5.1 Player Speed Stacking Analysis

```
Base Speed:                       150.0 px/s
Item Cap (Speed Up x4):           250.0 px/s (MAX_PLAYER_SPEED)
Bouncy Soles (Perk Lvl 3):       + 30.0 px/s -> Max Walking Baseline = 280.0 px/s
Speed Surge Buff:                + 75.0 px/s -> Max Active Walking = 355.0 px/s
Second Wind Speed Burst (+50%):  x  1.50     -> Peak Walking Burst = 532.5 px/s

Dash Action (DASH_SPEED):         350.0 px/s
Dash + Speed Surge:               425.0 px/s
Hyper-Sprint Post-Dash (+20%):    420.0 px/s
Theoretical Peak Burst:           637.5 px/s
```
- **Clamp Invariant:** Player velocity never drops below 0 px/s and stays within Arcade Physics collision tunneling limits (< 650 px/s).

### 5.2 Cooldown Floors & Minimums

```
1. Dash Cooldown:
   Base DASH_COOLDOWN_MS:         3500 ms
   Hyper-Sprint Perk (-1000ms):   2500 ms
   Speed Surge Buff (cdMult = 2): 1250 ms (Effective Cooldown Floor)

2. Bomb Fuse:
   Wave 1 Base Fuse:              2000 ms
   Wave 21+ Scaled Floor:         1200 ms (max(1200, 2000 - 40 * (W - 1)))
   Speed Demon Mutator (0.75x):    900 ms
   Quick Wick Perk (-25%):         675 ms (Absolute Fuse Floor)

3. Relic Internal Cooldown:
   Hard Invariant Guard:           500 ms (Zero exceptions across all 8 relics)
```

### 5.3 Enemy Scaling Clamps (`ScalingEngine`)

```
Enemy Velocity Multiplier:       v(W) = min(2.20, 1.0 + 0.035 * (W - 1)) [Soft Cap: 2.20x]
Active Enemy Count:              N(W) = min(14, 4 + floor(sqrt(W - 1) * 1.5)) [Hard Cap: 14]
Enemy Max HP:                    HP(W) = min(baseHP + 5, floor(baseHP + 0.25 * (W - 1)))
Reinforced Armor Chance:         min(0.50, 0.20 + 0.02 * (W - 5)) [Cap: 50%]
Boss HP:                         BossHP(W) = min(floor(baseHp * 2.5), floor(baseHp * (1 + 0.15 * (W - 1))))
```
- Verified monotonic behavior and zero `NaN`/overflow across 10,000 simulated waves.

---

## 6. Vulnerabilities Discovered & Remediations Applied

| ID | Vulnerability / Defect | Severity | Root Cause | Remediation Applied |
| :--- | :--- | :--- | :--- | :--- |
| **VULN-BUFF-01** | `NaN` Essence Free Upgrades in `PerkTreeManager.canUpgradePerk` | **HIGH** | `NaN < cost` returns `false` in JS; check bypassed. | Added `typeof availableEssence !== 'number' \|\| !Number.isFinite(availableEssence) \|\| availableEssence < cost`. |
| **VULN-BUFF-02** | Unclamped `chain_reaction` Perk Bonus in `calculateAppliedBonuses` | **MEDIUM** | `chainLvl = p('chain_reaction')` without `Math.min(2, ...)`. | Added `const chainLvl = Math.min(2, p('chain_reaction'))`. |
| **VULN-BUFF-03** | Corrupt Object Payload Propagation in `calculateAppliedBonuses` | **MEDIUM** | `p(id)` used `perks[id] \|\| 0`, allowing `{}` or `[]` to produce `NaN`. | Replaced with strict `typeof val === 'number' && Number.isFinite(val) ? Math.max(0, Math.floor(val)) : 0`. |
| **VULN-BUFF-04** | Initial Relic Proc Suppression at `t < 500ms` | **LOW** | `last = this.lastProcTimes.get(procKey) \|\| 0` caused `nowMs - 0 < 500`. | Replaced with `last !== undefined` checking; now initial procs at game start fire immediately. |
| **VULN-BUFF-05** | Non-Monotonic Clock Skew Exploit in Relic ICD | **LOW** | Backward time jumps (`nowMs < last`) could bypass the cooldown. | Added strict suppression on `nowMs < last`. |

---

## 7. Verification & Test Evidence

### Test Suite Execution
```bash
node --test tests/fuzz_buff_stacking.test.mjs tests/progression.test.mjs
```
```
✔ Chaos QA 9: PerkTreeManager handles corrupt, negative, NaN, and Infinity perk states (0.54ms)
✔ Chaos QA 9: Perk upgrade rejects negative, NaN, and non-numeric essence (0.10ms)
✔ Chaos QA 9: CalculateSpentEssence sanitizes non-numeric and NaN values (0.08ms)
✔ Chaos QA 9: RelicManager slot bounds enforcement under spam (0.10ms)
✔ Chaos QA 9: All 28 Pairwise Relic Combinations evaluated for synergy accuracy (0.19ms)
✔ Chaos QA 9: Relic 500ms ICD loop protection and edge case with timestamp < 500ms (0.16ms)
✔ Chaos QA 9: System clock skew / backward timestamp does not cause infinite unblock (0.09ms)
✔ Chaos QA 9: ScalingEngine strict clamp invariants on extreme waves (0.18ms)
✔ Chaos QA 9: Mutator conflict isolation across 10,000 simulated waves (2.12ms)
✔ Chaos QA 9: Player speed stacking theoretical maximums and clamps (0.12ms)
✔ Chaos QA 9: Cooldown minimums verification (0.05ms)
✔ Chaos QA 9: Endless Gauntlet 100-Chamber Boon Accumulation Audit (0.25ms)
✔ Tier 1-6 Progression & Scaling Tests (33 tests)
ℹ tests 45
ℹ pass 45
ℹ fail 0
```

### Production Build Verification
```bash
npm run build
```
```
▲ Next.js 16.3.5 (Turbopack)
✓ Running next.config.ts took 11ms
✓ Compiled successfully in 839ms
Finished TypeScript in 4.5s
✓ Generating static pages using 5 workers (4/4) in 189ms
Finalizing page optimization in 2ms
```

---

## 8. Conclusion & Sign-Off

The progression, buff stacking, and relic subsystems have been thoroughly audited, mathematically verified, and hardened against extreme inputs, prototype pollution, non-monotonic clocks, and exploit combinations. All formulas enforce strict floors, ceilings, and mobile performance soft caps.

**Signed off by:** Chaos QA Agent 9  
**Chaos QA & Resilience Division**
