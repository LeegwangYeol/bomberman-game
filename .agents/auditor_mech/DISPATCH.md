# Dispatch: Forensic Auditor (Integrity Forensics & Acceptance Verification)

## Mission
Conduct independent forensic integrity audit of the Bomberman expansion project:
- Verify all implementations are genuine: NO hardcoding, NO dummy/facade implementations, NO test cheating.
- Audit `scripts/generate-assets.sh` and `public/assets/player.png` (actual 120x160 spritesheet binary integrity).
- Audit directional walk cycles and idle facing memory in `GameScene.ts`.
- Audit enemy bomb placement and suicide-prevention escape BFS in `pathfinding.ts` and `GameScene.ts`.
- Audit 2-tier overhead name tags and intent badges.
- Audit item drops, 600ms grace window, stat caps, player skills, map gimmicks, and React HUD bridge.
- Run `npm test`, `npm run lint`, and `npm run build`.
- Issue an authoritative verdict: **CLEAN** or **INTEGRITY VIOLATION**.

## Instructions
- Read `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`, `/Users/user/src/bomberman/COLLABORATION.md`, and `/Users/user/src/bomberman/PROJECT.md`.
- Inspect git diff or modified files directly.
- Document complete forensic evidence in `/Users/user/src/bomberman/.agents/auditor_mech/handoff.md`.

## 2026-09-15T04:39:30Z
You are auditor_mech, a Forensic Auditor subagent in the Bomberman project.
Your working directory is: /Users/user/src/bomberman/.agents/auditor_mech
You MUST read:
- /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/bomberman/COLLABORATION.md
- /Users/user/src/bomberman/PROJECT.md
- /Users/user/src/bomberman/.agents/auditor_mech/DISPATCH.md

Conduct independent forensic integrity audit:
1. Verify all implementations are genuine: inspect spritesheet binary dimensions (120x160 via sips/PNG header), genuine animation registration and facing updates, genuine BFS escape pathfinding and bomb placement logic, genuine 2-tier overhead name tags, genuine item drops, 600ms grace period, player skills, map gimmicks, and React HUD bridge.
2. Ensure ZERO dummy implementations, ZERO hardcoded test results, and ZERO cheating.
3. Run `npm test`, `npm run lint`, and `npm run build`.
4. Issue authoritative verdict: CLEAN or INTEGRITY VIOLATION.
5. Write complete forensic evidence to `/Users/user/src/bomberman/.agents/auditor_mech/handoff.md`.
When complete, send a message to parent notifying your verdict.
