export const GUIDE_PAGES_VERSION = 'p4-guide-pages-v1';

/**
 * 사용 안내서(guide.html)의 페이지 등록부 — docs/user-manual 마크다운의 단일 목차.
 *
 * featureCatalog 의 manualPage(파일명)와 여기 id 가 1:1 로 이어져
 * 기능 설명서(manual.html)의 "자세한 절차" 링크가 만들어진다.
 * tests/p4-user-guide.mjs 가 (a) 파일 실재, (b) featureCatalog 참조 전수 매핑을 강제한다.
 */

export const GUIDE_GROUPS = [
  {
    id: 'start',
    name: '시작하기',
    pages: [
      page('00-install', '설치와 서버 실행'),
      page('01-getting-started', '첫걸음 — 화면과 기본 흐름'),
    ],
  },
  {
    id: 'core',
    name: '핵심 작업',
    pages: [
      page('02-modeling-and-elastic-analysis', '모델링과 탄성해석'),
      page('03-loads-design-and-reports', '하중·설계 검토·계산서'),
    ],
  },
  {
    id: 'import',
    name: '가져오기',
    pages: [
      page('04-import-drawings', '도면(DXF/DWG) 가져오기'),
      page('05-import-pointcloud', '점군 가져오기'),
    ],
  },
  {
    id: 'advanced',
    name: '고급 기능',
    pages: [
      page('06-materials-library', '재료·단면 라이브러리'),
      page('07-nonlinear-analysis', '비선형해석'),
      page('08-collaboration', '협업·리비전·승인'),
    ],
  },
  {
    id: 'tutorials',
    name: '튜토리얼',
    pages: [
      page('T1-drawing-to-calculation', 'T1. 도면에서 계산서까지', 'tutorials/'),
      page('T2-pointcloud-to-model', 'T2. 점군에서 현황 모델까지', 'tutorials/'),
      page('T3-pushover-review', 'T3. Pushover 검토', 'tutorials/'),
    ],
  },
  {
    id: 'reference',
    name: '참고',
    pages: [
      page('STATUS_AND_LIMITS', '기능 상태와 한계'),
      page('AI_AGENT_GUIDE', 'AI 에이전트 가이드'),
    ],
  },
];

function page(id, title, subdir = '') {
  return { id, title, file: `docs/user-manual/${subdir}${id}.md` };
}

export function listGuidePages() {
  return GUIDE_GROUPS.flatMap((group) => group.pages.map((item) => ({ ...item, groupId: group.id, groupName: group.name })));
}

export function findGuidePage(pageId) {
  return listGuidePages().find((item) => item.id === pageId) || null;
}

/** featureCatalog 의 manualPage('04-import-drawings.md') → guide 페이지 id. 미등록이면 null. */
export function guidePageIdFromManualPage(manualPage) {
  if (!manualPage) return null;
  const id = String(manualPage).replace(/\.md$/i, '');
  return findGuidePage(id) ? id : null;
}

export function validateGuidePages() {
  const errors = [];
  const seen = new Set();
  for (const group of GUIDE_GROUPS) {
    if (!group.pages?.length) errors.push(`Guide group has no pages: ${group.id}`);
    for (const item of group.pages || []) {
      if (!item.id || !item.title || !item.file) errors.push(`Guide page missing fields: ${item.id || '(no id)'}`);
      if (seen.has(item.id)) errors.push(`Duplicate guide page id: ${item.id}`);
      seen.add(item.id);
    }
  }
  return { ok: errors.length === 0, errors };
}
