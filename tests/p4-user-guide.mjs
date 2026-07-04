import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GUIDE_GROUPS, GUIDE_PAGES_VERSION, findGuidePage, guidePageIdFromManualPage,
  listGuidePages, validateGuidePages,
} from '../src/platform/guidePages.js';
import { renderMarkdown, MARKDOWN_RENDER_VERSION } from '../src/platform/markdownRender.js';
import { renderFeatureArticle, MANUAL_RENDER_VERSION } from '../src/platform/manualRender.js';
import { listAllFeatures, findFeature } from '../src/platform/featureCatalog.js';

// 1. 안내서 등록부 무결성 — 파일 실재, 중복 없음, 그룹 비어있지 않음
assert.equal(typeof GUIDE_PAGES_VERSION, 'string');
const registry = validateGuidePages();
assert.deepEqual(registry.errors, []);
const pages = listGuidePages();
assert.ok(pages.length >= 14, `expected >=14 guide pages, got ${pages.length}`);
for (const page of pages) {
  assert.ok(existsSync(resolve(page.file)), `guide page file missing: ${page.file}`);
}
assert.ok(GUIDE_GROUPS.some((group) => group.id === 'tutorials'), 'tutorials group required');

// 2. featureCatalog 의 manualPage 전수가 안내서 페이지로 매핑되어야 한다
for (const feature of listAllFeatures()) {
  if (!feature.manualPage) continue;
  const guideId = guidePageIdFromManualPage(feature.manualPage);
  assert.ok(guideId, `feature ${feature.id} references unregistered manual page: ${feature.manualPage}`);
  assert.ok(findGuidePage(guideId), `guide page not found for ${feature.manualPage}`);
}

// 3. 마크다운 렌더러 — 매뉴얼이 쓰는 문법 전부
assert.equal(typeof MARKDOWN_RENDER_VERSION, 'string');
const sample = [
  '# 제목1', '## 제목2', '',
  '문단 **굵게** 그리고 `코드` 와 [링크](./guide.html#x) 텍스트.',
  '', '| 열A | 열B |', '| --- | --- |', '| 값1 | 값2 |', '',
  '- 항목 하나', '- 항목 둘', '',
  '1. 첫째', '2. 둘째', '',
  '```text', '<script>alert(1)</script>', '```', '',
  '> 인용문', '', '---',
].join('\n');
const rendered = renderMarkdown(sample);
assert.match(rendered, /<h1>제목1<\/h1>/);
assert.match(rendered, /<h2>제목2<\/h2>/);
assert.match(rendered, /<strong>굵게<\/strong>/);
assert.match(rendered, /<code>코드<\/code>/);
assert.match(rendered, /<a href="\.\/guide\.html#x">링크<\/a>/);
assert.match(rendered, /<table><thead><tr><th>열A<\/th><th>열B<\/th>/);
assert.match(rendered, /<td>값1<\/td><td>값2<\/td>/);
assert.match(rendered, /<ul><li>항목 하나<\/li><li>항목 둘<\/li><\/ul>/);
assert.match(rendered, /<ol><li>첫째<\/li><li>둘째<\/li><\/ol>/);
assert.match(rendered, /<blockquote>인용문<\/blockquote>/);
assert.match(rendered, /<hr>/);
assert.ok(!rendered.includes('<script>alert'), 'raw HTML in markdown must be escaped');
assert.ok(rendered.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'fence body must be escaped verbatim');

// 4. 등록된 전 페이지가 오류 없이 렌더링되고, 표를 가진 문서는 <table> 이 생성된다
for (const page of pages) {
  const source = readFileSync(resolve(page.file), 'utf8');
  const html = renderMarkdown(source);
  assert.ok(html.length > 200, `rendered page too small: ${page.id}`);
  assert.match(html, /<h1>/, `page must have a top heading: ${page.id}`);
  if (/^\s*\|.*\|\s*$/m.test(source)) {
    assert.match(html, /<table>/, `page with markdown tables must render a table: ${page.id}`);
  }
  assert.ok(!/<script>/i.test(html), `rendered page must not contain live script tags: ${page.id}`);
}

// 5. 기능 설명서 → 안내서 링크 연결
assert.equal(MANUAL_RENDER_VERSION, 'p4-manual-render-v2');
const dxf = findFeature('dxf-import');
const article = renderFeatureArticle(dxf, { name: '도면·점군 가져오기' });
assert.match(article, /href="\.\/guide\.html#04-import-drawings"/);
assert.match(article, /data-guide-link="04-import-drawings"/);

// 6. guide.html 배선 — 모듈 로드, 컨테이너, 탭 상호 링크
const guideHtml = readFileSync(resolve('guide.html'), 'utf8');
assert.match(guideHtml, /src\/platform\/guidePages\.js/);
assert.match(guideHtml, /src\/platform\/markdownRender\.js/);
assert.match(guideHtml, /id="guideNav"/);
assert.match(guideHtml, /id="guideContent"/);
assert.match(guideHtml, /href="\.\/manual\.html"/);

const manualHtml = readFileSync(resolve('manual.html'), 'utf8');
assert.match(manualHtml, /href="\.\/guide\.html"/);
const appHtml = readFileSync(resolve('app.html'), 'utf8');
assert.match(appHtml, /guide\.html/);

// 7. 서버가 .md 를 텍스트로 서빙 (fetch 렌더링 경로)
const serverMain = readFileSync(resolve('server/main.mjs'), 'utf8');
assert.match(serverMain, /'\.md': 'text\/markdown/);

console.log(JSON.stringify({
  ok: true,
  version: GUIDE_PAGES_VERSION,
  guidePages: pages.length,
  groups: GUIDE_GROUPS.length,
}, null, 2));
