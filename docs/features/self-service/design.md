# 자체 등록 설계

티스토리 주소를 등록해 전용 코드를 발급하고 소유자가 스킨에 설치한다. 원격 자동 설치나 로그인/관리자 기능은 범위 밖이다. 이 선택은 공개 위젯 배포라는 사용자 요청을 위한 구현 결정이다.

기존 단일 블로그 테이블을 재구성하는 대신 신규 사이트용 sites/site_posts/site_views/site_dedup/site_limits 테이블을 추가한다. 기존 데이터와 구버전 API를 보존한다. 기존 hyunolike 사이트는 예약 ID hyunolike로 연결하고 legacy 저장 함수를 재사용해 새 코드와 기존 코드의 통계가 나뉘지 않게 한다.

POST /api/sites {url}: 제한된 본문과 티스토리 기본 호스트 검증, IP 일자 HMAC, 시간당 신규 등록 5회 제한. 주소 유일성과 공개 무작위 site ID로 멱등 등록한다. ID는 읽기와 수집 대상을 지정할 뿐 소유자 권한을 부여하지 않는다.

GET /api/sites/:id: 공개 설치 상태와 origin. POST /api/sites/:id/verify: 동일 서비스 origin에서 요청, 분당 1회 시도 제한. 블로그 홈에서 서비스의 widget.js와 data-site가 일치하는 실제 script를 파싱한다. sitemap과 공개 글을 제한된 크기와 시간으로 확인하고 카탈로그가 생기면 활성화한다. 활성화 전에는 수집과 랭킹을 제공하지 않는다.

GET /api/rankings?site=ID, POST /api/views?site=ID: site origin에 맞춰 CORS/조회를 분리한다. site를 생략한 기존 경로는 기존 구현을 유지한다. 설치 조각은 blog-live-ranking의 site/blog-origin 속성과 script의 data-site를 제공한다. 클라이언트도 origin과 글 경로를 검증한다.

공개 글 파서를 origin 매개변수로 일반화한다. contents_style 또는 article-view를 본문 증거로 사용하고 보호 폼/비밀번호 입력은 제외한다. /entry/문자열 주소도 정규화한다. 서버는 제공한 호스트의 sitemap과 공개 HTML만 읽고 외부 리디렉션을 따르지 않는다.

기존 시간당 legacy 카탈로그 갱신을 유지하며 신규 active 사이트는 갱신 시각 순으로 최대 3개, 사이트당 최대 5개 글을 순환 검증한다. 신규 등록당 최대 3개 글을 먼저 확인한다. 실패한 후보는 checked_at 순으로 순환해 이후 확인 시 다른 글로 진행한다. sitemap에 있는 나머지 글은 실제 방문 시 공개 상태를 확인한다. sitemap에서 빠진 글은 listed=0으로 표시해 재활성화를 막는다. 설치 증거는 classic JavaScript만 허용하며 module/nomodule/비실행 type/수집 비활성 코드는 제외한다. 블로그가 늘면 배치 크기를 늘리는 대신 별도 큐/스케줄 분할이 필요하다.

참고: 티스토리 Open API 종료 공지 https://notice.tistory.com/2664 . 주소 등록은 서비스 자동 설정이며 티스토리 스킨의 무인 수정 기능을 의미하지 않는다.
