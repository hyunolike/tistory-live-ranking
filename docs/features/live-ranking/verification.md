# 검증 기록

2026-11-24, macOS, Node.js 22.23.2, pnpm 10.17.0. 배포 전 로컬 검증이다.

## 확인한 내용

| 항목 | 결과 |
| --- | --- |
| GitHub | hyunolike/tistory-live-ranking 비공개 저장소 생성, main 기본 브랜치 |
| 독립 설계 검토 | 공개 상태 검증과 기본 모바일웹 제약을 문서/코드에 반영 |
| 타입 검사 | 브라우저 DOM과 Workers 타입을 분리한 두 tsconfig 통과 |
| API/카탈로그 테스트 | 실제 Miniflare D1에서 18개 통과. 동시 중복, 기간, 제한, 공개 판정, 정리와 카탈로그 갱신 포함 |
| 브라우저 | Chromium 12개 통과. 기간 변경, XSS 문자열, 외부 링크 제외, 오류/재시도, 중복 script, 숨긴 탭, 이전 결과 유지 |
| 반응형 | 320/390/1440px 화면에서 가로 넘침과 포커스 확인 |
| 빌드 | 독립 widget.js, 정적 데모, Worker dry-run 통과. 실제 배포는 수행하지 않음 |
| 카탈로그 | 공개 sitemap의 글 78개에 대해 공개 본문/메타 확인. 제목/URL만 저장, 조회수 가져오지 않음 |
| 로컬 D1 | 마이그레이션과 78개 카탈로그 적용 성공 |
| 실제 HTTP | POST /api/views 202 → GET /api/rankings?window=1h에 /81의 로컬 검증 조회 1건 표시 |
| widget.js | 200, JavaScript MIME, CORS *, 5분 캐시 확인 |
| scheduled | 로컬 수동 호출 200. Worker의 redirect:error 미지원 오류를 테스트로 재현하고 manual로 수정 |

## 수정한 회귀

- 초기 custom element upgrade에서 attributeChangedCallback과 connectedCallback이 각각 첫 조회를 보내는 문제를 발견했다. mounted 상태로 초기 attribute callback을 분리한 뒤, 최초 1회 조회와 숨긴 탭 검사가 통과했다.
- Workers의 HTMLRewriter Element 타입과 브라우저 DOM Element 타입 충돌을 발견했다. Worker와 브라우저의 타입 검사 범위를 분리했다.
- scheduled 호출은 응답 outcome도 확인한다. 예외가 나도 Promise가 정상 완료되는 것을 성공으로 판단하지 않는다.

## 화면 확인

- docs/images/preview-1440.png
- docs/images/preview-390.png
- docs/images/preview-320.png

순위와 조회수는 예시다. 공개 블로그에 실제 랭킹 위젯이 설치된 화면이 아니다.

## 남은 검증

- 독립 코드 검토 중요 지적 수정 후 pnpm test(18/18), pnpm test:e2e(12/12), pnpm typecheck, pnpm build 통과
- GitHub Actions: [실행 기록](https://github.com/hyunolike/tistory-live-ranking/actions/runs/45400351935)은 테스트 실패가 아니라 계정 Actions 예산 제한으로 시작 전 종료됐다. check-run annotation: "The job was not started because an Actions budget is preventing further use." 예산 제한 해제 후 원격 실행 필요
- 실제 D1, 운영 비밀키 등록, Workers 배포
- 실제 티스토리 스킨 설치와 모바일웹 자동 연결 해제 상태 확인
- Safari/iOS 실기기 검증

전체 EGM 반복 검토 완료로 기록하지 않는다. 실행한 독립 검토와 실제 테스트 결과를 구분해 남긴다.

## 최종 검토 조치

[독립 코드 검토](reviews/2026-11-24-code-review.md)의 중요 항목을 수정했다. 0002 카탈로그 시도 시각 마이그레이션과 새 SQL을 로컬 D1에 적용했고, 기존 검증 조회가 랭킹에 유지되는 것을 다시 확인했다. 생성한 catalog.sql에 명시적 BEGIN/COMMIT이 없다. pnpm run deploy는 development 설정에서 실제 배포 전에 중단되는 것을 확인했다. 스킨 관리자 이름 주석과 이미 숨겨진 탭의 최초 읽기 요청 1회는 경미한 후속 항목으로 남겼다.

## 운영 단계 업데이트

저장소를 공개로 전환했고 기존 Actions 실행을 다시 실행해 통과했다. 운영 D1 마이그레이션과 78개 카탈로그 import, 비밀키 등록, Worker 배포 및 공개 HTTP 응답을 확인했다. 추가 회귀 수정 후 로컬 테스트는 19개다. 최신 상태와 실제 스킨 적용 경계는 [배포 기록](deployment.md)을 따른다. 위의 비공개/미배포/예산 차단 내용은 초기 단계의 이력이다.


## HOT 한 줄 변경 — 2026-11-25

- R10/R11 추가 테스트는 기존 구현에서 펼침 버튼 없음으로 실패했다.
- 요약 링크 포커스 회귀 테스트가 기존 복원 로직에서 실패한 뒤 수정 후 통과했다.
- 최종 pnpm typecheck 성공, pnpm test 19/19, pnpm test:e2e 17/17, pnpm build dry-run 성공.
- docs/images/preview-{320,390,1440}.png는 접힌 모습, expanded-{320,390,1440}.png는 펼친 모습. 직접 화면을 확인했다.
- 새 문맥 독립 검토: reviews/2026-11-25-hot-ticker.md. 차단 지적 없음. 실제 스킨 적용은 미완료 상태를 유지한다.
