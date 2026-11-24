# Tistory live ranking

- 서비스 대상: 티스토리 기본 하위 도메인. 기존 https://hyunolike.tistory.com/ 설치와 API는 호환 유지.
- 신규 기능과 동작 변경은 SDD와 EGM을 기본 절차로 사용한다.
- 기존 위젯 명세는 `docs/features/live-ranking/`, 공개 등록 명세는 `docs/features/self-service/`에 둔다. 원문을 다른 문서로 복제하지 않는다.
- EGM artifact directory: docs/features/live-ranking/reviews
- 실제 독립 검토와 테스트 증거를 남긴다. 자체 검토를 EGM 완료로 기록하지 않는다.
- 스킨 전체를 교체하지 않는다. 위젯은 Shadow DOM으로 격리하고 설치용 패치만 제공한다.
- 기존 award, project-tree, blog-agent 선택자를 수정하지 않는다.
- 운영 통계와 데모 데이터를 혼합하지 않는다. 데모임을 눈에 띄게 표시한다.
- Cloudflare 배포와 티스토리 관리자 수정은 요청 범위를 확인한 뒤 별도로 수행한다.
- 공개 수집 API는 인증된 방문자의 증명이 아니다. Origin 검사만으로 조작 방지를 보장하지 않는다.
- 비밀키, 원본 IP, 관리자 인증 정보, 스킨 전체 원문은 커밋하지 않는다.
- 검증: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`.

