import { resultEntries } from './resultUtils.js';
import { MEMBER_FORCE_KEYS, updateMemberPeaks } from './memberPeak.js';
import { memberStationSummary } from './memberStationSummary.js';
import { memberStationValue } from './memberStationValue.js';

export function buildMemberStationForceRows(model, analysis) {
  return (model?.members || []).map((member) => {
    const stations = [];
    const peaks = {};
    for (const [comboId, result] of resultEntries(analysis)) {
      const memberResult = result.memberResults?.[member.id];
      if (!memberResult) continue;
      for (let i = 0; i < (memberResult.xs || []).length; i += 1) {
        stations.push(memberStationValue(comboId, memberResult, i));
      }
      for (const key of MEMBER_FORCE_KEYS) updateMemberPeaks(peaks, comboId, memberResult, key);
    }
    return memberStationSummary(member, stations, peaks);
  }).filter((row) => row.stationCount);
}
