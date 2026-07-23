import { escapeHtml } from '../reportFormat.js';

export const P11_REPORT_LOCALES = Object.freeze(['ko-KR', 'en-US']);
export const P11_KOREAN_FONT_STACK = '"Pretendard","Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",Arial,sans-serif';

const EN = Object.freeze({
  'report.title': 'Structural Analysis Report',
  'report.subtitle': 'Bilingual calculation report candidate',
  'report.project': 'Project',
  'report.snapshot': 'Report snapshot',
  'report.schema': 'Schema',
  'report.conclusion': 'Overall conclusion',
  'report.scopeNotice': 'This report confirms program operation. Independent engineering correctness is shown separately.',
  'section.verdict': 'Qualification summary',
  'section.model': 'Model summary',
  'section.analysis': 'Elastic analysis summary',
  'section.governing': 'Governing result',
  'section.limitations': 'Limitations and review items',
  'metric.nodes': 'Nodes',
  'metric.members': 'Members',
  'metric.loads': 'Loads',
  'metric.loadCases': 'Load cases',
  'metric.combinations': 'Combinations',
  'metric.stories': 'Stories',
  'metric.maxDisplacement': 'Maximum displacement',
  'metric.maxUtilization': 'Maximum utilization',
  'metric.maxResidual': 'Maximum equilibrium residual',
  'metric.memberId': 'Member ID',
  'metric.comboId': 'Combination ID',
  'metric.checkId': 'Check ID',
  'metric.ratio': 'Ratio',
  'axis.operational': 'Program operation',
  'axis.numericalIntegrity': 'Numerical integrity',
  'axis.engineeringValidation': 'Engineering validation',
  'axis.issueSuitability': 'Issue suitability',
  'label.status': 'Status',
  'label.reasonCodes': 'Reason codes',
  'label.notAvailable': 'Not available',
  'label.unit.mm': 'mm',
  'label.unit.ratio': 'ratio',
  'footer.generatedFrom': 'Generated from immutable snapshot {hash}',
  'glyph.probe': 'English font search and copy probe',
  'reason.ANALYSIS_FAILED': 'Analysis failed',
  'reason.AUDIT_FAILED': 'Required audit failed',
  'reason.STALE_SNAPSHOT': 'Snapshot is stale',
  'reason.REQUIRED_EVIDENCE_MISSING': 'Required evidence is missing',
  'reason.INDEPENDENT_REFERENCE_NOT_AVAILABLE': 'Independent reference is not available',
  'reason.ENGINEERING_VALIDATION_INCOMPLETE': 'Engineering validation is incomplete',
  'reason.ISSUE_SCOPE_LIMITED': 'Issue scope is limited',
  'reason.FEATURE_NOT_IN_SCOPE': 'Feature is outside the current scope',
  'reason.FEATURE_NOT_VERIFIED': 'Feature is not verified',
  'reason.OPERATIONAL_CHECKS_PASSED': 'Operational checks passed',
});

const KO = Object.freeze({
  'report.title': '구조해석 보고서',
  'report.subtitle': '한·영 계산서 후보',
  'report.project': '프로젝트',
  'report.snapshot': '보고서 스냅샷',
  'report.schema': '스키마',
  'report.conclusion': '종합 결론',
  'report.scopeNotice': '이 보고서는 프로그램 동작을 확인하며 독립적인 구조공학 검증 상태는 별도로 표시합니다.',
  'section.verdict': '검증 상태 요약',
  'section.model': '모델 요약',
  'section.analysis': '탄성해석 결과 요약',
  'section.governing': '지배 결과',
  'section.limitations': '제한사항 및 검토 항목',
  'metric.nodes': '절점',
  'metric.members': '부재',
  'metric.loads': '하중',
  'metric.loadCases': '하중 케이스',
  'metric.combinations': '하중조합',
  'metric.stories': '층수',
  'metric.maxDisplacement': '최대 변위',
  'metric.maxUtilization': '최대 이용률',
  'metric.maxResidual': '최대 평형잔차',
  'metric.memberId': '부재 ID',
  'metric.comboId': '조합 ID',
  'metric.checkId': '검토 ID',
  'metric.ratio': '비율',
  'axis.operational': '프로그램 동작',
  'axis.numericalIntegrity': '수치 무결성',
  'axis.engineeringValidation': '구조공학 검증',
  'axis.issueSuitability': '발행 적합성',
  'label.status': '상태',
  'label.reasonCodes': '판정 사유 코드',
  'label.notAvailable': '자료 없음',
  'label.unit.mm': 'mm',
  'label.unit.ratio': '비율',
  'footer.generatedFrom': '불변 스냅샷 {hash}에서 생성',
  'glyph.probe': '구조해석 보고서 한글 글꼴 검색 복사 확인',
  'reason.ANALYSIS_FAILED': '해석 실패',
  'reason.AUDIT_FAILED': '필수 감사 실패',
  'reason.STALE_SNAPSHOT': '스냅샷이 현재 결과와 다름',
  'reason.REQUIRED_EVIDENCE_MISSING': '필수 증거 누락',
  'reason.INDEPENDENT_REFERENCE_NOT_AVAILABLE': '독립 기준해 없음',
  'reason.ENGINEERING_VALIDATION_INCOMPLETE': '구조공학 검증 미완료',
  'reason.ISSUE_SCOPE_LIMITED': '발행 범위 제한',
  'reason.FEATURE_NOT_IN_SCOPE': '현재 범위에 포함되지 않은 기능',
  'reason.FEATURE_NOT_VERIFIED': '검증되지 않은 기능',
  'reason.OPERATIONAL_CHECKS_PASSED': '프로그램 동작 점검 통과',
});

export const P11_REPORT_CATALOGS = Object.freeze({ 'en-US': EN, 'ko-KR': KO });

export function createReportTranslator(locale) {
  const catalog = P11_REPORT_CATALOGS[locale];
  if (!catalog) throw reportLocaleError('P11_REPORT_LOCALE_UNSUPPORTED', `Unsupported locale: ${locale}`);
  return (key, params = {}) => {
    const template = catalog[key];
    if (template == null) throw reportLocaleError('P11_REPORT_MESSAGE_MISSING', `Missing ${locale} message: ${key}`);
    return interpolate(template, params);
  };
}

export function formatReportNumber(value, locale, options = {}) {
  if (value == null || !Number.isFinite(Number(value))) return createReportTranslator(locale)('label.notAvailable');
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: options.maximumFractionDigits ?? 6,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    useGrouping: options.useGrouping ?? false,
  }).format(Number(value));
}

export function validateReportCatalogs(usedKeys = null) {
  const locales = P11_REPORT_LOCALES;
  const referenceKeys = Object.keys(P11_REPORT_CATALOGS[locales[0]]).sort();
  const errors = [];
  for (const locale of locales.slice(1)) {
    const keys = Object.keys(P11_REPORT_CATALOGS[locale]).sort();
    if (keys.join('\n') !== referenceKeys.join('\n')) errors.push(`key-set:${locale}`);
    for (const key of referenceKeys) {
      if (placeholderSignature(P11_REPORT_CATALOGS[locale][key]) !== placeholderSignature(P11_REPORT_CATALOGS[locales[0]][key])) {
        errors.push(`placeholder:${locale}:${key}`);
      }
    }
  }
  if (usedKeys) {
    for (const key of referenceKeys) if (!usedKeys.has(key)) errors.push(`unused:${key}`);
    for (const key of usedKeys) if (!referenceKeys.includes(key)) errors.push(`unregistered:${key}`);
  }
  for (const [key, value] of Object.entries(KO)) {
    if (!/[가-힣]/.test(value) && !['label.unit.mm'].includes(key)) errors.push(`ko-untranslated:${key}`);
  }
  for (const [key, value] of Object.entries(EN)) {
    if (/[가-힣]/.test(value)) errors.push(`en-hangul:${key}`);
  }
  return { ok: errors.length === 0, errors, keyCount: referenceKeys.length };
}

function interpolate(template, params) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key) => {
    if (!Object.hasOwn(params, key)) throw reportLocaleError('P11_REPORT_PLACEHOLDER_MISSING', `Missing placeholder: ${key}`);
    return escapeHtml(String(params[key]));
  });
}

function placeholderSignature(value) {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort().join(',');
}

function reportLocaleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
