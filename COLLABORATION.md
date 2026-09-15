# Bomberman Project Collaboration Guide

## 프로젝트 개요 (Project Overview)
- **개발자 페르소나 (Persona):** 게임 개발자 맥스 (Game Developer Max)
- **목표 (Goal):** 크로스 플랫폼 (모바일 아이폰/갤럭시 및 PC) 대응이 가능한 봄버맨 게임 개발
- **디자인 스타일 (Design Style):** 아기자기하고 귀여운 스타일
- **호스팅 (Hosting):** Vercel (웹 기반 게임)

## Claude와의 협업 규칙 (Rules for Claude)
- 게임의 아키텍처, 디자인 에셋 아이디어, 로직 구조 등에 대한 피드백이나 제안을 이 파일에 자유롭게 남겨주세요.
- 이 파일(`COLLABORATION.md`)을 업데이트한 후에는 반드시 사용자에게 **"내용확인"**이라고 맥스(저)에게 말해달라고 안내해 주세요.
- 사용자 경험(UX)과 반응형 컨트롤(터치 및 키보드) 최적화에 초점을 맞춰 협업합시다!

## 현재 상태 (Current Status)
- **이전 단계 완료 (2026-09-14)**:
  - GDD.md 작성 완료
  - 실제 PNG 이미지 에셋 로드, BFS 경로 탐색 및 4단계 전투 FSM, 레트로 아케이드 UI 완료 (VICTORY CONFIRMED)

- **리파인먼트 단계 완료 (Refinement Phase — VICTORY CONFIRMED, 2026-09-15)**:
  1. **R1. 플레이어 이동 및 코너 슬라이딩 완벽 구현 (Smooth Player Movement)**:
     - 플레이어/적 물리 히트박스 `24x24`(오프셋 8,8), 폭탄 `32x32`(오프셋 4,4).
     - 2단계 코너 보정 알고리즘 (회랑 센터링 + 코너 라운딩).
  2. **R2. 생동감 넘치는 적 AI 상태 및 시각 피드백 (Lively Enemies)**:
     - 7단계 전투/행동 FSM (`IDLE`, `PATROL`, `TRACKING`, `HUNTING`, `WINDUP`, `ATTACK`, `COOLDOWN`).
     - 오버헤드 뱃지 및 트윈 애니메이션 완료.
  3. **R3. 역동적인 폭탄 애니메이션 및 폭발 임팩트 (Dynamic Bomb Animations)**:
     - 3단계 가속 펄싱 트윈 체인 + 6단계 폭발 감각 피드백 스택.

- **메카닉스, 애니메이션 & 동적 게임플레이 확장 단계 완료 (Mechanics Expansion Phase — VICTORY CONFIRMED, 2026-09-15)**:
  1. **R1. 4방향 캐릭터 애니메이션 (Directional Character Animations)**:
     - `scripts/generate-assets.sh`를 통해 120x160 (3열 x 4행) 12프레임 SVG 기반 스프라이트시트(`public/assets/player.png`) 생성:
       - Row 0 (0-40px): Down 걷기 사이클 (프레임 0, 1, 0, 2)
       - Row 1 (40-80px): Up / Back 걷기 사이클 (프레임 3, 4, 3, 5) — 헬멧 뒷모습 하이라이트 및 뒤꿈치 스텝
       - Row 2 (80-120px): Side / Right 프로필 걷기 사이클 (프레임 6, 7, 6, 8) — 좌측 이동 시 `setFlipX(true)`로 대칭 미러링
       - Row 3 (120-160px): Defeat / Stun 시퀀스 (프레임 9, 10, 11) — X자 눈, 피격 납작 반응, 어지러움 스파이럴
     - `playerFacing: 'down' | 'up' | 'left' | 'right'` 상태 관리로 이동을 멈췄을 때 마지막 진행 방향의 아이들 포즈를 자연스럽게 유지.
     - 대칭형 24x24 히트박스(상하좌우 8px 균일 마진) 유지로 좌우 플립 시에도 물리 충돌 및 코너 슬라이딩 알고리즘 완벽 호환.

  2. **R2. 고급 적 행동 AI 및 2단계 오버헤드 UI (Advanced Enemy Behavior & Name Tags)**:
     - **자폭 방지 탈출 알고리즘 (Suicide-Prevention Invariant)**:
       - `src/game/pathfinding.ts`에 `getBlastTiles()` 및 `findEscapePathBFS()` 구현.
       - 적이 플레이어와 근접(거리 $\le 3$)하거나 블록에 막혔을 때, 가상 폭발 위험 구역을 선제 계산하여 4걸음 이내 안전 타일로의 탈출 경로가 보장될 때만 폭탄을 드롭.
       - 막다른 골목(Cul-de-sac)에서는 폭탄 배치를 거부하여 자폭 원천 차단.
       - 폭탄 드롭 후 신규 FSM 상태 `EnemyState.EVADING`으로 전환하여 85px/s 속도로 안전 타일로 대피.
     - **폭탄 그룹 통합 및 소유권 격리**:
       - `this.bombs` 물리 그룹에 등록하되 `owner: 'enemy'` 메타데이터로 태깅.
       - 적 폭탄은 자수정/보라 펄스 틴트(`0xd946ef`)로 시각적 차별화.
       - 적 폭탄 생성/폭발이 플레이어의 폭탄 카운트(`this.activeBombs`)에 간섭하지 않도록 완전 격리. 아레나 전체 적 폭탄은 최대 2개로 엄격히 제한.
     - **2단계 오버헤드 UI 계층화**:
       - 1단계 (y - 19): 고대비 다크 슬레이트 필 배경의 네임태그 렌더링. 추적형("Blinky", "Pyro Slime", "Ignis" 등) 및 일반형("Grumble", "Puffball", "Blobby" 등) 고유 페르소나 이름 부여.
       - 2단계 (y - 33): 행동 의도 인디케이터 뱃지 (`!`, `⚠️`, `⚡`, `💫`, `💨`, `...`)를 14px 상단에 분리 렌더링하여 텍스트 겹침 방지. 엔티티 파괴 시 동반 오브젝트 완벽 메모리 해제.

  3. **R3. 다이내믹 게임플레이 (Items, Skills, Gimmicks) & React 아케이드 HUD**:
     - **5대 파워업 아이템 (45% 드롭 확률)**:
       - HTML5 Canvas/Graphics 절차적 텍스처로 에셋 누락 위험 0%.
       - Speed Up: +25 px/s (최대 250 px/s / Lv. 5)
       - Bomb Up: 최대 폭탄 수 +1 (최대 8개)
       - Fire Up: 폭발 반경 +1 타일 (최대 8타일)
       - Kick: 폭탄 킥 스킬 해금
       - Shield: 1회 피격 방어 배리어
     - **600ms 폭발 보호 유예 시간 (Grace Window)**:
       - 블록 파괴 폭발(320ms)로 인해 방금 스폰된 아이템이 즉시 불타 사라지지 않도록 생성 후 600ms 무적 보호.
     - **플레이어 스킬 & 맵 기믹**:
       - 폭탄 킥: 폭탄 접촉 시 300px/s로 슬라이딩, 벽/블록 충돌 시 정밀 타일 센터 스냅, 적 충돌 시 즉시 기폭.
       - 대시: Shift/E 또는 모바일 [DASH] 터치 버튼. 140ms 동안 350px/s 순간 대시 + 3개 잔상 + 완전 무적, 3.5초 쿨다운.
       - 쉴드 배리어: 치명적 폭발/적 접촉 1회 흡수, 파편 파티클 방출 및 1.5초(1500ms) 점멸 무적 부여.
       - 대시-쉴드 무적 보존: 쉴드 복구 무적 시간 도중 대시가 종료되더라도 잔여 무적 시간이 성급히 해제되지 않도록 `shieldInvulnerableUntil` 타임스탬프 가드 적용.
       - 맵 기믹: 중앙 회랑 컨베이어 벨트(60px/s 지속 드리프트), (1,13)-(11,1) 양방향 텔레포트 포털(1.2초 디바운스 쿨다운으로 무한 진동 루프 차단).
     - **React <-> Phaser 실시간 브릿지 & Retro Arcade HUD**:
       - `game.events.emit('stats-update', stats)` 기반 이벤트 주도형 브릿지.
       - `BombermanGame.tsx` 헤더에 실시간 게이지 탑재: 폭탄(현재/최대), 화력 레벨, 속도(px/s 및 레벨), 대시 쿨다운 게이지, 킥/쉴드 상태 배지, 수집 아이템 통계 카운터.
       - 모바일 컨트롤에 [DASH] 가상 버튼 추가. 컴포넌트 언마운트 시 모든 리스너 및 캔버스 인스턴스 완벽 정리.

  4. **다중 에이전트 스웜 검증 & 독립 Victory Audit 완료**:
     - 11개 테스트 스위트 총 154개 단위/스트레스/통합 테스트 전원 통과 (154/154 passed).
     - `npm run lint` 0 에러 클린 통과.
     - Next.js Turbopack `npm run build` 정적 페이지 최적화 완료 (Exit code 0).
     - 아키텍처 리뷰어 2인 전원 **APPROVE**, 챌린저 2인 적대적 스트레스 테스트 전원 **APPROVE (Hardened)**, 독립 포렌식 무결성 감사관 **CLEAN** 판정 획득.
     - 최종 게이트 결과: **PASS**. **VICTORY CONFIRMED**.
