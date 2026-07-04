import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GUIDE_GROUPS, GUIDE_PAGES_VERSION, findGuidePage, guidePageIdFromManualPage,
  listGuidePages, validateGuidePages,
} from '../src/platform/guidePages.js';
import { renderMarkdown, MARKDOWN_RENDER_VERSION } from '../src/platform/markdownRender.js';
import { buildHelpArtifacts, HELP_BUILD_VERSION } from '../tools/build-help.mjs';
import { listAllFeatures } from '../src/platform/featureCatalog.js';

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

// 3. 마크다운 렌더러 — 매뉴얼이 쓰는 문법 전부 + 이스케이프
assert.equal(typeof MARKDOWN_RENDER_VERSION, 'string');
const sample = [
  '# 제목1', '## 제목2', '',
  '문단 **굵게** 그리고 `코드` 와 [링크](./help.html#x) 텍스트.',
  '', '| 열A | 열B |', '| --- | --- |', '| 값1 | 값2 |', '',
  '- 항목 하나', '- 항목 둘', '',
  '1. 첫째', '2. 둘째', '',
  '```text', '<script>alert(1)</script>', '```', '',
  '> 인용문', '', '---',
].join('\n');
const rendered = renderMarkdown(sample);
assert.match(rendered, /<h1>제목1<\/h1>/);
assert.match(rendered, /<strong>굵게<\/strong>/);
assert.match(rendered, /<a href="\.\/help\.html#x">링크<\/a>/);
assert.match(rendered, /<table><thead><tr><th>열A<\/th><th>열B<\/th>/);
assert.match(rendered, /<ul><li>항목 하나<\/li><li>항목 둘<\/li><\/ul>/);
assert.match(rendered, /<ol><li>첫째<\/li><li>둘째<\/li><\/ol>/);
assert.match(rendered, /<blockquote>인용문<\/blockquote>/);
assert.match(rendered, /<hr>/);
assert.ok(!rendered.includes('<script>alert'), 'raw HTML in markdown must be escaped');
assert.ok(rendered.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'fence body must be escaped verbatim');

// 4. 통합 도움말 빌드 — 커밋된 help.html/manual.html/guide.html 이 빌더 출력과 동기여야 한다
assert.equal(typeof HELP_BUILD_VERSION, 'string');
const artifacts = buildHelpArtifacts();
assert.equal(artifacts.pageCount, pages.length + listAllFeatures().length, 'help must embed every guide page and feature');
assert.equal(readFileSync(resolve('help.html'), 'utf8'), artifacts.helpHtml, 'help.html is stale — run `npm run build:help`');
assert.equal(readFileSync(resolve('manual.html'), 'utf8'), artifacts.redirectHtml, 'manual.html redirect is stale — run `npm run build:help`');
assert.equal(readFileSync(resolve('guide.html'), 'utf8'), artifacts.redirectHtml, 'guide.html redirect is stale — run `npm run build:help`');

// 5. help.html 구조 — 트리, 템플릿 전수, file:// 안전성
const helpHtml = artifacts.helpHtml;
assert.match(helpHtml, /id="helpNav"/);
assert.match(helpHtml, /id="helpContent"/);
assert.match(helpHtml, /id="helpSearch"/);
assert.match(helpHtml, />사용 안내서</);
assert.match(helpHtml, />기능 설명서</);
for (const page of pages) {
  assert.ok(helpHtml.includes(`data-help-page="${page.id}"`), `help missing guide template: ${page.id}`);
  assert.ok(helpHtml.includes(`data-leaf="${page.id}"`), `help tree missing guide leaf: ${page.id}`);
}
for (const feature of listAllFeatures()) {
  assert.ok(helpHtml.includes(`data-help-page="${feature.id}"`), `help missing feature template: ${feature.id}`);
  assert.ok(helpHtml.includes(`data-leaf="${feature.id}"`), `help tree missing feature leaf: ${feature.id}`);
}
// file:// 안전: 모듈 스크립트/fetch 금지, 인라인 스크립트 1개
assert.ok(!helpHtml.includes('type="module"'), 'help must not use module scripts (file:// support)');
assert.ok(!helpHtml.includes('fetch('), 'help must not fetch at runtime (file:// support)');
assert.equal((helpHtml.match(/<script>/g) || []).length, 1, 'help must have exactly one inline script');
// 렌더된 md 표가 실제 포함되는지 (01-getting-started 는 표를 가진다)
const startTemplate = helpHtml.slice(helpHtml.indexOf('data-help-page="01-getting-started"'));
assert.match(startTemplate.slice(0, 8000), /<table>/, 'guide page tables must be pre-rendered into help');
// 기능→안내서 상호 링크가 같은 문서 해시로 연결되는지
const dxfTemplate = helpHtml.slice(helpHtml.indexOf('data-help-page="dxf-import"'));
assert.match(dxfTemplate.slice(0, 6000), /href="#04-import-drawings"/, 'feature article must deep-link its guide page');

// 6. 리다이렉트 스텁과 앱 헤더 배선
assert.match(artifacts.redirectHtml, /location\.replace\('\.\/help\.html' \+ location\.hash\)/);
const appHtml = readFileSync(resolve('app.html'), 'utf8');
assert.match(appHtml, /href="\.\/help\.html"/);

console.log(JSON.stringify({
  ok: true,
  version: HELP_BUILD_VERSION,
  guidePages: pages.length,
  features: listAllFeatures().length,
  helpPages: artifacts.pageCount,
  helpBytes: artifacts.helpHtml.length,
}, null, 2));
