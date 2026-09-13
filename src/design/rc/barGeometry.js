import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function buildBarFabrication(detail,bar,{length,H,interiorStart=false,interiorEnd=false}) {
 const startExtension=detail.startExtension??0,endExtension=detail.endExtension??0;
 if(![startExtension,endExtension].every(x=>Number.isFinite(x)&&x>=0&&x<=5))return {cutLength:null,reason:'BAR_EXTENSION_RANGE',fabricationApproved:false};
 if(startExtension||endExtension){
  const built=buildBarFabrication({...detail,startExtension:0,endExtension:0},bar,{length:length+startExtension+endExtension,H,interiorStart,interiorEnd});
  const shift=points=>points?.map(([x,y])=>[x-startExtension,y]);
  return {...built,...(built.points?{points:shift(built.points)}:{}),...(built.ends?{ends:Object.fromEntries(Object.entries(built.ends).map(([key,end])=>[key,{...end,...(end.bendPoints?{bendPoints:shift(end.bendPoints)}:{})}]))}:{}),extensions:{start:startExtension,end:endExtension},bodyLength:length+startExtension+endExtension};
 }
 if(detail.startFabricationShape===undefined&&detail.endFabricationShape===undefined)return buildOneEnd(detail,bar,{length,H,interiorStart,interiorEnd});
 if(!detail.startFabricationShape||!detail.endFabricationShape)return {cutLength:null,reason:'BOTH_END_SHAPES_REQUIRED',fabricationApproved:false};
 const half=length/2;
 const end=which=>buildOneEnd({...detail,fabricationShape:detail[`${which}FabricationShape`],endSetbackStart:0,endSetbackEnd:which==='start'?detail.endSetbackStart:detail.endSetbackEnd,bendInsideRadius:detail[`${which}BendInsideRadius`],hookTailLength:detail[`${which}HookTailLength`]},bar,{length:half,H,interiorStart:true,interiorEnd:which==='start'?interiorStart:interiorEnd});
 const start=end('start'),finish=end('end');
 if(start.cutLength===null||finish.cutLength===null)return {cutLength:null,reason:'END_GEOMETRY_NOT_SATISFIED',ends:{start,end:finish},fabricationApproved:false};
 const left=start.points.map(([x,y])=>[half-x,y]).reverse(),right=finish.points.map(([x,y])=>[half+x,y]);
 return {shape:`${start.shape}-${finish.shape}`,cutLength:start.cutLength+finish.cutLength,points:[...left,...right.slice(1)],segmentErrors:[...start.segmentErrors].reverse().concat(finish.segmentErrors),ends:{start:{...start,bendPoints:start.points.slice(1).map(([x,y])=>[half-x,y])},end:{...finish,bendPoints:finish.points.slice(1).map(([x,y])=>[half+x,y])}},codeReferences:[...(start.codeReferences||[]),...(finish.codeReferences||[])],fabricationApproved:false,reason:'BOTH_END_CENTERLINE_GEOMETRY; DEVELOPMENT_AND_CONGESTION_REVIEW_SEPARATE'};
}
function buildOneEnd(detail,bar,{length,H,interiorStart=false,interiorEnd=false}) {
 const unavailable=reason=>({cutLength:null,reason,fabricationApproved:false});
 if(!['straight','L90','J180'].includes(detail.fabricationShape))return unavailable('BAR_SHAPE_NOT_DEFINED');
 const db=bar.diameter,start=detail.endSetbackStart,end=detail.endSetbackEnd;
 if(![db,start,end,length,H,detail.cover].every(Number.isFinite)||db<=0||start<(interiorStart?0:detail.cover)||end<(interiorEnd?0:detail.cover)||start+end>=length)return unavailable('BAR_END_GEOMETRY_REQUIRED');
 const codeReferences=getKcscRuleSources(['142050']).map(x=>({...x,clause:'4.1.1(1); 4.1.2 Table 4.1-1'}));
 if(detail.fabricationShape==='straight')return {cutLength:length-start-end,points:[[start,bar.y],[length-end,bar.y]],segmentErrors:[0],shape:'straight',codeReferences:[],fabricationApproved:false,reason:'GEOMETRIC_LENGTH_ONLY; END_DEVELOPMENT_REVIEW_SEPARATE'};
 const inside=detail.bendInsideRadius,tail=detail.hookTailLength,minRadius=db*(db<=0.0254+1e-10?3:db<=0.035?4:5),minTail=detail.fabricationShape==='L90'?12*db:Math.max(4*db,0.06);
 // Metre-valued decimal input and db*multiplier may differ by a few ULPs.
 // This is arithmetic tolerance (1e-12 m), not fabrication tolerance.
 if(![inside,tail].every(Number.isFinite)||inside<minRadius-1e-12||tail<minTail-1e-12)return {...unavailable('KDS_MINIMUM_BEND_OR_TAIL_NOT_SATISFIED'),codeReferences,minRadius,minTail};
 const R=inside+db/2,sign=bar.y>=0?-1:1,angle=detail.fabricationShape==='L90'?Math.PI/2:Math.PI,tangent=length-end-db/2-R;
 const travel=detail.fabricationShape==='L90'?R+tail:2*R;
 if(tangent<=start||Math.abs(bar.y+sign*travel)+db/2>H/2-detail.cover||detail.fabricationShape==='J180'&&tangent-tail<start)return {...unavailable('HOOK_OUTSIDE_DEFINED_MEMBER_REGION'),codeReferences};
 const points=[[start,bar.y],[tangent,bar.y]],steps=24;
 for(let i=1;i<=steps;i++){const t=-Math.PI/2+angle*i/steps;points.push([tangent+R*Math.cos(t),bar.y+sign*(R+R*Math.sin(t))]);}
 const last=points.at(-1);points.push(detail.fabricationShape==='L90'?[last[0],last[1]+sign*tail]:[last[0]-tail,last[1]]);
 return {cutLength:tangent-start+angle*R+tail,points,segmentErrors:[0,...Array(steps).fill(R*(1-Math.cos(angle/steps/2))),0],shape:detail.fabricationShape,insideRadius:inside,centerlineRadius:R,tail,codeReferences,fabricationApproved:false,reason:'CENTERLINE_GEOMETRY_ONLY; JOINT_CONGESTION_AND_END_DEVELOPMENT_REVIEW_SEPARATE'};
}
