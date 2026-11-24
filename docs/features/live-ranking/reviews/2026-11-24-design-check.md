# 독립 설계 검토

도구: fresh-context subagent, fork_turns=none. 검토 대상은 spec.md, design.md, tasks.md. 이것은 단일 독립 검토이며 전체 EGM loop 완료가 아니다.

## 지적과 조치

1. 공개 글 검증과 유효기간이 불명확했다.
   - 실제 공개 글 HTML에서 og:type=article, 기대한 canonical, #article-view 본문을 모두 확인한다. area-protected 또는 article-header-protected가 있으면 제외한다.
   - 카탈로그 verified_at이 24시간 이상 오래되면 집계/랭킹에서 제외한다. 매시간 sitemap을 확인하고 검증이 오래된 글 10개를 갱신한다. sitemap에서 빠진 글은 비활성화한다.
   - 공개 상태 변경을 즉시 반영하는 보장은 하지 않는다. 검증 주기 사이 노출될 수 있으며 이 한계를 README에 적는다.
2. 기본 모바일웹은 사용자 PC 스킨을 실행하지 않을 수 있다.
   - 설치 전제조건으로 모바일웹 자동 연결 해제를 명시한다. 직접 /m/ 접근에서 별도 스킨이 쓰이면 집계를 지원하지 않는다. URL 정규화가 로더 실행 자체를 보장하지 않는다고 기록한다.

검토자의 두 질문 모두 제품 범위를 늘리지 않고 운영 계약과 실패 처리를 명확하게 하는 방향으로 반영했다.
