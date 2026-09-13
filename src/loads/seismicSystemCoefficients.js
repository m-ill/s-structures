import { getKcscRuleSources } from '../metadata/kcscRuleSources.js';

export const SEISMIC_SYSTEM_COEFFICIENTS_VERSION = 'p29-seismic-system-coefficients-v1';

// KDS 41 17 00 6.2 table 6.2-1. The column order after the system name is
// stated in 6.1(1) and owner-confirmed against pages 19~20 of the published
// standard: R (반응수정계수), Ω0 (시스템초과강도계수), Cd (변위증폭계수).
//
// The table is keyed by BOTH the framing family and the detail system, because
// the same detail system takes different coefficients under different families:
// an RC ordinary shear wall is R = 4 in a bearing wall system, 5 in a building
// frame system, 6 in a dual system with a special moment frame, and 5.5 in a
// dual system with an intermediate moment frame. Keying on the detail alone
// would silently pick one of them.
const SOURCE_CONFIRMATION = Object.freeze({
  columnOrder: 'owner-confirmed R, omega0, Cd against KDS 41 17 00:2022 pages 19~20',
  scope: 'reinforced concrete rows only; the steel, composite and masonry rows of table 6.2-1 are not entered',
});

const ROWS = Object.freeze([
  { family: 'bearing-wall', detail: 'rc-special-shear-wall', label: '내력벽시스템 · 철근콘크리트 특수전단벽', R: 5, omega0: 2.5, Cd: 5 },
  { family: 'bearing-wall', detail: 'rc-ordinary-shear-wall', label: '내력벽시스템 · 철근콘크리트 보통전단벽', R: 4, omega0: 2.5, Cd: 4 },
  { family: 'building-frame', detail: 'rc-special-shear-wall', label: '건물골조시스템 · 철근콘크리트 특수전단벽', R: 6, omega0: 2.5, Cd: 5 },
  { family: 'building-frame', detail: 'rc-ordinary-shear-wall', label: '건물골조시스템 · 철근콘크리트 보통전단벽', R: 5, omega0: 2.5, Cd: 4.5 },
  { family: 'moment-frame', detail: 'rc-special-moment-frame', label: '모멘트저항골조 · 철근콘크리트 특수모멘트골조', R: 8, omega0: 3, Cd: 5.5 },
  { family: 'moment-frame', detail: 'rc-intermediate-moment-frame', label: '모멘트저항골조 · 철근콘크리트 중간모멘트골조', R: 5, omega0: 3, Cd: 4.5 },
  { family: 'moment-frame', detail: 'rc-ordinary-moment-frame', label: '모멘트저항골조 · 철근콘크리트 보통모멘트골조', R: 3, omega0: 3, Cd: 2.5 },
  { family: 'dual-special-moment-frame', detail: 'rc-special-shear-wall', label: '특수모멘트골조를 가진 이중골조 · 철근콘크리트 특수전단벽', R: 7, omega0: 2.5, Cd: 5.5 },
  { family: 'dual-special-moment-frame', detail: 'rc-ordinary-shear-wall', label: '특수모멘트골조를 가진 이중골조 · 철근콘크리트 보통전단벽', R: 6, omega0: 2.5, Cd: 5 },
  { family: 'dual-intermediate-moment-frame', detail: 'rc-special-shear-wall', label: '중간모멘트골조를 가진 이중골조 · 철근콘크리트 특수전단벽', R: 6.5, omega0: 2.5, Cd: 5 },
  { family: 'dual-intermediate-moment-frame', detail: 'rc-ordinary-shear-wall', label: '중간모멘트골조를 가진 이중골조 · 철근콘크리트 보통전단벽', R: 5.5, omega0: 2.5, Cd: 4.5 },
  { family: 'shear-wall-frame-interactive', detail: 'rc-ordinary-shear-wall', label: '보통전단벽-골조 상호작용시스템 · 철근콘크리트', R: 4.5, omega0: 2.5, Cd: 4 },
]);

const codeReferences = () => getKcscRuleSources(['411700'])
  .map((source) => ({ ...source, clause: '6.1(1); 6.2 표 6.2-1; 6.3; 6.4.3; 6.4.4' }));

const base = () => ({
  version: SEISMIC_SYSTEM_COEFFICIENTS_VERSION,
  sourceConfirmation: SOURCE_CONFIRMATION,
  codeReferences: codeReferences(),
  qualification: 'clause-scoped-not-whole-design',
  designTransferAllowed: false,
});

/**
 * R, Omega0 and Cd for one declared seismic force resisting system.
 *
 * The system declaration is the user's, and this does not second-guess it. What
 * it refuses to do is guess: a detail system named without its framing family
 * has no single answer in table 6.2-1, so the candidates are returned instead
 * of one of them.
 */
export function seismicSystemCoefficients(input = {}) {
  const { family = null, detail = null } = input;

  if (!detail) {
    return { ...base(), status: 'NOT_CHECKED', reason: 'SEISMIC_SYSTEM_REQUIRED', family, detail };
  }

  const byDetail = ROWS.filter((row) => row.detail === detail);
  if (!byDetail.length) {
    return {
      ...base(),
      status: 'NOT_CHECKED',
      reason: 'SEISMIC_SYSTEM_NOT_IN_TABLE',
      note: 'table 6.2-1 also lists systems outside reinforced concrete, and 6.1(1) requires a separate basis for a system it does not list at all',
      family,
      detail,
    };
  }

  if (!family) {
    // The same detail system takes different coefficients under different
    // families, so an unqualified detail is ambiguous rather than defaultable.
    return {
      ...base(),
      status: 'NOT_CHECKED',
      reason: 'SEISMIC_SYSTEM_FAMILY_REQUIRED',
      detail,
      candidates: byDetail.map((row) => ({ family: row.family, label: row.label, R: row.R, omega0: row.omega0, Cd: row.Cd })),
    };
  }

  const row = byDetail.find((entry) => entry.family === family);
  if (!row) {
    return {
      ...base(),
      status: 'NOT_CHECKED',
      reason: 'SEISMIC_SYSTEM_COMBINATION_NOT_IN_TABLE',
      family,
      detail,
      candidates: byDetail.map((entry) => ({ family: entry.family, label: entry.label })),
    };
  }

  return {
    ...base(),
    status: 'OK',
    reason: null,
    family: row.family,
    detail: row.detail,
    label: row.label,
    responseModificationFactor: row.R,
    systemOverstrengthFactor: row.omega0,
    deflectionAmplificationFactor: row.Cd,
    // 6.2-1 also carries height limits by seismic design category, and 6.1(1)
    // requires the system's own qualifying conditions. Neither is entered here,
    // so a coefficient returned OK is not a statement that the system is
    // permitted at this building's height.
    heightLimitChecked: false,
    systemQualificationChecked: false,
    limitations: [
      'the seismic design category height limits of table 6.2-1 are not evaluated',
      'whether the declared system actually qualifies is not evaluated; 6.1(1) requires that separately',
      'combination rules 6.3, 6.4.3 and 6.4.4 apply when systems differ by axis or by storey and are not applied here',
    ],
  };
}

/**
 * Lowest R among the systems acting in one direction, per 6.4.3.
 *
 * Returns the governing row rather than only the number, because the point of
 * the clause is which system governs.
 */
export function governingResponseModificationFactor(systems = []) {
  const resolved = systems.map((system) => seismicSystemCoefficients(system));
  const failed = resolved.filter((row) => row.status !== 'OK');
  if (!resolved.length || failed.length) {
    return {
      ...base(),
      status: 'NOT_CHECKED',
      reason: resolved.length ? 'SEISMIC_SYSTEM_UNRESOLVED' : 'SEISMIC_SYSTEM_REQUIRED',
      unresolved: failed.map((row) => ({ family: row.family, detail: row.detail, reason: row.reason })),
    };
  }
  const governing = resolved.reduce((low, row) => (row.responseModificationFactor < low.responseModificationFactor ? row : low));
  return {
    ...base(),
    status: 'OK',
    reason: null,
    clause: 'KDS 41 17 00 6.4.3(1)',
    basis: 'the smallest R among the systems in the same direction, excluding the roof storey',
    responseModificationFactor: governing.responseModificationFactor,
    governingSystem: { family: governing.family, detail: governing.detail, label: governing.label },
    considered: resolved.map((row) => ({ family: row.family, detail: row.detail, R: row.responseModificationFactor })),
    roofStoreyExcluded: false,
    limitations: ['the roof storey exclusion of 6.4.3(1) must be applied by the caller when assembling the list'],
  };
}

export { ROWS as SEISMIC_SYSTEM_TABLE, SOURCE_CONFIRMATION };
