import { FEATURE_CATALOG_VERSION, FEATURE_CATEGORIES } from './featureCatalog.js';
import { findGuidePage, guidePageIdFromManualPage } from './guidePages.js';

export const MANUAL_RENDER_VERSION = 'p4-manual-render-v3';

const STATUS_LABEL = {
  stable: { text: '정식', className: 'badge-stable' },
  preliminary: { text: '예비', className: 'badge-preliminary' },
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderManualNav(categories = FEATURE_CATEGORIES, filterText = '') {
  const filter = filterText.trim().toLowerCase();
  const sections = categories.map((category) => {
    const items = category.features
      .filter((item) => matchesFilter(item, filter))
      .map((item) => `<li><a href="#${escapeHtml(item.id)}" data-feature-link="${escapeHtml(item.id)}">${escapeHtml(item.name)}</a></li>`)
      .join('');
    if (!items) return '';
    return `
      <section class="nav-category" data-category="${escapeHtml(category.id)}">
        <h3><a href="#category-${escapeHtml(category.id)}">${escapeHtml(category.name)}</a></h3>
        <ul>${items}</ul>
      </section>`;
  }).join('');
  return sections || '<p class="nav-empty">검색 결과가 없습니다.</p>';
}

/** manualPage(md 파일명)를 사용 안내서(guide.html) 링크로 변환. 미등록 파일은 경로 텍스트로 유지. */
function renderGuideLink(manualPage) {
  if (!manualPage) return '';
  const guideId = guidePageIdFromManualPage(manualPage);
  if (!guideId) {
    return `<p class="manual-link">자세한 절차: <code>docs/user-manual/${escapeHtml(manualPage)}</code></p>`;
  }
  const page = findGuidePage(guideId);
  return `<p class="manual-link">자세한 절차: <a href="#${escapeHtml(guideId)}" data-guide-link="${escapeHtml(guideId)}">${escapeHtml(page.title)}</a></p>`;
}

function matchesFilter(item, filter) {
  if (!filter) return true;
  const haystack = [item.id, item.name, item.summary, item.description, ...(item.relatedActions || []), ...(item.relatedReadApis || [])]
    .join(' ')
    .toLowerCase();
  return haystack.includes(filter);
}

export function renderFeatureArticle(item, category) {
  const status = STATUS_LABEL[item.status] || STATUS_LABEL.stable;
  const howTo = item.howTo?.length
    ? `<h4>사용 방법</h4><ol>${item.howTo.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
    : '';
  const limits = item.limits?.length
    ? `<h4>한계</h4><ul class="limits">${item.limits.map((row) => `<li>${escapeHtml(row)}</li>`).join('')}</ul>`
    : '';
  const actions = item.relatedActions?.length
    ? `<h4>관련 실행 액션</h4><p class="api-list">${item.relatedActions.map((name) => `<code>${escapeHtml(name)}</code>`).join(' ')}</p>`
    : '';
  const readApis = item.relatedReadApis?.length
    ? `<h4>관련 읽기 API</h4><p class="api-list">${item.relatedReadApis.map((name) => `<code>${escapeHtml(name)}</code>`).join(' ')}</p>`
    : '';
  const manualPage = renderGuideLink(item.manualPage);
  const blocks = [howTo, limits, actions, readApis, manualPage]
    .filter(Boolean)
    .map((block) => `      ${block}`)
    .join('\n');
  return `
    <article class="feature" id="${escapeHtml(item.id)}" data-feature="${escapeHtml(item.id)}">
      <header>
        <span class="crumb">${escapeHtml(category.name)}</span>
        <h2>${escapeHtml(item.name)} <span class="badge ${status.className}">${status.text}</span></h2>
        <p class="summary">${escapeHtml(item.summary)}</p>
      </header>
      <p class="description">${escapeHtml(item.description)}</p>
${blocks}
      <footer class="control-key">기능 제어 키: <code>${escapeHtml(item.control.key)}</code>${item.control.toggleable ? ' (토글 가능)' : ' (기본 상시)'} </footer>
    </article>`;
}

export function renderCategorySection(category) {
  const articles = category.features.map((item) => renderFeatureArticle(item, category)).join('\n');
  return `
    <section class="category" id="category-${escapeHtml(category.id)}">
      <h1>${escapeHtml(category.name)}</h1>
      <p class="category-summary">${escapeHtml(category.summary)}</p>
      ${articles}
    </section>`;
}

export function renderManualBody(categories = FEATURE_CATEGORIES) {
  return categories.map((category) => renderCategorySection(category)).join('\n');
}

export function renderManualMeta(categories = FEATURE_CATEGORIES) {
  const featureCount = categories.reduce((sum, category) => sum + category.features.length, 0);
  return `카탈로그 ${escapeHtml(FEATURE_CATALOG_VERSION)} · 카테고리 ${categories.length} · 기능 ${featureCount}`;
}
