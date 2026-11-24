# 운영 배포 기록

2026-11-24. 사용자 요청: 계속 진행하고 저장소를 공개로 전환한다.

## 배포 결과

- 공개 저장소: https://github.com/hyunolike/tistory-live-ranking
- Worker: https://tistory-live-ranking.tistory-live-ranking.workers.dev
- Cloudflare 버전: e0d0f44c-fbc2-4022-8925-942b867837b2 (2026-11-24T13:44:01Z)
- D1: tistory-live-ranking, APAC. 0001/0002 마이그레이션 적용.
- 공개 글 78개의 제목과 고유 주소를 검증하고 원격 카탈로그 import 성공.
- DEDUP_SECRET은 생성한 임시 비밀 파일로 Worker에 등록했다. 값은 출력하거나 커밋하지 않았다.
- 정리/카탈로그 갱신 schedule: 매시 15분.

## 공개 HTTP 검증

2026-11-24T13:51Z에 인증서 검증을 유지한 curl/Node 클라이언트로 확인했다. 새 workers.dev 계정 하위 도메인 생성 직후에는 TLS handshake가 실패했고, 발급/전파 후 정상화됐다.

| 요청 | 확인 |
| --- | --- |
| GET /health | 200, status=ok |
| GET / | 200, 예시 데이터로 명시한 디자인 미리보기 |
| GET /api/rankings?window=24h | 200, 실제 빈 배열, collectedSince=null |
| GET /widget.js | 200 JavaScript, CORS *, Cache-Control max-age=300 |
| OPTIONS /api/views | 204, 허용 블로그 origin과 POST/Content-Type만 허용 |
| POST /api/views 외부 origin | 403, 수집 안 함 |
| POST /api/views 미등록 글 | 404, 수집 안 함 |
| 운영 DB 읽기 | active posts=78, views=0 |

공개 widget.js의 SHA-256은 `915ef64734d452f508d71b5f863aeae7c09f341dfa740429e18f14197bee06ff`이며 로컬 빌드와 일치했다. 운영 통계 검증을 위해 가짜 정상 조회를 만들지 않았다. 실제 스킨 설치 후 공개 글 방문으로 수집부터 랭킹까지 확인해야 한다.

## 현재 스킨을 처리하는 회귀 수정

현행 스킨에는 visitor-village 요소가 명시적인 head의 닫는 태그보다 앞에 있다. 초기 판별기는 이 요소에서 head가 끝났다고 추론해 뒤쪽 canonical을 놓쳤다. 명시적인 head 경계가 있을 때는 그 경계를 따르도록 수정했다. 실패하는 회귀 테스트 후 수정했고 공개 글 78/78을 다시 검증했다.

전체 API/카탈로그 19개, 타입 검사, 운영 빌드 통과. 별도 새 문맥 검토자는 카탈로그 6개 테스트와 추가 head 사례 11개를 독립 확인했고 중요 지적이 없었다. 전체 EGM loop 완료로 표시하지 않는다.

## 설치 상태

관리자 스킨 편집기에 접근했으나, 공유 Chrome에서 사용자의 다른 조작이 감지되어 직접 적용을 대기했다. HTML/CSS 저장이나 기존 스킨 교체는 하지 않았다. [install.html](../../../examples/install.html)은 실제 운영 주소가 들어간 추가 블록이다. 원문을 백업하고 AI 채팅 공지 뒤에 넣는다. 모바일웹 자동 연결 설정과 Safari/iOS 실기기는 별도 확인한다.

## 저장소 통합

기능 커밋 086bc23의 push/PR 검증 두 건(45408397541, 45408413002)이 모두 통과했다. PR #1은 2026-11-24T14:32:55Z에 main으로 병합했고 병합 커밋은 9c61776이다. 공개 About 홈페이지에도 운영 주소를 연결했다. 실제 스킨은 저장하지 않았다.


## HOT 한 줄 위젯 — 2026-11-25 KST

- PR #2: https://github.com/hyunolike/tistory-live-ranking/pull/2
- 구현 커밋 953b47e, 원격 Verify 45422252970 성공 후 main에 83649ed로 병합.
- Worker 버전: 9e3169c0-8f55-4fe8-962d-32e52c48f975. pnpm run deploy 성공.
- 공개 widget.js는 HTTP 200 JavaScript, CORS *. SHA-256 `95a94c8d648449fcdca620064c6a598f89a82e68f2883979ce596b22e266b8bc`로 로컬 빌드와 일치.
- 배포된 HTTPS 화면을 Chromium 390px로 열어 5초 순환, TOP 5 펼침, Escape 포커스 복귀를 확인했다. pageerror 0건, 조회 수집 요청 0건.
- /health 정상. /?live=1에서 실제 빈 목록 안내를 확인했다. 운영 API의 items=[]와 collectedSince=null을 유지한다.
- 설치 코드의 여백과 최대 너비를 한 줄 UI에 맞춰 갱신했다. 기본 빨강이며 --ranking-accent로 보라색 변경 가능.
- 실제 티스토리 스킨은 여전히 저장하지 않았다. 다음 단계는 백업 후 examples/install.html을 현재 스킨에 추가하고 실제 글 방문의 수집과 랭킹을 확인하는 것이다.
