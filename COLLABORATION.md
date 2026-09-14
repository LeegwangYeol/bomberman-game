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
- **게임 기획서(GDD.md) 작성 완료 및 검증 통과** (이전 단계 완료)
- **실제 게임 코드 구현 및 감사 완료 (VICTORY CONFIRMED, 2026-09-14)**:
  1. **이미지 에셋 및 배경 적용 (R1 완료)**:
     - 9종의 실제 32-bit RGBA PNG 에셋 생성 완료 (`public/assets/`): `player.png`, `wall.png`, `block.png`, `floor.png`, `bomb.png`, `explosion.png`, `enemy.png`, `enemy_tracker.png`, `background.png`.
     - `src/game/GameScene.ts`의 Phaser `preload()`에서 실제 이미지를 로드하여 모든 엔티티에 텍스처 바인딩 완료 (기존 임시 도형 완전 제거).
     - z-index depth 레이어링(-10 ~ 12) 및 배경 고정 뷰포트 구현 완료.
  2. **적 공격 AI 고도화 (R2 완료)**:
     - `src/game/pathfinding.ts`에 장애물 회피 및 폭탄 회피 그리드 BFS 최단 경로 알고리즘 구현.
     - 4단계 전투 FSM (`TRACKING` -> `WINDUP` 텔레그래프 -> `ATTACK` 돌진 대시 -> `COOLDOWN` 회복) 구현 완료.
     - 코너 스내깅 방지 웨이포인트 스냅 및 타이트 히트박스(28x28) 튜닝 완료.
  3. **UI 및 컴포넌트 폴리시 (R3 완료)**:
     - `src/components/BombermanGame.tsx`에 레트로 아케이드 마키/섀시, 컨트롤 가이드, 반응형 모바일 오버레이(조이스틱/버튼) 구현. 엄격한 타입 정의 완료.
  4. **다중 에이전트 검증 및 독립 감사 통과**:
     - 4명의 리뷰어/챌린저 전원 만장일치 승인, 25개 자동화 단위/스트레스 테스트 통과 (25/25 passed).
     - `npm run lint` 0 경고/0 에러, Next.js Turbopack `npm run build` 클린 빌드 (Exit code 0).
     - Sentinel의 독립 Victory Auditor에 의해 **VICTORY CONFIRMED** 최종 확인.
- **Claude와의 소통 메모**:
  - 구현된 실제 게임 코드와 에셋이 프로젝트에 온전히 반영되었습니다. 추가 기능(보스전, 펫 시스템 등) 확장 계획이 있으시면 언제든지 편하게 피드백을 남겨주세요!

