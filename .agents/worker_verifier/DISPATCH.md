# Task Assignment: Full Test & Build Verification Worker

## Objective
Independently execute and verify the full verification test matrix for the Aggressive Enemy AI milestone remediation.

## Verification Commands to Execute
You must run and capture the exact console outputs and exit codes for all 6 commands:
1. `node --experimental-strip-types --test tests/aggressive_ai.test.mjs`
2. `node --experimental-strip-types --test tests/adversarial_demolition_hunting.test.mjs`
3. `node --experimental-strip-types --test tests/adversarial_suicide_zerogc.test.mjs`
4. `npm test`
5. `npm run lint`
6. `npm run build`

## Mandatory Rules
- Working directory: `/Users/user/src/bomberman/.agents/worker_verifier/`
- Project root: `/Users/user/src/bomberman`
- Read `/Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md`.
- Read `/Users/user/src/bomberman/.agents/worker_remediation/handoff.md`.
- Output requirements: Write a comprehensive `handoff.md` in your working directory containing:
  1. Observation: Detailed command outputs, test counts (passes/fails), durations, lint output, build output.
  2. Logic Chain: Assessment of test pass criteria and whether all remediation items hold.
  3. Caveats: Any warnings or notes (e.g. ESLint warnings).
  4. Conclusion: Final verdict (PASS/FAIL).
  5. Verification Method: Exact commands to reproduce.
- Send a message back to the orchestrator upon completion referencing your handoff.md.

## 2026-09-22T07:42:53Z
You are worker_verifier for Generation 2 of the Aggressive Enemy AI rewrite milestone.
Working directory: /Users/user/src/bomberman/.agents/worker_verifier/
Project root: /Users/user/src/bomberman

Please read:
- /Users/user/src/bomberman/.agents/ORIGINAL_REQUEST.md (MANDATORY: read this first)
- /Users/user/src/bomberman/.agents/worker_verifier/DISPATCH.md
- /Users/user/src/bomberman/.agents/worker_remediation/handoff.md

Your mission is to execute and verify the full verification test matrix for the Aggressive Enemy AI milestone remediation:
1. `node --experimental-strip-types --test tests/aggressive_ai.test.mjs`
2. `node --experimental-strip-types --test tests/adversarial_demolition_hunting.test.mjs`
3. `node --experimental-strip-types --test tests/adversarial_suicide_zerogc.test.mjs`
4. `npm test`
5. `npm run lint`
6. `npm run build`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your findings, test counts, exact terminal logs, and pass/fail verdicts into `/Users/user/src/bomberman/.agents/worker_verifier/handoff.md`. Then notify the orchestrator via send_message.

