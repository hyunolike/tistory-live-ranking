# 공개 등록 변경 독립 검토

새 문맥 self_service_review에게 기준 ca5413c와 변경 diff, 명세와 설계를 제공했다. 전체 EGM loop 완료를 의미하지 않는다.

확인한 지적:

1. 공개 글 확인이 첫3개 실패 항목에서 계속 반복되어 뒤에 정상 글이 있어도 활성화되지 않음. checked_at 순환으로 변경하고 실패 후 통과한 회귀 테스트를 추가했다.
2. module script를 설치 증거로 인정하지만 로더는 document.currentScript를 사용함. 실행 가능한 classic script와 수집 활성 조건만 인정하도록 변경했다. module/text/plain/nomodule/data-track=false를 거절하는 회귀 테스트가 통과했다.

검토자는 위 수정 뒤 검토 범위 내에서 추가로 확인한 차단 문제가 없다고 반환했다. 검토자의 별도 Miniflare 재현은 샌드박스 localhost 권한에 막혔으므로 독립 테스트 통과로 기록하지 않는다. 구현자가 API31/브라우저22와 타입/빌드를 실행하고 통과 결과를 별도 검증 문서에 남겼다.

구현자는 추가로 구/신 hyunolike 수집 경로의 요청 제한을 통합하고, sitemap 제외 글의 뒤늦은 확인 결과가 수집과 표시로 복귀하지 않도록 listed 조건을 원자적 쿼리에도 적용했다.
