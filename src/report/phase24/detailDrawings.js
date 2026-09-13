import {continuousBarQuantities} from './continuousBarQuantities.js';
import {appendContinuousBarPages} from './continuousBarPages.js';
import {wrapReportText} from './wrapReportText.js';
import {appendSpliceCheckPages} from './spliceCheckPages.js';
import {selectReportSource} from './drawingSnapshot.js';
import {createPageWindow} from './pageWindow.js';
import {appendRecordedCalculationPages} from './recordedCalculationPages.js';
import {stableHash} from '../../core/stableHash.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {latestDetails} from '../../design/evaluation/practicalEvaluation.js';
import {prepareDetailGeometry,requirePreparedDetailGeometry} from '../../design/rc/preparedDetailGeometry.js';
export const DETAIL_DRAWING_VERSION='p25-detail-drawing-v46-through-bar-pdf';
const text=(page,x,y,value,size=10)=>page.commands.push({kind:'text',x,y,text:String(value),size});
const line=(page,x1,y1,x2,y2)=>page.commands.push({kind:'line',x1,y1,x2,y2});
const rect=(page,x,y,w,h)=>page.commands.push({kind:'rect',x,y,w,h});
const circle=(page,x,y,r)=>page.commands.push({kind:'circle',x,y,r});
const mm=x=>Math.round(x*1000);
function createDrawingPage(title,snapshot,detail) {
 const p={width:595.28,height:841.89,commands:[],detailId:detail.id,detailVersion:detail.version};
 text(p,35,42,title,18);text(p,35,66,'검토용 - 시공 및 최종 설계 승인용 아님',11);
 text(p,35,88,`상세: ${detail.id.slice(0,40)} @${detail.version}`,10);
 text(p,35,106,`입력: ${snapshot.inputHash.slice(0,32)}`,8);
 text(p,35,124,`평가: ${snapshot.id.slice(0,60)}`,8);
 line(p,35,138,560,138);line(p,35,787,560,787);
 text(p,35,804,'KDS 규칙·정착·이음·구속 및 누락 검토는 별도 확인 필요',9);
 return p;
}
function notes(p,rows,start=665) {
 const unique=[...new Set(rows.filter(x=>!['OK','N_A'].includes(x.status)).map(x=>`${x.checkId}: ${x.reason||x.status}`))];
 for(const [i,s] of unique.slice(0,5).entries())text(p,35,start+i*17,s.slice(0,85),8);
 if(unique.length>5)text(p,35,start+85,`추가 미완료 항목 ${unique.length-5}건: 뒤쪽 검사별 계산서 참조`,8);
}
// maxPages is the whole-document ceiling counted by pageWindow, not the PDF
// volume size; vectorPdf and pdfVolumeBundle own the 60-page volume contract.
// The default matches what every product caller already passes (ADR-001).
export function buildDetailDrawings(snapshot,{maxPages=600,pageOffset=0,pageLimit=maxPages,checkRetention='copy'}={}) {
 if(snapshot.designComparisonDetails)snapshot={...snapshot,designComparison:snapshot.designComparisonDetails};
 if(!['copy','reference','omit'].includes(checkRetention))throw Error('DRAWING_CHECK_RETENTION_INVALID');
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>600)throw Error('DRAWING_PAGE_BUDGET_INVALID');
 const {model}=snapshot,pages=createPageWindow({offset:pageOffset,limit:pageLimit,maxPages}),quantities=[],spliceGeometryIssues=[];
 const page=(...args)=>{const p=createDrawingPage(...args);if(!pages.willRetainNext())p.commands={push(){}};return p;};
 const prepared=snapshot.preparedDetails?requirePreparedDetailGeometry(model,snapshot.preparedDetails):prepareDetailGeometry(model);
 for(const detail of latestDetails(model,'reinforcement')) {
  const member=model.members.find(x=>x.id===detail.memberId),section=resolveSectionRecord(model,member?.secId);
  if(!member||!['RECT','SQUARE'].includes(section?.shape))throw new Error('DRAWING_SECTION_UNSUPPORTED');
  const a=model.nodes.find(x=>x.id===member.n1),b=model.nodes.find(x=>x.id===member.n2),length=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)*(detail.end-detail.start);
  const B=section.params.B/1000,H=(section.params.H||section.params.B)/1000,scale=Math.min(190/B,245/H);
  const p=page(`부재 ${member.id.slice(0,24)} 배근 검토도`,snapshot,detail),left=55,top=182;
  rect(p,left,top,B*scale,H*scale);text(p,left,164,`단면 ${mm(B)} x ${mm(H)} mm`,11);
  const outerHoop=prepared.reinforcement[`${detail.id}@${detail.version}`].outerHoop;
  const transverseQuantity=prepared.reinforcement[`${detail.id}@${detail.version}`].transverseQuantity;
  const hoopPoints=outerHoop?.closureGeometry?.path?.status==='OK'?outerHoop.closureGeometry.path.points.map(p=>[p[1],p[2]]):outerHoop?.points;
  if(outerHoop?.status==='OK')for(let j=1;j<hoopPoints.length;j++){
   const [a,b]=[hoopPoints[j-1],hoopPoints[j]];
   line(p,left+(a[1]+B/2)*scale,top+(H/2-a[0])*scale,left+(b[1]+B/2)*scale,top+(H/2-b[0])*scale);
  }
  else if(detail.stirrups)text(p,left,top+H*scale+15,'띠철근 굽힘 형상 미확정',8);
  if(outerHoop?.closureGeometry)text(p,left,top+H*scale+28,`폐합 후크 형상 ${outerHoop.closureGeometry.status} / 조립 ${outerHoop.closureGeometry.assemblyStatus}`,8);
  const extensionStart=detail.startExtension||0,plotLength=length+extensionStart+(detail.endExtension||0);
  const elevationX=310,elevationY=200,elevationWidth=230,elevationHeight=130;
  rect(p,elevationX,elevationY,elevationWidth,elevationHeight);text(p,elevationX,180,`배근 구간 길이 ${mm(length)} mm`,10);
  for(const [i,bar] of detail.bars.entries()) {
   const mark=`B${i+1}`,x=left+(bar.z+B/2)*scale,y=top+(H/2-bar.y)*scale;
   circle(p,x,y,Math.max(2,bar.diameter*scale/2));if(detail.bars.length<=12)text(p,x+5,y-5,mark,8);
   const fabrication=prepared.reinforcement[`${detail.id}@${detail.version}`].bars[i];
   const massQuantity=prepared.reinforcement[`${detail.id}@${detail.version}`].longitudinalQuantity?.rows[i]?.massQuantity;
   if(fabrication.splicePath?.status==='OK'){for(const piece of fabrication.splicePath.pieces)for(let j=1;j<piece.points.length;j++){const a=piece.points[j-1],b=piece.points[j];line(p,elevationX+(a[0]+extensionStart)/plotLength*elevationWidth,elevationY+(H/2-a[1])/H*elevationHeight,elevationX+(b[0]+extensionStart)/plotLength*elevationWidth,elevationY+(H/2-b[1])/H*elevationHeight);}}
   else if(fabrication.points)for(let j=1;j<fabrication.points.length;j++){const a=fabrication.points[j-1],b=fabrication.points[j];line(p,elevationX+(a[0]+extensionStart)/plotLength*elevationWidth,elevationY+(H/2-a[1])/H*elevationHeight,elevationX+(b[0]+extensionStart)/plotLength*elevationWidth,elevationY+(H/2-b[1])/H*elevationHeight);}
   else {const yy=elevationY+(H/2-bar.y)/H*elevationHeight;line(p,elevationX,yy,elevationX+elevationWidth,yy);}
   quantities.push({geometricQuantity:prepared.reinforcement[`${detail.id}@${detail.version}`].longitudinalQuantity?.rows[i]||null,detailId:detail.id,version:detail.version,memberId:member.id,mark,kind:'longitudinal',diameter:bar.diameter,area:bar.area,areaBasis:detail.areaBasis,designation:bar.designation||null,productCatalogId:detail.barCatalogId||null,unitMassKgPerM:bar.unitMassKgPerM??null,massQuantity,pieceMassKg:massQuantity?.pieceMassKg??null,totalMassKg:massQuantity?.totalMassKg??null,productReference:detail.barProductReference||null,productEdition:detail.barProductEdition||null,productVerification:detail.barCatalogId?'manufacturer-table-not-certificate':detail.areaBasis==='specified-nominal'?'user-specified-not-independently-qualified':'geometric-diameter',count:1,bodyLength:length,bodyVolume: fabrication.bodyVolume,...fabrication});
  }
  text(p,elevationX,353,`피복 ${mm(detail.cover)} mm`,10);
  if(prepared.reinforcement[`${detail.id}@${detail.version}`].bars.some(b=>b.physicalBarId))text(p,elevationX,368,'관통 철근 구간 · 전체 길이는 통합 수량표 참조',7);
  if(extensionStart||detail.endExtension)text(p,elevationX,415,`정착 연장 시작 ${mm(extensionStart)} / 끝 ${mm(detail.endExtension||0)} mm`,9);
  if(detail.stirrups) {
   const s=detail.stirrups,count=prepared.reinforcement[`${detail.id}@${detail.version}`].stirrupCount;
   const positions=prepared.reinforcement[`${detail.id}@${detail.version}`].stirrupPositions;
   const distribution=prepared.reinforcement[`${detail.id}@${detail.version}`].stirrupDistribution;
   const shown=count>200?[0,1,2,count-3,count-2,count-1].map(i=>Math.min(distribution.first+i*distribution.spacing,distribution.last)):positions;
   if(count>200)text(p,elevationX,342,`반복 중간 생략: 전체 ${count}개`,8);
   if(shown)for(const pos of shown)line(p,elevationX+(pos+extensionStart)/plotLength*elevationWidth,elevationY+8,elevationX+(pos+extensionStart)/plotLength*elevationWidth,elevationY+elevationHeight-8);
   text(p,elevationX,374,`스터럽 ${s.legs}다리 ${mm(s.diameter)} @${mm(s.spacing)}`,10);
   text(p,elevationX,393,`제공 단부 위치 기준 ${count??'미정'}개 / ${transverseQuantity?.status==='OK'?'공간 후크 기하 확정':'후크 기하 미확정'}`,9);
   if(transverseQuantity?.status==='OK')text(p,elevationX,413,`횡철근 기하 총길이 ${transverseQuantity.totalLength.toFixed(3)} m (제작 미승인)`,8);
   quantities.push({geometricQuantity:transverseQuantity?.rows.find(r=>r.kind==='stirrup')||null,fabricationApproved:false,detailId:detail.id,version:detail.version,mark:'S1',kind:'stirrup',diameter:s.diameter,area:s.area??Math.PI*s.diameter**2/4,areaBasis:detail.stirrupAreaBasis||'geometric-diameter',productReference:detail.stirrupProductReference||null,productEdition:detail.stirrupProductEdition||null,count,positions,distribution:{count,first:distribution.first,last:distribution.last,spacing:distribution.spacing,explicitEnds:distribution.explicitEnds},spacing:s.spacing,perimeterGeometry:outerHoop,...(outerHoop?.closureGeometry?{closureGeometry:outerHoop.closureGeometry,geometricCutLength:outerHoop.closureGeometry.geometricCutLength}:{}),cutLength:null,reason:outerHoop?.reason||'BEND_RADIUS_HOOK_AND_END_OFFSET_RULE_REQUIRED'});
  }
  const crossTies=prepared.reinforcement[`${detail.id}@${detail.version}`].crossTies;
  if(crossTies){
   text(p,310,438,`크로스타이 형상 ${crossTies.status} / 간섭 ${crossTies.assemblyStatus}`,8);
   const distribution=prepared.reinforcement[`${detail.id}@${detail.version}`].stirrupDistribution;
   for(const piece of crossTies.pieces){
    for(let j=1;j<piece.points.length;j++){const a=piece.points[j-1],b=piece.points[j];line(p,left+(a[1]+B/2)*scale,top+(H/2-a[0])*scale,left+(b[1]+B/2)*scale,top+(H/2-b[0])*scale);}
    const first=distribution?.first+piece.planeOffset,last=distribution?.last+piece.planeOffset,inRegion=Number.isFinite(first)&&Number.isFinite(last)&&first>=piece.diameter/2&&last<=length-piece.diameter/2;
    quantities.push({detailId:detail.id,version:detail.version,memberId:member.id,kind:'cross-tie',...piece,geometricQuantity:transverseQuantity?.rows.find(r=>r.mark===piece.mark)||null,count:inRegion?distribution.count:null,first:inRegion?first:null,last:inRegion?last:null,spacing:detail.stirrups.spacing,codeReferences:crossTies.codeReferences,assemblyStatus:crossTies.assemblyStatus,reason:inRegion?crossTies.assemblyReason:'CROSS_TIE_AXIAL_EXTENT_REQUIRED'});
   }
  }
  text(p,35,468,'철근 일람 - 형상 길이 / 제작 승인 및 정착 검토 별도',11);
  for(const [i,bar] of detail.bars.slice(0,8).entries()){const q=quantities.find(x=>x.detailId===detail.id&&x.mark===`B${i+1}`);text(p,45,495+i*18,`B${i+1}   직경 ${mm(bar.diameter)}   ${q?.physicalBarId?'분할 구간':'1개'}   본체 ${mm(q?.bodyLength??length)} mm   ${q?.pieceCount?`조각 ${q.pieceCount}개 · 총 ${mm(q.totalCutLength)} mm`:q?.cutLength!=null?`형상 길이 ${mm(q.cutLength)} mm`:'절단 길이 미확정'}`,9);}
  if(detail.bars.length>8)text(p,45,643,`추가 ${detail.bars.length-8}개: 뒤쪽 철근 전수 일람 참조`,9);
  notes(p,snapshot.checks.filter(x=>x.entityId===member.id));pages.push(p);
 }
 for(const footing of latestDetails(model,'foundations')) for(const face of (footing.reinforcement?.topB?['bottom','top']:['bottom'])) {
  const p=page(`기초 ${footing.id.slice(0,24)} ${face==='top'?'상부':'하부'} 배근 검토도`,snapshot,footing),scale=Math.min(225/footing.B,245/footing.L),x=48,y=175;
  rect(p,x,y,footing.B*scale,footing.L*scale);text(p,x,160,`평면 ${mm(footing.B)} x ${mm(footing.L)} mm`,11);
  const rb=footing.reinforcement;
  if(rb)for(const [axis,span,width,bar] of [['B',footing.B,footing.L,rb[`${face}B`]],['L',footing.L,footing.B,rb[`${face}L`]]]) {
   const layer=prepared.foundations[`${footing.id}@${footing.version}`][`${face}${axis}`],count=layer.count;if(layer.status!=='OK')throw new Error(layer.reason||'FOOTING_BAR_LAYOUT_REQUIRED');if(count>200)throw new Error('DRAWING_BAR_LIMIT');
   for(let i=0;i<count;i++){const pos=layer.positions[i];if(axis==='B')line(p,x+footing.cover*scale,y+pos*scale,x+(span-footing.cover)*scale,y+pos*scale);else line(p,x+pos*scale,y+footing.cover*scale,x+pos*scale,y+(span-footing.cover)*scale);}
   quantities.push({detailId:footing.id,version:footing.version,mark:face==='bottom'?`F-${axis}`:`F-top-${axis}`,face,kind:'foundation-bar',diameter:bar.diameter,area:bar.area??Math.PI*bar.diameter**2/4,designation:bar.designation||null,productCatalogId:footing.barCatalogId||null,unitMassKgPerM:bar.unitMassKgPerM??null,massQuantity:layer.massQuantity,pieceMassKg:layer.massQuantity?.pieceMassKg??null,totalMassKg:layer.massQuantity?.totalMassKg??null,count,bodyLength:layer.bodyLength,cutLength:layer.cutLength,fabricationApproved:false,reason:footing.barShape==='straight'?'STRAIGHT_GEOMETRY_ONLY; DEVELOPMENT_REVIEW_SEPARATE':'BAR_SHAPE_AND_END_ANCHORAGE_RULE_REQUIRED'});
  }
  const columnBars=prepared.foundations[`${footing.id}@${footing.version}`].columnBars||[];
  const sx=315,sy=230,sw=230,sh=Math.min(160,footing.thickness/footing.B*sw,columnBars.length?70*footing.thickness/Math.max(...columnBars.map(b=>b.above)):Infinity);rect(p,sx,sy,sw,sh);
  if(rb){const c=footing.cover/footing.B*sw,verticalScale=sh/footing.thickness,bB=rb[`${face}B`],bL=rb[`${face}L`],ordinate=depth=>face==='top'?sy+depth*verticalScale:sy+sh-depth*verticalScale;const yB=ordinate(footing.cover+bB.diameter/2),yL=ordinate(footing.cover+bB.diameter+bL.diameter/2);line(p,sx+c,yB,sx+sw-c,yB);line(p,sx+c,yL,sx+sw-c,yL);}
  if(face==='bottom')for(const [i,bar] of columnBars.entries()){
   if(![bar.above,bar.below].every(x=>Number.isFinite(x)&&x>0))continue;
   circle(p,x+(bar.x+footing.B/2)*scale,y+(bar.y+footing.L/2)*scale,Math.max(2,bar.diameter*scale/2));
   const xx=sx+(bar.x/footing.B+.5)*sw,v=sh/footing.thickness;line(p,xx,sy-bar.above*v,xx,sy+bar.below*v);
   quantities.push({detailId:footing.id,version:footing.version,mark:`C${i+1}`,kind:'column-bar-extension',massQuantity:bar.massQuantity,designation:bar.designation,productReference:bar.productReference,memberId:bar.memberId,memberMark:bar.memberMark,diameter:bar.diameter,area:bar.area,count:1,bodyLength:bar.below,bodyVolume:bar.additionalBodyVolume,cutLength:null,continuousAboveLength:bar.above,aboveLengthIncludedInMember:true,fabricationApproved:false,reason:'CONTINUOUS_BAR_EXTENSION_ONLY; FULL_FABRICATION_LENGTH_REQUIRES_MEMBER_GEOMETRY'});
  }
  if(footing.columnWidth&&footing.columnDepth)rect(p,x+((footing.B-footing.columnWidth)/2+(footing.columnOffsetX??0))*scale,y+((footing.L-footing.columnDepth)/2+(footing.columnOffsetY??0))*scale,footing.columnWidth*scale,footing.columnDepth*scale);
  if(columnBars.length)text(p,sx,sy+sh+42,`기둥 연속 주근 ${columnBars.length}개 / 매입 ${mm(columnBars[0].below)} mm`,9);
  if(footing.columnOffsetX||footing.columnOffsetY)text(p,x,145,`기둥 편심 X ${mm(footing.columnOffsetX??0)} / Y ${mm(footing.columnOffsetY??0)} mm`,9);
  text(p,sx,columnBars.length?sy+sh+23:200,`두께 ${mm(footing.thickness)} / 피복 ${mm(footing.cover)} mm`,10);
  const punching=prepared.foundations[`${footing.id}@${footing.version}`].punchingPerimeter;
  if(punching?.ok){for(const segment of punching.segments)line(p,x+(segment.a[0]+footing.B/2)*scale,y+(segment.a[1]+footing.L/2)*scale,x+(segment.b[0]+footing.B/2)*scale,y+(segment.b[1]+footing.L/2)*scale);text(p,35,449,`펀칭 위험둘레 ${punching.columnPosition} / ${mm(punching.length)} mm / 최소 후보 1/${punching.equivalent.length}`,9);}
  text(p,35,470,`반력 자중 범위: ${footing.reactionBasis||'미확정'}`,10);
  text(p,35,491,`지반 참조: ${footing.groundId}`,10);
  notes(p,snapshot.checks.filter(x=>x.entityId===`foundation:${footing.nodeId}`),535);pages.push(p);
 }
 for(const splice of latestDetails(model,'splices')) {
  const geometry=prepared.splices?.[`${splice.id}@${splice.version}`];
  if(geometry?.status==='NOT_CHECKED'){
   const issue={detailId:splice.id,version:splice.version,memberId:splice.memberId,status:geometry.status,reason:geometry.reason||'SPLICE_GEOMETRY_NOT_CHECKED'};spliceGeometryIssues.push(issue);
   const p=page('겹침이음 형상 미검토',snapshot,splice);let y=170;
   const lines=[`부재: ${splice.memberId}`,`배근 참조: ${splice.reinforcementId}`,`대상 번호: ${(splice.barIndices||[]).join(', ')||'미기록'}`,`미검토 사유: ${issue.reason}`,'이 이음의 검증된 형상을 만들지 못했습니다. 형상도와 추가 철근량을 생성하지 않았습니다.','입력과 배근 참조를 보완한 후 다시 해석·검토해야 합니다. 다른 상세의 결과는 뒤쪽 자료에 보존됩니다.'];
   for(const value of lines){for(const part of wrapReportText([value])){text(p,35,y,part,8);y+=15;}y+=8;}
   notes(p,snapshot.checks.filter(x=>x.entityId===splice.memberId&&x.checkId==='rc-splices'),Math.max(400,y+20));pages.push(p);continue;
  }
  if(geometry?.status!=='OK')throw new Error('PREPARED_SPLICE_GEOMETRY_REQUIRED');
  const p=page(`겹침이음 ${splice.id.slice(0,24)} 검토도`,snapshot,splice),scale=440/geometry.memberLength;
  text(p,45,170,`부재 ${splice.memberId.slice(0,30)} / 대상 ${geometry.bars.length}개: 뒤쪽 철근 일람 참조`,11);
  line(p,45,220,485,220);line(p,45+geometry.startX*scale,234,45+geometry.endX*scale,234);
  line(p,45+geometry.startX*scale,204,45+geometry.startX*scale,246);line(p,45+geometry.endX*scale,204,45+geometry.endX*scale,246);
  text(p,45,270,`겹침 ${mm(geometry.length)} mm / 시작 ${mm(geometry.startX)} / 끝 ${mm(geometry.endX)} mm`,11);
  text(p,45,293,`추가 철근 위치 이동 y=${mm(splice.offsetY)}, z=${mm(splice.offsetZ)} mm`,10);
  text(p,45,325,'겹침 참고량: 주근 조각 물량에 포함된 경우 중복 합산 제외.',10);
  for(const bar of geometry.bars)quantities.push({detailId:splice.id,version:splice.version,mark:`SP-${bar.originalIndex+1}`,kind:'lap-additional-bar',quantityRole:prepared.reinforcement[`${geometry.detailId}@${geometry.detailVersion}`]?.longitudinalQuantity?.rows[bar.originalIndex]?.includesLapOverlap?'included-in-longitudinal-pieces':'additional-lap-proxy-only',memberId:splice.memberId,diameter:bar.diameter,area:bar.area,count:1,bodyLength:geometry.length,bodyVolume:bar.area*geometry.length,cutLength:null,fabricationApproved:false,reason:'ADDITIONAL_LAP_LENGTH_ONLY; PIECE_CUT_SCHEDULE_REQUIRED'});
  notes(p,snapshot.checks.filter(x=>x.entityId===splice.memberId&&x.checkId==='rc-splices'),380);pages.push(p);
  const reinforcement=latestDetails(model,'reinforcement').find(d=>d.id===geometry.detailId&&d.version===geometry.detailVersion);
  for(let start=0;start<geometry.bars.length;start+=24){
   const schedule=page(`겹침이음 철근 일람 ${Math.floor(start/24)+1}/${Math.ceil(geometry.bars.length/24)}`,snapshot,splice);
   text(schedule,35,164,`대상 ${start+1}-${Math.min(start+24,geometry.bars.length)} / ${geometry.bars.length}개 · 단위 mm`,11);
   text(schedule,35,185,`이음 구간 ${mm(geometry.startX)}-${mm(geometry.endX)} / 길이 ${mm(geometry.length)} mm`,10);
   text(schedule,35,204,'원래 좌표와 이음 철근 좌표는 부재 로컬 y, z 기준입니다.',9);
   const columns=[35,135,215,300,385,470];
   ['철근 번호','직경','원래 y','원래 z','이음 y','이음 z'].forEach((label,i)=>text(schedule,columns[i],232,label,10));
   line(schedule,35,241,560,241);
   for(const [i,bar] of geometry.bars.slice(start,start+24).entries()){
    const prior=reinforcement?.bars[bar.originalIndex],values=[`SP-B${bar.originalIndex+1}`,(bar.diameter*1000).toFixed(1),prior?(prior.y*1000).toFixed(1):'-',prior?(prior.z*1000).toFixed(1):'-',(bar.y*1000).toFixed(1),(bar.z*1000).toFixed(1)],y=260+i*20;
    values.forEach((value,k)=>text(schedule,columns[k],y,value,9));line(schedule,35,y+6,560,y+6);
   }
   text(schedule,35,760,'전체 대상 번호 일람입니다. 정착·이음 내력 판정은 뒤쪽 계산서를 확인하세요.',9);
   pages.push(schedule);
  }

 }
 for(const splice of latestDetails(model,'splices'))appendSpliceCheckPages({snapshot,splice,pages,page,text,line});
 for(const joint of latestDetails(model,'connections')) {
  const p=page(`접합 ${joint.id.slice(0,24)} 검토도`,snapshot,joint);
  const hoops=prepared.connections?.[`${joint.id}@${joint.version}`]?.hoops;
  if(hoops)quantities.push({detailId:joint.id,version:joint.version,kind:'joint-hoop',massQuantity:prepared.connections?.[`${joint.id}@${joint.version}`]?.reinforcementQuantity?.massQuantity??null,productReference:joint.barProductReference??null,productEdition:joint.barProductEdition??null,quantityEstimate:prepared.connections?.[`${joint.id}@${joint.version}`]?.reinforcementQuantity||null,count:hoops.count,positions:hoops.positions,diameter:joint.reinforcement?.diameter??null,cutLength:null,fabricationApproved:false,reason:hoops.reason||'HOOK_AND_FULL_CAGE_PIECE_GEOMETRY_REQUIRED'});
  const paths=snapshot.checks.find(c=>c.entityId===`joint:${joint.nodeId}`&&c.checkId==='joint-bar-congestion'&&c.barPaths?.length);
  if(paths){
   const size=paths.pathDimensions;
   for(const [label,x,axis,height] of [['평면 주근 경로',45,1,size.v],['입면 주근 경로',315,2,size.w]]){
    const scale=Math.min(220/size.u,250/height),y=190;
    text(p,x,167,label,11);rect(p,x,y,size.u*scale,height*scale);
    if(axis===2&&hoops?.status==='OK')for(const position of hoops.positions){const yy=y+(hoops.height-position)*scale;line(p,x,yy,x+size.u*scale,yy);}
    for(const bar of paths.barPaths)for(const [a,b] of bar.segments){
     const ax=x+(a[0]+size.u/2)*scale,ay=y+(height/2-a[axis])*scale,bx=x+(b[0]+size.u/2)*scale,by=y+(height/2-b[axis])*scale;
     if(Math.hypot(ax-bx,ay-by)<1e-8)circle(p,ax,ay,Math.max(2,bar.diameter*scale/2));else line(p,ax,ay,bx,by);
    }
   }
  }else if(joint.jointWidth&&joint.jointDepth){const scale=Math.min(300/joint.jointWidth,260/joint.jointDepth);rect(p,100,190,joint.jointWidth*scale,joint.jointDepth*scale);text(p,100,170,`${mm(joint.jointWidth)} x ${mm(joint.jointDepth)} mm`,12);}
  else text(p,65,200,'접합부 형상 미확정',13);
  text(p,65,480,`연결 부재: ${joint.memberIds.join(', ').slice(0,65)}`,10);
  text(p,65,502,`구속 가정: ${joint.restraint}`,10);
  text(p,65,524,joint.reinforcement?`구속철근 ${mm(joint.reinforcement.diameter)} @${mm(joint.reinforcement.spacing)} mm`:'구속철근 미확정',10);
  const anchorage=snapshot.checks.find(c=>c.entityId===`joint:${joint.nodeId}`&&c.checkId==='joint-anchorage');
  text(p,65,546,anchorage?.required?`후크 정착 ${anchorage.status} / 해당 철근 요구 ${mm(anchorage.required)} · 제공 ${mm(anchorage.available)} mm`:`정착 검사: ${anchorage?.status||'미확정'}`,10);
  text(p,65,570,paths?`주근 경로 ${paths.barCount}개 / 간격 미충족 ${paths.failedPairs.length}쌍. 후프 시공상세 별도.`:'주근 경로 입력과 정착·후크 상세 미확정',10);
  text(p,65,590,hoops?.count?`패널 후프 ${hoops.count}개 · 절곡/보조띠 전체 제작 형상 별도`:`후프 위치 미확정: ${hoops?.reason||'상세 필요'}`,9);
  notes(p,snapshot.checks.filter(x=>x.entityId===`joint:${joint.nodeId}`),620);pages.push(p);
 }
 if(!pages.length)throw new Error('DRAWING_DETAILS_REQUIRED');
 const references=new Map();
 for(const quantity of quantities)for(const ref of quantity.codeReferences||[])references.set(JSON.stringify(['형상 기준',ref.code,ref.edition,ref.clause]),{kind:'형상 기준',...ref});
 for(const check of snapshot.checks)for(const [kind,rows] of [['적용',check.codeBasis?.applied||[]],['적용 확인 필요',check.codeBasis?.reviewTargets||[]]])for(const ref of rows){const key=JSON.stringify([kind,ref.code,ref.edition,ref.clause]);if(!references.has(key))references.set(key,{kind,...ref});}
 const finalQuantities=continuousBarQuantities(quantities,prepared.throughBarSchedule);
 appendContinuousBarPages({snapshot,quantities:finalQuantities,pages,page,text,line});
 let referencePage=null,y=0;
 for(const ref of references.values()) {
  if(!referencePage||y>655){referencePage=page('KDS 계산 근거 및 적용 범위',snapshot,{id:'code-basis',version:1});pages.push(referencePage);y=165;}
  const lines=[`${ref.kind}: ${ref.code}:${ref.edition} ${ref.name||''}`,`조항/식/표: ${ref.clause}`,`공식 출처: ${ref.url}`,`SHA-256: ${ref.sha256}`];
  for(const value of lines)for(let start=0;start<value.length;start+=85){text(referencePage,35,y,value.slice(start,start+85),8);y+=13;}
  y+=12;
 }
 appendRecordedCalculationPages({snapshot,pages,quantities:finalQuantities,createPage:page,writeText:text,maxPages});
 if(pages.length>maxPages)throw new Error('DRAWING_PAGE_LIMIT');
 pages.forEach((p,i)=>text(p,500,820,`${i+1} / ${pages.length}`,9));
 return {...(snapshot.designComparison?{designComparison:snapshot.designComparison}:{}),version:DETAIL_DRAWING_VERSION,evaluatorVersion:snapshot.evaluatorVersion||null,rulePackHash:snapshot.rulePackHash||null,preparedGeometryHash:prepared.inputHash,geometryPreparation:snapshot.preparedDetails?'evaluation-worker':'legacy-export-compatibility',evaluationId:snapshot.id,inputHash:snapshot.inputHash,detailHash:stableHash(model.designDetails),sourceAnalysisRunIds:snapshot.sets.map(x=>x.source.analysisRunId).filter(Boolean),analysisSources:snapshot.sets.map(selectReportSource),reviewOnly:true,designTransferAllowed:false,spliceGeometryIssues,pages:pages.retained,totalPages:pages.length,pageOffset,retainedPageCount:pages.retained.length,quantities:finalQuantities,throughBarSchedule:prepared.throughBarSchedule,checkCount:snapshot.checks.length,...(checkRetention==='omit'?{}:{checks:checkRetention==='copy'?structuredClone(snapshot.checks):snapshot.checks})};
}
const escape=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[x]));
export function drawingsToSvg(page) {
 const commands=page.commands.map(c=>c.kind==='text'?`<text x="${c.x}" y="${c.y}" font-size="${c.size}" fill="#172338" stroke="none">${escape(c.text)}</text>`:c.kind==='line'?`<line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}"/>`:c.kind==='rect'?`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>`:`<circle cx="${c.x}" cy="${c.y}" r="${c.r}"/>`).join('\n');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}"><rect width="100%" height="100%" fill="white"/><g fill="none" stroke="#183d68" stroke-width="0.8" font-family="sans-serif">${commands}</g></svg>`;
}
