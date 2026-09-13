import { STANDARD_REBARS } from '../rcDetailing.js';
import {tensionDevelopment,tensionLap} from './kdsAnchorage.js';

export const RC_REBAR_DETAIL_VERSION = 'p24-kds-anchorage-compat-v2';

export function rebarById(id = 'D19') {
  return STANDARD_REBARS.find((bar) => bar.id === id) || STANDARD_REBARS[3];
}

// Compatibility API: dimensions remain mm, but unknown conditions no longer
// produce a fabricated length. Both routes use the same source-bound formula.
function anchorageInput(barId,material,options) {
  const bar=STANDARD_REBARS.find(x=>x.id===barId);
  if(!bar||options.locationFactor!==undefined)return null;
  return {...options,db:bar.diameter,fy:options.fy??material.fy??material.Fy,
    fck:options.fc??material.fc??material.fck,sizeFactor:bar.diameter<=19.1?0.8:1};
}
function legacyResult(barId,calculation) {
  return {...calculation,version:RC_REBAR_DETAIL_VERSION,bar:barId,
    length:calculation.status==='CALCULATED'?Math.ceil(calculation.requiredMm):null,
    unit:'mm',formulaId:'KDS-142052-2024-CLAUSE-SCOPED',designTransferAllowed:false};
}
export function developmentLength(barId, material = {}, options = {}) {
  const input=anchorageInput(barId,material,options);
  return legacyResult(barId,input?tensionDevelopment(input):{status:'NOT_CHECKED',reason:'BAR_AND_EXPLICIT_ANCHORAGE_CONDITIONS_REQUIRED'});
}
export function lapSpliceLength(barId, material = {}, options = {}) {
  const input=anchorageInput(barId,material,options);
  return legacyResult(barId,input?tensionLap(input):{status:'NOT_CHECKED',reason:'BAR_AND_EXPLICIT_SPLICE_CONDITIONS_REQUIRED'});
}

export function spacingCheck(schedule = {}, widthMm = 300, options = {}) {
  const bar = rebarById(schedule.bar);
  const count = Math.max(1, Number(schedule.count) || 1);
  const cover = finite(options.coverMm, 40);
  const clear = count > 1 ? (widthMm - cover * 2 - count * bar.diameter) / (count - 1) : widthMm - cover * 2 - bar.diameter;
  const minClear = Math.max(25, bar.diameter);
  return {
    version: RC_REBAR_DETAIL_VERSION,
    clearSpacing: Math.round(clear),
    minClearSpacing: Math.round(minClear),
    status: clear >= minClear ? 'OK' : 'WARN',
    formulaId: 'KDS-RC-BAR-SPACING-V1',
  };
}

function finite(...values) {
  for (const value of values) if (Number.isFinite(Number(value))) return Number(value);
  return 0;
}
