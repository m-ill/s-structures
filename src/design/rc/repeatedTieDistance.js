// stirrupDistribution describes an arithmetic progression with its last point
// possibly shortened to the explicit end position. Never expand that sequence.
export function repeatedTieDistance(d,a,b){
 const nc=()=>({status:'NOT_CHECKED',reason:'REPEATED_TIE_DISTRIBUTION_INVALID',distance:null});
 if(d?.status!=='OK'||!d.explicitEnds||!Number.isSafeInteger(d.count)||d.count<1||![d.first,d.last,d.spacing,a,b].every(Number.isFinite)||d.spacing<=0)return nc();
 const {count,first,last,spacing}=d,regular=count-1;
 if(count===1){if(last!==first)return nc();return {status:'OK',distance:Math.abs(a-b),indices:[0,0],minimumRepeatDistance:null,method:'arithmetic-sequence-and-final-point'};}
 const beforeLast=first+(count-2)*spacing,gap=last-beforeLast;
 if(!Number.isFinite(beforeLast)||gap<0||gap>spacing+1e-9)return nc();
 let distance=Infinity,indices;
 const consider=(i,j,delta)=>{const v=Math.abs(delta);if(v<distance){distance=v;indices=[i,j];}};
 const delta=a-b,clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(v)));
 // Differences of two regular stations are integer multiples of spacing.
 const k=clamp(-delta/spacing,-(regular-1),regular-1);
 consider(Math.max(k,0),Math.max(-k,0),k*spacing+delta);
 // Either, or both, of the two stations can be the shortened final one.
 const j=clamp((last-first+delta)/spacing,0,regular-1);
 consider(count-1,j,last-first-j*spacing+delta);
 const i=clamp((last-first-delta)/spacing,0,regular-1);
 consider(i,count-1,first+i*spacing-last+delta);
 consider(count-1,count-1,delta);
 return {status:'OK',distance,indices,minimumRepeatDistance:count===2?gap:Math.min(spacing,gap),method:'arithmetic-sequence-and-final-point'};
}
