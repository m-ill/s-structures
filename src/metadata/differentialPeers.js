export function parseDifferentialPeers(rows,selfId){
 if(!Array.isArray(rows)||!rows.length||rows.length>50)throw Error('DIFFERENTIAL_PEERS_REQUIRED');
 const ids=new Set();
 return rows.map(row=>{
  if(typeof row!=='string'||row.length>128)throw Error('DIFFERENTIAL_PEER_REFERENCE_INVALID');
  const match=/^([^@]+)@([1-9][0-9]*)$/.exec(row),version=match?Number(match[2]):NaN;
  if(!match||!match[1].trim()||!Number.isInteger(version)||version>1e6||match[1]===selfId||ids.has(match[1]))throw Error('DIFFERENTIAL_PEER_REFERENCE_INVALID');
  ids.add(match[1]);return {id:match[1],version};
 });
}
