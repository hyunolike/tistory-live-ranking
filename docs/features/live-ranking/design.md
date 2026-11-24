# 실시간 인기글 설계

## 결정과 대안

사용자는 레퍼런스 조사 후 새 저장소 생성과 제공한 티스토리 HTML/CSS를 기반으로 개발을 요청했다. 기능 구현 범위는 spec.md를 따른다.

- 기본 인기글 치환자는 간단하지만 시간 범위를 제어할 수 없다.
- GA4 실시간은 최근 30분을 조회할 수 있으나 글 경로를 직접 제공하지 않는 제약이 있다.
- **채택: TypeScript + Cloudflare Workers + D1 + 독립 웹 컴포넌트.** 한 배포에서 API와 위젯 정적 파일을 제공한다. 기술 선택은 구현자의 결정이다.

## 구조

`src/worker/`는 수집과 랭킹, `src/widget/`은 Shadow DOM UI, `src/shared/`는 계약, `migrations/`는 D1 스키마, `demo/`는 디자인 미리보기, `examples/`는 스킨 삽입 조각이다. 프레임워크 없이 esbuild로 위젯을 번들한다.

## 데이터와 공개 글 카탈로그

posts(id,title,url,active,verified_at,checked_at)와 views(id,post_id,viewed_at), dedup(post_id,fingerprint,last_seen), rate_limits(fingerprint,minute,hits)를 둔다. checked_at은 실패한 시도도 포함하며 verified_at은 성공한 공개 상태 검증 시각이다. 실패한 글이 전체 갱신을 독점하지 않도록 checked_at 순서로 순환한다. 서버 시각은 UTC epoch milliseconds. ranking은 현재 시각에서 정확히 1h 또는 24h 전 이상, 현재 시각 이하의 views를 합산한다.

운영자가 `catalog:sync`를 실행해 고정 블로그 origin의 sitemap과 숫자형 공개 글을 읽고 제목과 canonical URL을 기록한다. og:type=article, 일치하는 canonical, #article-view가 모두 있어야 하며 보호글 클래스가 있으면 제외한다. 오류가 난 동기화는 기존 카탈로그를 덮어쓰지 않는다. 생성한 catalog.sql을 D1에 적용할 때 목록에서 사라진 글은 inactive로 전환한다. 브라우저가 보낸 제목과 URL은 저장하지 않는다. 검증 시각이 24시간을 넘은 글은 수집과 랭킹에서 제외한다. 매시간 sitemap을 확인해 새 후보를 등록하고, 검증이 가장 오래된 글 10개를 다시 확인한다. 삭제/보호 전환의 즉시 반영은 보장하지 않는다.

## API 계약

- `GET /health`: 준비 상태. 비밀이나 통계는 출력하지 않음.
- `POST /api/views`: JSON `{ "postId": "81" }`, 성공과 중복 모두 202 `{ "accepted": true }`. 허용 origin만 수락한다. Content-Type application/json, 최대 1KiB, 숫자형 ID 최대 10자리. 미등록 글 404, 비정상 400/413/415, 허용하지 않은 origin 403, 요청 제한 429. 쿠키나 API 비밀키를 브라우저에 전달하지 않는다.
- `GET /api/rankings?window=24h`: 1h/24h만 허용. `{ window, generatedAt, collectedSince, metric: "deduplicatedViews", items: [{ postId, title, url, views, rank }] }`. 최대 5개. 데이터 없는 목록은 빈 배열. 읽기 API 공개, CORS *; 30초 캐시 허용.
- `OPTIONS /api/views`: 정확히 일치하는 허용 origin, POST/Content-Type에 한정한다. Origin 검사는 브라우저 출처 제약이며 인증이 아니다.

## 원자성과 비용 제한

CF-Connecting-IP를 일자와 서버 비밀키로 HMAC하고 원본 IP는 저장하지 않는다. 로컬 테스트에서만 없는 IP를 loopback으로 간주한다. 운영에서 헤더 또는 비밀키가 없으면 503으로 실패한다. IP당 UTC 분 버킷 30건 제한. Origin과 입력 검증 후 D1 접근한다.

D1 batch 트랜잭션에서 공개 상태 확인, 조건부 dedup UPSERT와 `changes()`에 따른 view INSERT를 순서대로 실행한다. 동일 글에 동시 요청해도 한 번만 집계한다. 일자 HMAC 교체 시 중복 기준이 초기화되는 한계는 명세에 적는다. DB 실패에는 성공 응답을 보내지 않는다. 매시간 정리 작업으로 7일 지난 조회, 만료 dedup, 5분 지난 rate limit을 지운다.

## 위젯과 디자인

`<blog-live-ranking api-base="https://실제-배포주소">`가 표시를 담당한다. 외부 `widget.js` 로더는 자신의 URL을 API 기본 주소로 사용하고 공개 글 페이지에서만 수집한다. `track="false"` 스크립트 속성은 미리보기와 설치 검사에서 수집을 끈다. demo 모드 웹 컴포넌트는 예시임을 표시하고 어떤 통계 요청도 하지 않는다.

기존 award 바 아래의 별도 흰 영역으로 제안한다. 제목 '지금 많이 읽는 글', 작은 빨간 표식, 기간 버튼, 숫자 순위와 텍스트 링크, 하단 집계 기준을 둔다. 전체 레이아웃은 최대 1020px, drawer 모드는 780px. 각 위젯의 내부는 300px 사이드바와 320px 화면 모두 대응한다. 본문 폰트와 얇은 규칙선은 사용자 스킨을 따른다. 루트 CSS 토큰은 `--ranking-accent`, `--ranking-text`, `--ranking-muted`, `--ranking-border`로 재정의 가능하다.

데이터는 textContent와 생성한 DOM으로 출력한다. 링크는 API가 제공해도 고정 블로그 origin의 숫자 경로인지 다시 검증한다. 여러 컴포넌트와 중복 script 로딩으로 수집/타이머가 중복되지 않게 한다. 요청 중 기간 변경, 제거 후 응답, 숨긴 탭, 네트워크 오류에 대해 AbortController와 세대 번호로 오래된 응답을 무시한다. 이전 기간의 결과를 새 기간의 결과로 보여주지 않는다.

## 외부 근거

## HOT 한 줄 표현 변경 (2026-11-24)

사용자가 제공한 HOT 배지와 여행지 이름 한 줄 이미지가 시각 기준이다. 모두투어와 하나투어 홈을 조회했지만 텍스트 응답에는 동적 인기 검색어의 순환/펼침 동작이 드러나지 않았다. 다음 동작은 해당 사이트를 그대로 복제했다는 주장이 아니라 블로그에 맞춘 구현 결정이다.

`HOT | 1 인기 글 제목 … | 일시정지 | ⌄` 한 줄을 기본으로 한다. 제목 클릭은 원문 이동, 화살표 클릭은 최대 560px의 TOP 5 패널을 펼친다. 단순 고정 제목보다 여러 글을 발견할 수 있고 큰 목록보다 본문을 적게 가리킨다. 패널은 호버만으로 열지 않고 명시적으로 클릭/키보드로 연다. 패널 외부 클릭과 Escape로 닫는다. 실제 DOM 링크는 유지하고 순환할 때 요약 링크의 텍스트와 주소만 바꾼다.

순환 5초와 서버 갱신 60초를 분리한다. 포커스/포인터/펼침/숨긴 탭/모션 줄이기에서는 순환을 멈추고, 사용자가 정지한 상태는 다른 상태 변화 후에도 유지한다. 화면에서 위젯을 제거하면 두 타이머와 이벤트를 정리한다. 자동 순환은 aria-live로 반복 낭독하지 않는다. 요약 제목과 순위는 패널 목록에서 재사용한 안전한 텍스트이며 새 API 응답에도 현재 글이 남아 있으면 유지한다.

로딩/빈 목록/초기 오류는 같은 줄의 안내로 나타낸다. 초기 오류에서는 좁은 화면에서 제목과 충돌하지 않도록 바로 아래에 재시도 버튼을 노출한다. 이전 결과가 있는 오류는 요약에 갱신 실패 표시와 패널의 상세 설명/재시도를 제공한다. 상세 집계 기준은 펼침 패널 안으로 옮긴다. 320px와 300px 사이드바에서 동일한 컴포넌트를 사용한다.

참고: https://www.modetour.com/ , https://www.hanatour.com/v2/home

- https://tistory.github.io/document-tistory-skin/sidebar/popular_post.html
- https://developers.cloudflare.com/d1/worker-api/d1-database/ (batch는 transaction)
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://upstash.com/blog/nextjs13-approuter-view-counter (중복 제외 조회 구조 참고)

## 남은 운영 단계

실제 DB ID 설정, 충분히 긴 DEDUP_SECRET 등록, 운영 카탈로그 적용, 배포, 실제 스킨에 삽입 후 검사. 모바일웹 자동 연결을 해제해야 사용자 스킨 로더의 실행 범위를 일관되게 할 수 있다. 별도 기본 모바일웹으로 직접 /m/ 접근한 경우는 지원하지 않는다. 배포 성공과 실제 블로그 설치를 서로 다른 완료 조건으로 기록한다.

