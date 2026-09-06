export const STEEL_CLASSIFY_VERSION = 'p3-m18-steel-classify';

export function classifySteelSection(check = {}) {
  const sectionId = String(check.sectionId || '').toUpperCase();
  const role = check.role || 'member';
  const compactness = sectionId.includes('PIPE') || sectionId.includes('BOX') ? 'noncompact-review' : 'compact-assumed';
  return {
    version: STEEL_CLASSIFY_VERSION,
    memberId: check.memberId,
    role,
    compactness,
    seismicDuctility: role === 'brace' ? 'brace-ductility-review' : 'standard-member-review',
    formulaId: 'KDS-ST-SECTION-CLASS-V1',
  };
}
