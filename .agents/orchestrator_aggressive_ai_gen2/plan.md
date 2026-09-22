# Plan — Orchestrator Gen 2 (Aggressive Enemy AI)

## Objective
Independently execute and verify the full verification test matrix, evaluate Gate 2 across all remediation requirements, synthesize the multi-agent findings, and generate the final completion handoff for Sentinel (parent).

## Verification Matrix
1. `node --experimental-strip-types --test tests/aggressive_ai.test.mjs`
2. `node --experimental-strip-types --test tests/adversarial_demolition_hunting.test.mjs`
3. `node --experimental-strip-types --test tests/adversarial_suicide_zerogc.test.mjs`
4. `npm test` (full project test suite)
5. `npm run lint` (ESLint verification)
6. `npm run build` (Next.js / Turbopack build)

## Gate 2 Evaluation Checklist
- [ ] Remediation 1: Premature EVADING exit suicide eliminated (velocity 0,0, remain in EVADING until detonation).
- [ ] Remediation 2: FlatHazardMask production bug fixed in `getSafeBombEscapePath`.
- [ ] Remediation 3: False-positive `hasDirectPath` on unreachable targets resolved.
- [ ] Remediation 4: NaN infinite loop CPU hang & wall pre-check resolved in `isTileInBlastRange` and `getSafeBombEscapePath`.
- [ ] Remediation 5: Cornering bomb drop distance constrained to trap tile / bomb power.
- [ ] Remediation 6: Test suite updated with continuous tick survival assertions.
- [ ] Zero-GC compliance verified.
- [ ] Authentic implementation verified (CLEAN audit).

## Steps
1. Dispatch Verification Worker to run all 6 commands and capture exact terminal logs and outputs.
2. Monitor Verification Worker and collect results.
3. Record Gate 2 evaluation in `GATE_STATUS.md`.
4. Synthesize all findings into `handoff.md`.
5. Send completion report to Sentinel via `send_message`.
