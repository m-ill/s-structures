import {
  MEMBER_RELEASE_VERSION as RV,
  memberReleaseDofs,
  memberReleaseState,
  memberRotationalSpringEntries,
} from './memberReleaseContract.js';

export const MEMBER_RELEASE_SUMMARY_VERSION = 'p10-m3-member-release-summary-v2';

export function buildMemberReleaseSummary(model) {
  const counts = { rigid: 0, pin: 0, unsupported: 0 };
  const springCounts = { total: 0, finite: 0, explicitZero: 0 };
  const members = (model?.members || []).map((member) => row(member, counts, springCounts));
  return {
    version: MEMBER_RELEASE_SUMMARY_VERSION,
    releaseVersion: RV,
    memberCount: members.length,
    releasedMemberCount: members.filter((item) => item.released).length,
    partialFixityMemberCount: members.filter((item) => item.partialFixity.enabled).length,
    explicitZeroSpringMemberCount: members.filter((item) => item.partialFixity.explicitZero).length,
    connectionModifiedMemberCount: members.filter((item) => item.connectionModified).length,
    counts,
    springCounts,
    members,
  };
}

function row(member, counts, springCounts) {
  const releases = memberReleaseState(member);
  const springEntries = memberRotationalSpringEntries(member);
  const explicitZero = springEntries.some((entry) => entry.stiffness === 0);
  springCounts.total += springEntries.length;
  springCounts.explicitZero += springEntries.filter((entry) => entry.stiffness === 0).length;
  springCounts.finite += springEntries.filter((entry) => entry.stiffness > 0).length;
  Object.values(releases).forEach((value) => {
    counts[value === 'pin' ? 'pin' : value === 'rigid' ? 'rigid' : 'unsupported'] += 1;
  });
  const released = releases.i === 'pin' || releases.j === 'pin';
  return {
    id: member.id || null,
    releases,
    releaseDofs: memberReleaseDofs(member),
    released,
    partialFixity: {
      enabled: springEntries.length > 0,
      explicitZero,
      entries: springEntries,
    },
    connectionModified: released || springEntries.length > 0,
  };
}
