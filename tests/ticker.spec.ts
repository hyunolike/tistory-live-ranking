import {test,expect} from '@playwright/test';

test('a compact HOT row cycles titles and opens the full ranking by keyboard',async({page})=>{
  await page.clock.install();
  await page.goto('/');
  const widget=page.locator('blog-live-ranking');
  const toggle=widget.getByRole('button',{name:'인기글 전체 보기'});
  const link=widget.locator('.ticker-link');
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(widget.getByRole('list')).toBeHidden();
  await expect(link).toHaveAttribute('href','https://hyunolike.tistory.com/81');
  expect(await widget.boundingBox().then(box=>box!.height)).toBeLessThan(60);
  await page.clock.fastForward(5_000);
  await expect(link).toHaveAttribute('href','https://hyunolike.tistory.com/77');
  await toggle.focus();await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(widget.getByRole('listitem')).toHaveCount(5);
  await page.mouse.move(0,0);await page.locator('.header a[href="https://github.com/hyunolike"]').focus();
  await page.clock.fastForward(10_000);
  await expect(link).toHaveAttribute('href','https://hyunolike.tistory.com/77');
  await widget.getByRole('button',{name:'최근 1시간',exact:true}).focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(widget.getByRole('list')).toBeHidden();
});

test('rotation pauses for hover, focus, expanded panel and explicit stop',async({page})=>{
  await page.clock.install();await page.goto('/');
  const widget=page.locator('blog-live-ranking');const link=widget.locator('.ticker-link');
  const first='https://hyunolike.tistory.com/81';
  await link.hover();await page.clock.fastForward(10_000);await expect(link).toHaveAttribute('href',first);
  await page.mouse.move(0,0);await link.focus();await page.clock.fastForward(10_000);await expect(link).toHaveAttribute('href',first);
  await widget.getByRole('button',{name:'인기글 전체 보기'}).click();
  await page.locator('.brand').click(); // external click closes the panel
  await expect(widget.getByRole('list')).toBeHidden();
  await widget.getByRole('button',{name:'자동 순환 일시정지'}).click();
  await page.locator('.brand').click();await page.mouse.move(0,0);
  await page.clock.fastForward(10_000);await expect(link).toHaveAttribute('href',first);
  await widget.getByRole('button',{name:'자동 순환 시작'}).click();
  await page.locator('.brand').click();await page.mouse.move(0,0);
  await page.clock.fastForward(5_000);await expect(link).not.toHaveAttribute('href',first);
});

test('reduced motion and hidden tabs stop automatic title changes',async({page})=>{
  await page.clock.install();await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const link=page.locator('blog-live-ranking').locator('.ticker-link');
  await page.clock.fastForward(10_000);await expect(link).toHaveAttribute('href','https://hyunolike.tistory.com/81');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.fastForward(10_000);await expect(link).toHaveAttribute('href','https://hyunolike.tistory.com/81');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.fastForward(5_000);await expect(link).toHaveAttribute('href','https://hyunolike.tistory.com/77');
});

test('removing and reconnecting a widget does not duplicate rotation timers',async({page})=>{
  await page.clock.install();await page.goto('/');
  await page.locator('blog-live-ranking').hover();
  await page.mouse.move(0,0);
  await page.evaluate(()=>{const element=document.querySelector('blog-live-ranking')!;element.remove();document.querySelector('.ranking-placement')!.append(element);});
  await page.clock.fastForward(5_000);
  await expect(page.locator('blog-live-ranking').locator('.ticker-link')).toHaveAttribute('href','https://hyunolike.tistory.com/77');
});

test('a refresh keeps focus on the summary link while the panel is open',async({page})=>{
  await page.clock.install();
  await page.route('**/api/rankings?*',route=>route.fulfill({json:{window:'24h',generatedAt:new Date().toISOString(),collectedSince:null,metric:'deduplicatedViews',items:[{postId:'81',title:'현재 읽는 글',url:'https://hyunolike.tistory.com/81',views:2,rank:1}]}}));
  await page.goto('/?live=1');
  const widget=page.locator('blog-live-ranking');
  await widget.getByRole('button',{name:'인기글 전체 보기'}).click();
  const summary=widget.locator('.ticker-link');await summary.focus();
  await page.clock.fastForward(60_000);
  await expect(summary).toBeFocused();
});
