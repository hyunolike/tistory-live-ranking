# 공개 등록 서비스 배포

2026-11-25 KST. 사용자 요청: 다른 사용자도 티스토리 주소를 넣어 사용할 수 있게 확장. 실제 스킨 적용은 사용자 담당으로 유지했다.

- 설치 페이지: https://tistory-live-ranking.tistory-live-ranking.workers.dev/start/
- PR #3: https://github.com/hyunolike/tistory-live-ranking/pull/3
- 구현 커밋77302f4, 원격 Verify45504496110 성공 후 main0af1519로 병합.
- Worker 버전 c9da9168-b2f3-4d5d-b25f-b69e1eac9261. pnpm run deploy 성공.
- 운영 0003_sites.sql 마이그레이션 성공. 신규 테이블만 추가했다. 전후 기존 posts78건, views0건으로 보존 확인. sites에는 기존 호환용 hyunolike1건.
- 공개 HTTPS의 /start/를 실제 Chromium으로 열어 hyunolike 주소 등록, site ID와 blog-origin 및 운영 widget.js 주소가 들어간 코드 발급을 확인했다. 기존 주소 재등록으로 확인하여 타인 블로그/가짜 통계를 만들지 않았다.
- 기존 랭킹과 ?site=hyunolike 결과가 일치했다. pageerror0건, 조회 수집 요청0건.
- 배포 widget.js SHA-256 c2a89d4581f1a1a27522b4978a84e34a2d5fb40389e7b03aa090b18cd10e1d73. 로컬 빌드와 일치.
- API/카탈로그31개, 브라우저22개와 타입/빌드 통과. 독립 변경 검토와 검증 한계는 reviews/2026-11-25-code-review.md 및 verification.md 참조.

다른 소유자가 실제로 스킨에 설치하고 확인하는 운영 사례는 아직 없다. 코드 붙여넣기와 저장은 각 소유자가 직접 수행한다. 기본 .tistory.com 주소와 공개 글의 일반 스킨을 지원하며 개인 도메인과 기본 모바일웹은 제외한다.
