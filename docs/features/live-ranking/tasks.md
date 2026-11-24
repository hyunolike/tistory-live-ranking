# Live ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 별도 저장소에서 기존 티스토리 디자인과 어울리는 실제 집계 위젯을 구현하고 설치 가능한 상태로 준비한다.

**Architecture:** Workers와 D1이 API와 영속 집계를 맡는다. 별도 웹 컴포넌트가 정적 번들로 배포된다.

**Tech Stack:** Node.js 22.12+, pnpm 10, TypeScript 5.9, esbuild, Wrangler, Miniflare, Playwright.

**Spec:** [spec.md](./spec.md), [design.md](./design.md)

## Global Constraints

- 기존 스킨 선택자 수정 없음. 실제 운영 통계와 예시 데이터 분리.
- 기본 24h, 1h 전환, 최대 5개, 60초 갱신, 30분 중복 제외, IP당 1분 30건.
- 원본 IP 저장 없음. Worker/DB의 비밀키를 브라우저에 넣지 않음.
- 배포와 티스토리 실제 설치는 별도 운영 단계.

## Review Focus

- 동시 수집에서 중복 제외와 실제 INSERT가 원자적인가.
- 비공개/삭제 글과 외부 URL이 공개 랭킹에 유입되지 않는가.
- 기간 변경 중 늦은 응답이 새 결과를 덮지 않는가.
- 기존 스킨의 reset과 고정 요소에 위젯이 영향을 주지 않는가.
- 재설치와 탭 전환 시 수집/타이머가 중복되지 않는가.

### Task 1: 검증 가능한 서버와 카탈로그

**Files:** `src/worker/{index,storage}.ts`, `src/shared/contracts.ts`, `migrations/0001_initial.sql`, `scripts/sync-catalog.ts`, `tests/api.test.ts`.

**Interfaces:** `GET /api/rankings?window=1h|24h`와 `POST /api/views`는 design.md의 JSON을 소비/생산한다. DB 스키마는 마이그레이션 하나로 만든다.

- [x] 실제 D1 테스트 작성: 외부 origin은 403, 미등록 글은 404, 동시 8회는 조회 1건, 경계 밖은 미집계, 동률 ID 순서, 31번째는 429.
- [x] `pnpm test`에서 미구현 실패를 확인한다.
- [x] 검증/수집/집계/정리와 공개 카탈로그 동기화를 구현한다.
- [x] `pnpm test`와 `pnpm typecheck`가 통과한다.
- [x] 서버와 테스트를 커밋한다.

### Task 2: 기존 디자인 기반 독립 위젯

**Files:** `src/widget/{index,ranking}.ts`, `src/widget/ranking.css`, `demo/{index.html,style.css}`, `tests/widget.spec.ts`, `scripts/build.ts`.

**Interfaces:** `<blog-live-ranking api-base demo>`; 수집 ID는 URL에서 추출, 출력은 API 계약을 따름. UI 토큰은 design.md를 따른다.

- [x] 브라우저 테스트 작성: 기간 전환과 오래된 응답, 빈 상태, 네트워크 실패/재시도, 320px 넘침과 텍스트 주입 무해화.
- [x] `pnpm test:e2e` 미구현 실패 확인.
- [x] Shadow DOM, 폴링 수명주기, 요청 취소, 글 수집 로더 구현.
- [x] `pnpm build`, `pnpm typecheck`, `pnpm test:e2e` 통과.
- [x] 데스크톱과 모바일 스크린샷 확인 후 커밋.

### Task 3: 개발/설치 준비와 독립 검토

**Files:** `README.md`, `.github/workflows/ci.yml`, `examples/`, `docs/features/live-ranking/reviews/`, `docs/features/live-ranking/verification.md`.

**Interfaces:** 새 clone에서 pnpm install → db:migrate → db:seed → dev. 예시에는 배포 전임을 표시한 URL placeholder 사용.

- [x] 로컬 설치와 실제 API 흐름을 확인한다.
- [x] 새 문맥 검토자가 명세와 변경 코드를 읽고 실제 지적을 반환하도록 한다.
- [x] 중요 지적은 회귀 테스트와 함께 수정한다. 전체 EGM loop 완료로 과장하지 않는다.
- [x] 비밀/생성 파일 제외, 전체 검증 결과 기록, GitHub 비공개 저장소 생성과 push.
- [x] 개발 폴더, 저장소 주소, 실행 방법, 남은 배포 단계를 전달한다.


## 현재 상태

로컬 구현과 검증, 독립 설계/코드 검토 및 중요 지적 수정 완료. GitHub 비공개 저장소의 feat/live-ranking 브랜치로 전달한다. 운영 배포와 실제 스킨 적용은 아직 수행하지 않았다. GitHub Actions는 계정 예산 제한으로 실행되지 않아 별도 복구가 필요하다.

## 운영 배포 — 2026-11-24

사용자가 계속 진행과 공개 저장소 전환을 요청했다. 기존 기능 구현을 재시작하지 않고 배포를 이어간다.

- [x] 저장소 공개 전환과 GitHub Actions 재실행 성공
- [x] 위젯 전용 APAC D1 생성과 운영 설정 준비
- [x] 원격 마이그레이션과 공개 글 카탈로그 적용
- [x] 운영 비밀키와 Worker 배포
- [x] 공개 HTTPS, API, 정적 파일과 운영 DB 검증
- [ ] 실제 스킨 방문으로 수집부터 랭킹까지 연결 검증
- [x] 실제 배포 주소가 들어간 설치 조각과 운영 기록 갱신
- [ ] 티스토리 인증 상태 확인 후 실제 스킨 적용 및 검증

운영 API와 정적 배포는 완료했다. 실제 스킨 적용은 공유 Chrome 조작 확인을 기다린다. 운영 조회수에 합성 검증 이벤트를 넣지 않았다.
