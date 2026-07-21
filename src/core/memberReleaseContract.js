export const MEMBER_RELEASE_VERSION = 'p10-m3-member-release-v2';
export const MEMBER_RELEASE_ENDS = ['i', 'j'];
export const MEMBER_RELEASE_TYPES = ['rigid', 'pin'];
export const MEMBER_ROTATIONAL_SPRING_KEYS = ['ryI', 'rzI', 'ryJ', 'rzJ'];
export const MEMBER_ROTATIONAL_SPRING_DOFS = Object.freeze({
  ryI: 4,
  rzI: 5,
  ryJ: 10,
  rzJ: 11,
});

export function memberReleaseState(member = {}) {
  const releases = member.releases || {};
  return {
    i: releases.i || member.rel1 || 'rigid',
    j: releases.j || member.rel2 || 'rigid',
  };
}

export function normalizeMemberReleases(value = {}) {
  const normalized = {
    i: normalizeReleaseType(value.i),
    j: normalizeReleaseType(value.j),
  };
  const spring = normalizeRotationalSprings(value.spring);
  if (Object.keys(spring).length) normalized.spring = spring;
  return normalized;
}

export function memberReleaseDofs(member) {
  const releases = memberReleaseState(member);
  const dofs = [];
  if (releases.i === 'pin') dofs.push(4, 5);
  if (releases.j === 'pin') dofs.push(10, 11);
  return dofs;
}

export function memberRotationalSpringState(member = {}) {
  const source = member?.releases?.spring;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  return Object.fromEntries(MEMBER_ROTATIONAL_SPRING_KEYS
    .filter((key) => Object.prototype.hasOwnProperty.call(source, key))
    .map((key) => [key, source[key]]));
}

export function memberRotationalSpringEntries(member = {}) {
  const spring = memberRotationalSpringState(member);
  return MEMBER_ROTATIONAL_SPRING_KEYS
    .filter((key) => Object.prototype.hasOwnProperty.call(spring, key))
    .map((key) => ({
      key,
      dof: MEMBER_ROTATIONAL_SPRING_DOFS[key],
      end: key.endsWith('I') ? 'i' : 'j',
      axis: key.startsWith('ry') ? 'y' : 'z',
      stiffness: Number(spring[key]),
    }));
}

export function memberHasPartialFixity(member = {}) {
  return memberRotationalSpringEntries(member).length > 0;
}

function normalizeReleaseType(value) {
  return MEMBER_RELEASE_TYPES.includes(value) ? value : 'rigid';
}

function normalizeRotationalSprings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(MEMBER_ROTATIONAL_SPRING_KEYS
    .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
    .map((key) => [key, value[key]]));
}
