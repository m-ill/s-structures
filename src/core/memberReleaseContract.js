export const MEMBER_RELEASE_VERSION = 'p2-t09-member-release';
export const MEMBER_RELEASE_ENDS = ['i', 'j'];
export const MEMBER_RELEASE_TYPES = ['rigid', 'pin'];

export function memberReleaseState(member = {}) {
  const releases = member.releases || {};
  return {
    i: releases.i || member.rel1 || 'rigid',
    j: releases.j || member.rel2 || 'rigid',
  };
}

export function normalizeMemberReleases(value = {}) {
  return {
    i: normalizeReleaseType(value.i),
    j: normalizeReleaseType(value.j),
  };
}

export function memberReleaseDofs(member) {
  const releases = memberReleaseState(member);
  const dofs = [];
  if (releases.i === 'pin') dofs.push(4, 5);
  if (releases.j === 'pin') dofs.push(10, 11);
  return dofs;
}

function normalizeReleaseType(value) {
  return MEMBER_RELEASE_TYPES.includes(value) ? value : 'rigid';
}
