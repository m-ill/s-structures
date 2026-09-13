// Coordinates are measured from the bottom of the declared joint panel, in metres.
export function jointHoopDistribution(joint){
 const height=joint.jointPanelHeight,start=joint.jointFirstStart,offsetEnd=joint.jointFirstEnd,spacing=joint.reinforcement?.spacing;
 const base={count:null,positions:null,units:{length:'m'},fabricationApproved:false};
 if(![height,spacing].every(x=>Number.isFinite(x)&&x>0)||![start,offsetEnd].every(x=>Number.isFinite(x)&&x>=0))return {...base,status:'NOT_CHECKED',reason:'JOINT_PANEL_AND_HOOP_END_OFFSETS_REQUIRED'};
 const end=height-offsetEnd;
 if(end<start||start>height)return {...base,status:'NG',reason:'JOINT_HOOP_OFFSETS_OUTSIDE_PANEL'};
 const count=Math.ceil(Math.max(0,end-start-1e-10)/spacing)+1;
 if(!Number.isSafeInteger(count)||count<1)return {...base,status:'NOT_CHECKED',reason:'JOINT_HOOP_COUNT_RANGE'};
 const common={...base,count,height,start,end,spacing};
 if(count>200)return {...common,status:'NOT_CHECKED',reason:'JOINT_HOOP_POSITION_LIMIT'};
 return {...common,status:'OK',reason:null,positions:Array.from({length:count},(_,i)=>Math.min(end,start+i*spacing))};
}
