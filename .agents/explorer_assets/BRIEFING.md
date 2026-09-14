# BRIEFING — 2026-09-14T10:32:30Z

## Mission
Survey the asset pipeline, investigate Phaser preload/rendering, enumerate required .png image assets and backgrounds, and recommend the exact technical specification for the Bomberman prototype.

## 🔒 My Identity
- Archetype: explorer
- Roles: Read-only investigation: analyze problems, synthesize findings, produce structured reports
- Working directory: /Users/user/src/bomberman/.agents/explorer_assets
- Original parent: ad4efed7-f55c-429d-ad1d-57460e247de3
- Milestone: Bomberman Prototype Real Image Asset Strategy

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify production source code outside of .agents/explorer_assets
- Wait for explicit user approval before proceeding with implementation
- Output detailed report to report.md and handoff to handoff.md
- Communicate completion via send_message to parent

## Current Parent
- Conversation ID: ad4efed7-f55c-429d-ad1d-57460e247de3
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `public/` (verified 5 template SVGs, no game images)
  - `src/game/GameScene.ts` (lines 31–74 procedural graphics, camera scroll, physics sizing)
  - `src/components/BombermanGame.tsx` (Phaser configuration, canvas sizing 800x600)
  - macOS `sips` vector-to-PNG rasterization test in `/tmp/test_assets/`
- **Key findings**:
  - 9 specific PNG assets required (8 at 40x40 px, 1 at 800x600 px)
  - Full-screen background requires `setScrollFactor(0)` and `setDepth(-10)` to align with camera scroll
  - Sprite physics hitboxes should be tuned to 28x28 inside 40x40 tiles to prevent corner snagging
  - SVG source templates with `sips` rasterization produce production-grade 32-bit RGBA PNGs instantly
- **Unexplored areas**: None within asset strategy scope.

## Key Decisions Made
- Selected vector SVG + macOS `sips` rasterization pipeline to create all 9 assets with deterministic quality.
- Recommended placing all generated `.png` assets in `public/assets/` to ensure zero-overhead static serving on Next.js/Vercel.
- Formulated exact replacement code for `GameScene.preload()` and depth layering.

## Artifact Index
- /Users/user/src/bomberman/.agents/explorer_assets/report.md — Detailed exploration report
- /Users/user/src/bomberman/.agents/explorer_assets/handoff.md — 5-component handoff report
- /Users/user/src/bomberman/.agents/explorer_assets/progress.md — Liveness heartbeat
- /Users/user/src/bomberman/.agents/explorer_assets/DISPATCH.md — Timestamped dispatch log
