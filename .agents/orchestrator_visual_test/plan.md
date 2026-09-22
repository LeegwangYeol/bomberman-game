# Orchestrator Plan — Automated Visual & Functional E2E Testing & Bug Remediation

## Goal
Execute automated visual and functional testing of the Bomberman game in a real browser environment (using Chrome DevTools MCP or headless browser automation), capture at least 4 screenshots (Menu, Gameplay, Boss Fight, Crisis Event), monitor console logs, autonomously fix any discovered bugs/errors, and produce a comprehensive markdown report with 0 remaining console errors.

## Execution Strategy
1. **Server & Environment Setup**: Ensure the Next.js development server is running and accessible.
2. **Specialist Dispatch**:
   - `worker_e2e_tester`: Launch browser session, attach console listeners, navigate and trigger states (Menu, standard gameplay, Boss fight, Crisis event), capture distinct screenshots to project directory.
   - `worker_bug_remediator`: If any console errors or visual defects are caught, analyze root cause and apply surgical patches to the codebase.
   - `reviewer_visual_qa`: Validate the 4+ screenshots, verify 0 console errors, verify all acceptance criteria.
3. **Artifacts**:
   - At least 4 distinct screenshots saved in project directory.
   - Final markdown report detailing test coverage, screenshots, and resolved bugs.
