# Progress: AI & Pathfinding Inspector

Last visited: 2026-09-18T09:42:00Z

- [x] Initialized DISPATCH.md and BRIEFING.md
- [x] Investigate ZeroGCPathfinder (bounds, indexing, coordinate conversions, typed arrays)
  - Discovered: Parameter order mismatch between constructor(rows, cols) and init(cols, rows).
  - Discovered: findPathBFS wrapper allocates heap memory, breaking Zero-GC in entity loops.
  - Discovered: isTileInBlastRange lacks coordinate bounds checking, throwing TypeError on off-grid coords.
  - Discovered: populateObstacleMask does not zero out buffer before copy.
- [x] Investigate Enemy FSMs (CHASER, BOMBER, TANK, GHOST, SPLITTER, BaseBoss)
  - Discovered: ChaserEnemy stun/cooldown double duration bug (BaseEntity.updateEntity resets isStunned before updateAI runs, forcing an extra stateTimer cooldown).
  - Discovered: BomberEnemy EVADING state has no timeout guard; if escape path is obstructed, permanently stuck in evasion.
  - Discovered: MiniBomberAlly has identical permanent stuck evasion bug.
  - Discovered: MerchantNPC passes bombTiles instead of blastTiles to findEscapePathBFS, causing it to never flee bombs.
  - Discovered: HamsterBoss dashes off-screen without bounds clamp or wall impact trigger.
  - Discovered: QueenBeeBoss permanently invulnerable (flight loop never grounds boss).
- [x] Investigate Ghost phasing and rematerialization safety
  - Discovered: GhostEnemy Ether Dash (260 px/s) is overwritten on frame 2 by currentPath movement (45.5 px/s), lasting only 16ms due to lack of a dash state or timer guard.
  - Discovered: Rematerialization does not toggle block collider; Ghost permanently passes through soft blocks.
- [x] Investigate Suicide-prevention invariant & moving hazards
  - Discovered: BomberEnemy only checks candidate blast, ignores existing active bomb blasts and moving hazards/crises/conveyor drifts.
- [x] Investigate Ally behavior (MINI_BOMBER, PET_DRONE, SHIELD_GUARD)
  - Discovered: PetDroneAlly tractor beam movement lacks delta scaling (frame-rate dependent speed 75px/s to 300px/s).
  - Discovered: Item bobbing tween in spawnItem fights against tractor beam and magnet pulls on Y-axis.
  - Discovered: Allies have no mutual collision or separation with player, causing stacking.
  - Discovered: ShieldGuard taunt is cosmetic; enemy AI does not redirect target.
- [x] Synthesize findings into findings.md
- [x] Produce handoff.md and send completion message to parent
