import type { RankingResponse, RankingWindow } from '../shared/contracts.ts';

export function demoRanking(window:RankingWindow):RankingResponse{
  const posts=[
    ['81','[AI] HTTP 200인데 챗봇은 답하지 않았다',128],
    ['77','[WEB] 아이폰에서 멈춘 지도 애니메이션, 기종 문제가 아닌 코드 분기 문제였다',96],
    ['70','[프로젝트] 점검 페이지는 장애 난 시스템 밖에 있어야 한다',73],
    ['63','[운영] 서로 다른 Linux·Windows 로그를 하나의 운영 원칙으로',51],
    ['78','[AI] 질문하면 내 블로그 글로 답하는 챗봇을 만들었다',42]
  ] as const;
  const ordered=window==='1h'?[posts[1],posts[0],posts[4],posts[2],posts[3]]:posts;
  return {window,generatedAt:new Date().toISOString(),collectedSince:null,metric:'deduplicatedViews',items:ordered.map((p,i)=>({postId:p[0],title:p[1],url:`https://hyunolike.tistory.com/${p[0]}`,views:window==='1h'?[23,18,12,8,5][i]:p[2],rank:i+1}))};
}
