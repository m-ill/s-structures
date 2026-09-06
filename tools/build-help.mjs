import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURE_CATEGORIES } from '../src/platform/featureCatalog.js';
import { GUIDE_GROUPS, listGuidePages } from '../src/platform/guidePages.js';
import { renderMarkdown } from '../src/platform/markdownRender.js';
import { renderFeatureArticle, escapeHtml } from '../src/platform/manualRender.js';

export const HELP_BUILD_VERSION = 'p4-help-build-v1';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 통합 도움말(help.html) 생성기.
 *
 * 사용 안내서(docs/user-manual/*.md)와 기능 설명서(featureCatalog)를
 * 하나의 자체포함 HTML 로 미리 렌더링한다 — 런타임 모듈 import/fetch 가
 * 전혀 없으므로 서버 없이 파일을 더블클릭(file://)해도 동작한다.
 * 좌측은 접이식 트리 메뉴, 본문은 선택한 페이지 하나만 표시한다.
 *
 * 재생성: `npm run build:help`. tests/p4-user-guide.mjs 가
 * "커밋된 help.html == 빌더 출력" 동기화를 강제한다.
 */
export function buildHelpArtifacts() {
  const pages = collectPages();
  const helpHtml = renderHelpHtml(pages);
  const redirectHtml = renderRedirectHtml();
  return { helpHtml, redirectHtml, pageCount: pages.length };
}

function collectPages() {
  const seen = new Set();
  const pages = [];

  for (const page of listGuidePages()) {
    const source = readFileSync(resolve(repoRoot, page.file), 'utf8');
    pages.push({
      id: page.id,
      title: page.title,
      crumb: `사용 안내서 · ${page.groupName}`,
      search: `${page.title} ${page.id}`.toLowerCase(),
      html: renderMarkdown(source),
    });
  }
  for (const category of FEATURE_CATEGORIES) {
    for (const item of category.features) {
      pages.push({
        id: item.id,
        title: item.name,
        crumb: `기능 설명서 · ${category.name}`,
        search: [item.name, item.id, item.summary, ...(item.relatedActions || []), ...(item.relatedReadApis || [])]
          .join(' ')
          .toLowerCase(),
        html: renderFeatureArticle(item, category),
      });
    }
  }

  for (const page of pages) {
    if (seen.has(page.id)) throw new Error(`Help page id collision: ${page.id}`);
    seen.add(page.id);
    if (page.html.includes('</template>')) throw new Error(`Page HTML breaks template embedding: ${page.id}`);
  }
  return pages;
}

function leafLink(id, title, search) {
  return `<a class="leaf" href="#${escapeHtml(id)}" data-leaf="${escapeHtml(id)}" data-search="${escapeHtml(search)}">${escapeHtml(title)}</a>`;
}

function treeGroup(label, leaves) {
  return `
      <div class="tree-group">
        <button type="button" class="node-toggle"><span class="twisty"></span>${escapeHtml(label)}</button>
        <div class="children">
${leaves.join('\n')}
        </div>
      </div>`;
}

function renderTree() {
  const guideGroups = GUIDE_GROUPS.map((group) => treeGroup(
    group.name,
    group.pages.map((page) => `          ${leafLink(page.id, page.title, `${page.title} ${page.id}`.toLowerCase())}`),
  )).join('\n');

  const featureGroups = FEATURE_CATEGORIES.map((category) => treeGroup(
    `${category.name} (${category.features.length})`,
    category.features.map((item) => `          ${leafLink(
      item.id,
      item.name,
      [item.name, item.id, item.summary, ...(item.relatedActions || []), ...(item.relatedReadApis || [])].join(' ').toLowerCase(),
    )}`),
  )).join('\n');

  return `
    <div class="tree-root open" data-root="guide">
      <button type="button" class="node-toggle root"><span class="twisty"></span>사용 안내서</button>
      <div class="children">${guideGroups}
      </div>
    </div>
    <div class="tree-root open" data-root="features">
      <button type="button" class="node-toggle root"><span class="twisty"></span>기능 설명서</button>
      <div class="children">${featureGroups}
      </div>
    </div>`;
}

function renderTemplates(pages) {
  return pages.map((page) => (
    `<template data-help-page="${escapeHtml(page.id)}" data-title="${escapeHtml(page.title)}" data-crumb="${escapeHtml(page.crumb)}">\n${page.html}\n</template>`
  )).join('\n');
}

const HELP_STYLE = `
:root{ --dku:#00467F; --dku2:#0A5CA8; --gold:#E8A11C; --panel:#f2f6fa; --line:#c9d7e4; --ink:#223; }
*{ box-sizing:border-box; margin:0; padding:0; font-family:'Segoe UI','Malgun Gothic',sans-serif; }
body{ background:#eef2f7; color:var(--ink); }
header.app{ position:sticky; top:0; z-index:5; background:var(--dku); color:#fff; padding:10px 18px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
header.app .logo{ font-weight:700; letter-spacing:.4px; }
header.app .logo span{ color:var(--gold); }
header.app input[type="search"]{ flex:1; min-width:200px; max-width:400px; padding:7px 10px; border:none; border-radius:6px; font-size:14px; }
header.app .meta{ font-size:12px; opacity:.85; }
header.app a.home{ color:#d7e5f2; font-size:13px; text-decoration:none; border:1px solid rgba(255,255,255,.35); padding:4px 10px; border-radius:6px; }
.layout{ display:grid; grid-template-columns:290px 1fr; min-height:calc(100vh - 52px); }
nav.sidebar{ background:var(--panel); border-right:1px solid var(--line); padding:12px 10px 60px; overflow-y:auto; position:sticky; top:52px; height:calc(100vh - 52px); }
.node-toggle{ display:flex; align-items:center; gap:6px; width:100%; text-align:left; background:none; border:none; cursor:pointer; padding:6px 8px; font-size:13.5px; color:#345; border-radius:6px; font-weight:600; }
.node-toggle:hover{ background:#e2ecf5; }
.node-toggle.root{ font-size:14.5px; color:var(--dku); }
.twisty{ width:0; height:0; border-top:5px solid transparent; border-bottom:5px solid transparent; border-left:7px solid #7a90a5; transition:transform .12s ease; flex:none; }
.open > .node-toggle > .twisty{ transform:rotate(90deg); }
.tree-root > .children, .tree-group > .children{ display:none; }
.tree-root.open > .children, .tree-group.open > .children{ display:block; }
.tree-root > .children{ padding-left:10px; }
.tree-group > .children{ padding-left:22px; display:none; }
.tree-group.open > .children{ display:flex; flex-direction:column; }
a.leaf{ display:block; padding:4px 9px; font-size:13px; color:#345; text-decoration:none; border-radius:5px; line-height:1.4; }
a.leaf:hover{ background:#e2ecf5; }
a.leaf.active{ background:var(--dku2); color:#fff; }
body.searching .tree-group{ display:none; }
body.searching .tree-group.has-match{ display:block; }
body.searching a.leaf{ display:none; }
body.searching a.leaf.match{ display:block; }
.nav-empty{ font-size:13px; color:#789; padding:10px; display:none; }
body.no-results .nav-empty{ display:block; }
main.content{ padding:26px 36px 90px; max-width:880px; }
.crumb-bar{ font-size:12px; color:#789; margin-bottom:10px; }
main.content h1{ font-size:22px; color:var(--dku); border-bottom:2px solid var(--dku); padding-bottom:6px; margin:4px 0 14px; }
main.content h2{ font-size:18px; color:var(--dku2); margin:24px 0 8px; }
main.content h3{ font-size:15px; margin:18px 0 6px; }
main.content h4{ font-size:13.5px; color:var(--dku); margin:14px 0 4px; }
main.content p{ font-size:14px; line-height:1.75; margin:8px 0; }
main.content ul, main.content ol{ padding-left:24px; margin:8px 0; font-size:14px; line-height:1.8; }
main.content table{ border-collapse:collapse; margin:12px 0; width:100%; font-size:13px; background:#fff; }
main.content th, main.content td{ border:1px solid var(--line); padding:7px 10px; text-align:left; vertical-align:top; line-height:1.55; }
main.content th{ background:#e8f0f8; color:var(--dku); }
main.content pre{ background:#0f2438; color:#dce9f5; border-radius:8px; padding:12px 14px; overflow-x:auto; margin:10px 0; }
main.content pre code{ font-size:12.5px; font-family:Consolas,'D2Coding',monospace; }
main.content p code, main.content li code, main.content td code, .api-list code{ background:#eef4fa; border:1px solid var(--line); border-radius:4px; padding:1px 5px; font-size:12.5px; }
main.content blockquote{ border-left:4px solid var(--gold); background:#fffaf0; padding:8px 14px; margin:10px 0; font-size:13.5px; }
main.content a{ color:var(--dku2); }
article.feature header .crumb{ display:none; }
article.feature .summary{ color:#345; font-size:13.5px; margin-bottom:10px; }
article.feature .description{ font-size:14px; line-height:1.75; }
.api-list code{ display:inline-block; margin:2px 3px 2px 0; }
.badge{ font-size:11px; padding:2px 8px; border-radius:10px; vertical-align:middle; font-weight:600; }
.badge-stable{ background:#e2f3e7; color:#1c7a3d; }
.badge-preliminary{ background:#fdf1dc; color:#9c6a08; }
footer.control-key{ margin-top:14px; padding-top:9px; border-top:1px dashed var(--line); font-size:12px; color:#678; }
footer.control-key code{ background:#f4f0e4; border:1px solid #e4d9b8; border-radius:4px; padding:1px 6px; }
@media print{ header.app, nav.sidebar{ display:none; } .layout{ display:block; } }
@media (max-width:760px){ .layout{ grid-template-columns:1fr; } nav.sidebar{ position:static; height:auto; max-height:320px; } }
`;

const HELP_SCRIPT = `
(function () {
  var DEFAULT_PAGE = '01-getting-started';
  var nav = document.getElementById('helpNav');
  var content = document.getElementById('helpContent');
  var crumb = document.getElementById('helpCrumb');
  var search = document.getElementById('helpSearch');

  function pageTemplate(id) {
    var templates = document.querySelectorAll('template[data-help-page]');
    for (var i = 0; i < templates.length; i += 1) {
      if (templates[i].getAttribute('data-help-page') === id) return templates[i];
    }
    return null;
  }

  function expandTo(leaf) {
    var node = leaf.parentElement;
    while (node && node !== nav) {
      if (node.classList && (node.classList.contains('tree-group') || node.classList.contains('tree-root'))) {
        node.classList.add('open');
      }
      node = node.parentElement;
    }
  }

  function showPage(id) {
    var template = pageTemplate(id) || pageTemplate(DEFAULT_PAGE);
    if (!template) return;
    var pageId = template.getAttribute('data-help-page');
    content.innerHTML = template.innerHTML;
    crumb.textContent = template.getAttribute('data-crumb') + ' · ' + template.getAttribute('data-title');
    var leaves = nav.querySelectorAll('a.leaf');
    for (var i = 0; i < leaves.length; i += 1) {
      var isActive = leaves[i].getAttribute('data-leaf') === pageId;
      leaves[i].classList.toggle('active', isActive);
      if (isActive) expandTo(leaves[i]);
    }
    window.scrollTo(0, 0);
  }

  function currentPageId() {
    var raw = (location.hash || '').slice(1);
    try { return decodeURIComponent(raw) || DEFAULT_PAGE; } catch (e) { return DEFAULT_PAGE; }
  }

  nav.addEventListener('click', function (event) {
    var toggle = event.target.closest ? event.target.closest('.node-toggle') : null;
    if (toggle) toggle.parentElement.classList.toggle('open');
  });

  // 본문 안의 #페이지 링크(예: 기능 설명서의 "자세한 절차")도 같은 문서 안에서 이동한다.
  window.addEventListener('hashchange', function () { showPage(currentPageId()); });

  search.addEventListener('input', function () {
    var query = search.value.trim().toLowerCase();
    document.body.classList.toggle('searching', !!query);
    var anyMatch = false;
    var groups = nav.querySelectorAll('.tree-group');
    for (var g = 0; g < groups.length; g += 1) {
      var leaves = groups[g].querySelectorAll('a.leaf');
      var groupMatch = false;
      for (var i = 0; i < leaves.length; i += 1) {
        var match = !query || (leaves[i].getAttribute('data-search') || '').indexOf(query) !== -1;
        leaves[i].classList.toggle('match', !!query && match);
        if (query && match) groupMatch = true;
      }
      groups[g].classList.toggle('has-match', groupMatch);
      if (query && groupMatch) { groups[g].classList.add('open'); anyMatch = true; }
    }
    document.body.classList.toggle('no-results', !!query && !anyMatch);
  });

  showPage(currentPageId());
})();
`;

function renderHelpHtml(pages) {
  return `<!DOCTYPE html>
<!--
  S-Structures — 통합 도움말 (사용 안내서 + 기능 설명서)
  © 2026 단국대학교 허석재 박사 (mill@dankook.ac.kr). All rights reserved.

  이 파일은 tools/build-help.mjs 가 생성한다 — 직접 수정하지 말 것.
  원본: docs/user-manual/*.md (안내서), src/platform/featureCatalog.js (기능),
  재생성: npm run build:help
  자체포함 문서 — 서버 없이 더블클릭(file://)으로도 열린다.
-->
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>S-Structures 도움말</title>
<style>${HELP_STYLE}</style>
</head>
<body>
<header class="app">
  <div class="logo">S-<span>Structures</span> 도움말</div>
  <input id="helpSearch" type="search" placeholder="검색 — 기능·페이지·액션 (예: pushover, 스프링, addLoad)">
  <div class="meta">안내서 ${listGuidePages().length} · 기능 ${FEATURE_CATEGORIES.reduce((sum, category) => sum + category.features.length, 0)}</div>
  <a class="home" href="./app.html">앱으로</a>
</header>
<div class="layout">
  <nav class="sidebar" id="helpNav" aria-label="도움말 목차">${renderTree()}
    <p class="nav-empty">검색 결과가 없습니다.</p>
  </nav>
  <main class="content">
    <div class="crumb-bar" id="helpCrumb"></div>
    <div id="helpContent"></div>
  </main>
</div>
${renderTemplates(pages)}
<script>${HELP_SCRIPT}</script>
</body>
</html>
`;
}

function renderRedirectHtml() {
  return `<!DOCTYPE html>
<!-- 이 페이지는 help.html 로 통합되었다 (tools/build-help.mjs 생성). 기존 링크 호환용 리다이렉트. -->
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>도움말로 이동 중…</title>
<script>location.replace('./help.html' + location.hash);</script>
</head>
<body>
<p>도움말이 통합되었습니다. 자동 이동하지 않으면 <a href="./help.html">여기</a>를 여세요.</p>
</body>
</html>
`;
}

function isMain() {
  const entry = (process.argv[1] || '').replace(/\\/g, '/');
  return entry.endsWith('tools/build-help.mjs');
}

if (isMain()) {
  const { helpHtml, redirectHtml, pageCount } = buildHelpArtifacts();
  writeFileSync(resolve(repoRoot, 'help.html'), helpHtml, 'utf8');
  writeFileSync(resolve(repoRoot, 'manual.html'), redirectHtml, 'utf8');
  writeFileSync(resolve(repoRoot, 'guide.html'), redirectHtml, 'utf8');
  console.log(JSON.stringify({ ok: true, version: HELP_BUILD_VERSION, pages: pageCount, out: ['help.html', 'manual.html', 'guide.html'] }, null, 2));
}
