import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FEATURE_CATALOG_VERSION,
  FEATURE_CATEGORIES,
  findFeature,
  getFeatureCatalog,
  listAllFeatures,
  resolveFeatureEnabled,
  validateFeatureCatalog,
} from '../src/platform/featureCatalog.js';
import {
  MANUAL_RENDER_VERSION,
  renderFeatureArticle,
  renderManualBody,
  renderManualNav,
} from '../src/platform/manualRender.js';

// 1. 카탈로그 자체 무결성 (id/키 중복, 필수 필드, 빈 카테고리 금지)
const validation = validateFeatureCatalog();
assert.deepEqual(validation.errors, []);
assert.equal(validation.ok, true);

const catalog = getFeatureCatalog();
assert.equal(catalog.version, FEATURE_CATALOG_VERSION);
assert.ok(catalog.categories.length >= 10, `expected >=10 categories, got ${catalog.categories.length}`);
assert.ok(catalog.featureCount >= 50, `expected >=50 features, got ${catalog.featureCount}`);

// 2. agent-contract 와 양방향 커버리지
const contract = JSON.parse(readFileSync(resolve('docs/user-manual/agent-contract.json'), 'utf8'));
const contractActions = new Set(contract.executeActions);
const contractReadApis = new Set(contract.readApis);
const features = listAllFeatures();

const referencedActions = new Set(features.flatMap((item) => item.relatedActions));
const referencedReadApis = new Set(features.flatMap((item) => item.relatedReadApis));

// 2a. 매뉴얼이 참조한 이름은 전부 실제 계약에 존재해야 한다 (오타 방지)
for (const name of referencedActions) {
  assert.ok(contractActions.has(name), `manual references unknown execute action: ${name}`);
}
for (const name of referencedReadApis) {
  assert.ok(contractReadApis.has(name), `manual references unknown read api: ${name}`);
}

// 2b. 계약의 모든 실행 액션은 매뉴얼 어딘가에 등재되어야 한다 (기능 누락 방지)
const missingActions = [...contractActions].filter((name) => !referencedActions.has(name));
assert.deepEqual(missingActions, [], `execute actions missing from feature manual: ${missingActions.join(', ')}`);

// 2c. 계약의 모든 읽기 API도 등재되어야 한다
const missingReadApis = [...contractReadApis].filter((name) => !referencedReadApis.has(name));
assert.deepEqual(missingReadApis, [], `read apis missing from feature manual: ${missingReadApis.join(', ')}`);

// 3. manualPage 참조 파일 실재 확인
for (const item of features) {
  if (!item.manualPage) continue;
  const path = resolve('docs/user-manual', item.manualPage);
  assert.ok(existsSync(path), `manualPage does not exist for ${item.id}: ${item.manualPage}`);
}

// 3b. 본문 충실도 — 목차만 있는 빈 설명서를 구조적으로 금지한다
for (const item of features) {
  assert.ok(item.howTo.length >= 2, `feature needs at least 2 howTo steps: ${item.id}`);
  assert.notEqual(item.description, item.summary, `feature needs a real description: ${item.id}`);
  assert.ok(item.description.length > item.summary.length, `description should extend the summary: ${item.id}`);
  if (item.status === 'preliminary') {
    assert.ok(item.limits.length >= 1, `preliminary feature must state limits: ${item.id}`);
  }
}

// 4. 기능 토글 계약 (향후 기능 제어의 진입점)
assert.equal(resolveFeatureEnabled('pushover'), true);
assert.equal(resolveFeatureEnabled('pushover', { 'feature.pushover': false }), false);
assert.equal(resolveFeatureEnabled('nodes', { 'feature.nodes': false }), true, 'non-toggleable features stay enabled');
assert.throws(() => resolveFeatureEnabled('no-such-feature'));
const toggleableCount = features.filter((item) => item.control.toggleable).length;
assert.ok(toggleableCount >= 8, `expected >=8 toggleable features, got ${toggleableCount}`);

// 5. 렌더러: 전 기능 앵커가 본문에 존재, nav 필터 동작, escape 처리
assert.equal(typeof MANUAL_RENDER_VERSION, 'string');
const body = renderManualBody(FEATURE_CATEGORIES);
for (const item of features) {
  assert.ok(body.includes(`id="${item.id}"`), `manual body missing anchor for ${item.id}`);
  assert.ok(body.includes(item.control.key), `manual body missing control key for ${item.id}`);
}
const nav = renderManualNav(FEATURE_CATEGORIES, '');
for (const category of FEATURE_CATEGORIES) {
  assert.ok(nav.includes(`#category-${category.id}`), `nav missing category link: ${category.id}`);
}
const filtered = renderManualNav(FEATURE_CATEGORIES, 'pushover');
assert.ok(filtered.includes('data-feature-link="pushover"'));
assert.ok(!filtered.includes('data-feature-link="dxf-import"'), 'filter should exclude unrelated features');

const evil = renderFeatureArticle(
  { ...findFeature('nodes'), name: '<script>x</script>', control: { key: 'feature.nodes', toggleable: false } },
  { name: 'cat' },
);
assert.ok(!evil.includes('<script>x</script>'), 'feature name must be HTML-escaped');

// 6. manual.html 이 카탈로그/렌더러 모듈을 실제로 로드하는지
const manualHtml = readFileSync(resolve('manual.html'), 'utf8');
assert.match(manualHtml, /src\/platform\/featureCatalog\.js/);
assert.match(manualHtml, /src\/platform\/manualRender\.js/);
assert.match(manualHtml, /id="manualNav"/);
assert.match(manualHtml, /id="manualContent"/);
assert.match(manualHtml, /id="manualSearch"/);

console.log(JSON.stringify({
  ok: true,
  version: FEATURE_CATALOG_VERSION,
  categories: catalog.categories.length,
  features: catalog.featureCount,
  toggleable: toggleableCount,
  actionsCovered: referencedActions.size,
  readApisCovered: referencedReadApis.size,
}, null, 2));
