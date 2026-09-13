import {PRACTICAL_INPUT_VERSION,PRACTICAL_RECORD_CHANNEL,practicalCommandFromRecord} from './practicalInputContract.js';
import {stagePracticalDesignInput} from './practicalDesignInputs.js';
import {spliceGeometry} from '../design/rc/spliceGeometry.js';

const channels=['reinforcement','connections','ground','foundations','profiles','splices'];
// Validation shares the write contract without mutating the supplied model.
export function validateStoredDesignDetails(model) {
  const details=model?.designDetails;
  if(details===undefined)return [];
  const errors=[];
  const error=(message,target='designDetails')=>errors.push({code:'DESIGN_DETAIL_INVALID',message,target});
  if(!details||typeof details!=='object'||Array.isArray(details)||details.version!==PRACTICAL_INPUT_VERSION){error('Unsupported design detail contract');return errors;}
  for(const key of Object.keys(details))if(key!=='version'&&!channels.includes(key))error(`Unknown detail collection: ${key}`);
  if(Array.isArray(details.profiles)&&new Set(details.profiles.map(x=>x?.id)).size>1)error('SINGLE_PROJECT_PROFILE_REQUIRED');
  for(const channel of channels) {
    const rows=details[channel];if(rows===undefined)continue;
    if(!Array.isArray(rows)||rows.length>10000){error(`Invalid or oversized ${channel} collection`);continue;}
    const seen=new Set();
    for(const record of rows) {
      const target=`designDetails.${channel}.${record?.id??'?'}@${record?.version??'?'}`;
      try {
        if(!record||record.inputContract!==PRACTICAL_INPUT_VERSION)throw new Error('Record contract missing');
        const key=`${record.id}@${record.version}`;
        if(seen.has(key))throw new Error('Duplicate detail version');seen.add(key);
        const type=Object.keys(PRACTICAL_RECORD_CHANNEL).find(type=>PRACTICAL_RECORD_CHANNEL[type]===channel);
        const command=practicalCommandFromRecord(type,record);
        const staging={...model,designDetails:{...details,[channel]:[]}};
        stagePracticalDesignInput(staging,command,[]);
        if(!sameRecord(record,staging.designDetails[channel][0]))throw new Error('Stored detail differs from canonical geometry, units or derived quantities');
      } catch(e){error(e.code||e.message,target);}
    }
  }
  // Check active references together after the complete input transaction.
  if(Array.isArray(details.splices)){
    const latest=new Map();for(const row of details.splices)if(row&&(!latest.has(row.id)||row.version>latest.get(row.id).version))latest.set(row.id,row);
    for(const row of latest.values()){const geometry=spliceGeometry(model,row);if(geometry.status!=='OK')error(geometry.reason,`designDetails.splices.${row.id}`);}
  }
  // Allow an atomic edit to move a shared boundary without transient overlap.
  if(Array.isArray(details.reinforcement)) {
    const latest=new Map(),members=new Map();
    for(const row of details.reinforcement)if(row&&(!latest.has(row.id)||row.version>latest.get(row.id).version))latest.set(row.id,row);
    for(const row of latest.values()) {
      if(!members.has(row.memberId))members.set(row.memberId,[]);
      members.get(row.memberId).push(row);
    }
    for(const [memberId,rows] of members) {
      rows.sort((a,b)=>a.start-b.start);
      let previous=null;
      for(const row of rows) {
        if(previous&&row.start<previous.end)error(`OVERLAPPING_REINFORCEMENT_REGIONS: ${previous.id}, ${row.id}`,`designDetails.reinforcement.${memberId}`);
        if(!previous||row.end>previous.end)previous=row;
      }
    }
  }
  return errors;
}

function sameRecord(a,b) {
  if(typeof a!==typeof b)return false;
  if(typeof a==='number')return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-12*Math.max(1e-12,Math.abs(b));
  if(a===null||b===null||typeof a!=='object')return a===b;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  const left=Object.keys(a).sort(),right=Object.keys(b).sort();
  return left.length===right.length&&left.every((key,i)=>key===right[i]&&sameRecord(a[key],b[key]));
}
