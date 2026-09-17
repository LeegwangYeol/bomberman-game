# E2E Test Infra: Bomberman Infinite Evolution & Massive Expansion

## Test Philosophy
- Opaque-box, requirement-driven. Derived strictly from user directives and game specifications.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.
- Extreme Performance & Reliability: 10,000-frame continuous soak test proving Zero-GC memory invariants ($\Delta\text{Heap} \le 0.25\text{MB}$), and adversarial Chaos Bots testing multi-touch, gauge overflow, rapid pause/resume, and physical boundary clipping.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | 1D Typed Array ZeroGCPathfinder | ORIGINAL_REQUEST §2, GDD §6 | 5 | 5 | ✓ |
| 2 | Contiguous ObjectPool Engine | ORIGINAL_REQUEST §2, GDD §6 | 5 | 5 | ✓ |
| 3 | Camera Shake Scratch Vectors | ORIGINAL_REQUEST §2, GDD §6 | 5 | 5 | ✓ |
| 4 | Flat Hazard Tile Bitmask | ORIGINAL_REQUEST §2, GDD §6 | 5 | 5 | ✓ |
| 5 | Web Audio AudioVoicePool | ORIGINAL_REQUEST §2, GDD §6 | 5 | 5 | ✓ |
| 6 | 10k-Frame Soak Test Harness | ORIGINAL_REQUEST §2, GDD §6 | 5 | 5 | ✓ |
| 7 | BaseBoss State Machine | ORIGINAL_REQUEST §1, GDD §2 | 5 | 5 | ✓ |
| 8 | 3-Tier Tile Telegraph Engine | ORIGINAL_REQUEST §1, GDD §2 | 5 | 5 | ✓ |
| 9 | King Gummy Bear Boss | ORIGINAL_REQUEST §1, GDD §2 | 5 | 5 | ✓ |
| 10 | Mecha Hamster Captain Nibbles | ORIGINAL_REQUEST §1, GDD §2 | 5 | 5 | ✓ |
| 11 | Queen Bee Cupcake Boss | ORIGINAL_REQUEST §1, GDD §2 | 5 | 5 | ✓ |
| 12 | Boss HUD & Health Bar | ORIGINAL_REQUEST §1, GDD §2 | 5 | 5 | ✓ |
| 13 | Crisis Manager FSM | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 14 | Pastel Void Incursion | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 15 | Clockwork Toy Rebellion | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 16 | Orbital Bombardment Crisis | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 17 | Solar Flare Crisis | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 18 | Creeping Lava Crisis | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 19 | Dimensional Rift Crisis | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 20 | Situation Log HUD | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 21 | Infinite Scaling Difficulty Engine | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 22 | Crisis Survival Game Mode | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 23 | Boss Rush Game Mode | ORIGINAL_REQUEST §1, GDD §2 | 5 | 5 | ✓ |
| 24 | Endless Gauntlet Game Mode | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 25 | Dual-Currency Economy | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 26 | Confectionery Perk Tree | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 27 | Relics & Artifacts System | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 28 | Persistent Score & Trophy Unlocks | ORIGINAL_REQUEST §1, GDD §5 | 5 | 5 | ✓ |
| 29 | Match Session Persistence | ORIGINAL_REQUEST §4, GDD §6 | 5 | 5 | ✓ |
| 30 | Meta-Profile LocalStorage Persistence | ORIGINAL_REQUEST §4, GDD §6 | 5 | 5 | ✓ |
| 31 | Export / Import Save State | ORIGINAL_REQUEST §4, GDD §6 | 5 | 5 | ✓ |
| 32 | API 429 Quota Recovery Circuit Breaker | ORIGINAL_REQUEST §4, GDD §6 | 5 | 5 | ✓ |
| 33 | Chaos Bot Multi-Touch Spam Test | ORIGINAL_REQUEST §3, GDD §6 | 5 | 5 | ✓ |
| 34 | Chaos Bot Boundary & Gauge Attack | ORIGINAL_REQUEST §3, GDD §6 | 5 | 5 | ✓ |
| 35 | Chaos Bot Fast Pause/Resume Stress | ORIGINAL_REQUEST §3, GDD §6 | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner**: Node.js native test runner (`node --experimental-strip-types --test tests/*.test.mjs`)
- **Memory Soak Execution**: `node --expose-gc --experimental-strip-types --test tests/soak_10k_frames.test.mjs`
- **Pass/Fail Semantics**: All test suites must exit code 0 with 0 failures and 0 skipped.
- **Directory Layout**:
  - `tests/unit/`: Component-level simulation tests.
  - `tests/integration/`: Cross-module mechanics tests.
  - `tests/e2e/`: Full simulation match flow tests.
  - `tests/soak_10k_frames.test.mjs`: 10,000-frame continuous game loop soak test.
  - `tests/chaos_resilience.test.mjs`: 50,000-action adversarial chaos bot harness.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Match with Boss Encounter | M1 Zero-GC, M2 King Gummy Bear, Boss HUD, 150ms buffer | High |
| 2 | Crisis Outbreak in Mid-Game | M1 Pooling, M3 Pastel Void, Situation Log HUD, Prisms | High |
| 3 | 10,000-Frame Endless Soak | M1 Zero-GC Pathfinder, ObjectPool, Heap drift <= 0.25MB | Extreme |
| 4 | 50,000-Action Chaos Bot Stress | M1 Pooling, M5 Chaos Bot, Multi-touch, Boundary Breaking | Extreme |
| 5 | Mid-Battle Browser Refresh & Quota Recovery | M4 Scaling, M5 GameStatePersistence, 429 Circuit Breaker | High |
| 6 | Boss Rush Gauntlet Full Run | M2 All 3 Bosses, M4 Scaling, Meta-Progression Perks | Very High |
| 7 | Endless Gauntlet 10-Floor Run | M3 Crises, M4 Relics, Boons, Difficulty Escalation | Very High |

## Coverage Thresholds
- Tier 1: ≥5 per feature (≥175 tests)
- Tier 2: ≥5 per feature (≥175 tests)
- Tier 3: Pairwise coverage of major feature combinations (≥35 tests)
- Tier 4: ≥7 realistic end-to-end workload scenarios
- 10k-Frame Soak: 10,000 frames with heap drift $\le 0.25\text{MB}$
- Chaos Resilience: 50,000 adversarial inputs with 0 crashes and 0 gauge/boundary violations
