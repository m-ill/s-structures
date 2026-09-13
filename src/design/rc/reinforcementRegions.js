// Normalized regions own [start,end); the member's final end (1) is included.
// Do not use a tolerance that turns adjacent regions into artificial overlaps.
// Real overlaps remain multiple matches and require explicit resolution.
export function reinforcementRegionsAt(details,at,side='point') {
 if(!Number.isFinite(at)||at<0||at>1)return [];
 if(!['point','left','right'].includes(side)||side==='left'&&at===0||side==='right'&&at===1)return [];
 if(side==='left')return details.filter(d=>Number.isFinite(d.start)&&Number.isFinite(d.end)&&d.start>=0&&d.end<=1&&d.start<d.end&&at>d.start&&at<=d.end);
 return details.filter(d=>Number.isFinite(d.start)&&Number.isFinite(d.end)&&d.start>=0&&d.end<=1&&d.start<d.end&&at>=d.start&&(at<d.end||(at===1&&d.end===1)));
}
