import {footingBarLayout,footingDistribution} from './footingBarLayout.js';
import {evaluateKdsSection} from '../rc/kdsStrength.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {netFootingCut} from './footingLoadLedger.js';
import {footingMinimumSteel} from './footingMinimumSteel.js';
import {footingColumnGeometry} from './footingColumnGeometry.js';

export function evaluateFootingSections(model,f,contact,ledger){
 const nc=reason=>({status:'NOT_CHECKED',ratio:null,reason});
 const fail=reason=>({'foundation-flexure':nc(reason),'foundation-one-way-shear':nc(reason)});
 const geometry=footingColumnGeometry(f);if(!geometry.ok)return fail(geometry.reason);
 const rb=f.reinforcement,concrete=resolveMaterialRecord(model,f.materialId),steel=resolveMaterialRecord(model,rb.materialId),fc=concrete?.strength?.concrete?.fck,fy=steel?.strength?.steel?.Fy;
 const flex=[],shears=[],minimum=[];
 for(const [axis,span,width,column] of [['B',f.B,f.L,f.columnWidth],['L',f.L,f.B,f.columnDepth]]){
  if(column>=span)return fail('COLUMN_OUTSIDE_FOOTING');
  const layers=[],depths={};
  for(const face of ['bottom','top']){
   const bar=rb[`${face}${axis}`];if(!bar)continue;
   const other=rb[`${face}B`],depth=f.thickness-f.cover-bar.diameter/2-(axis==='L'?other?.diameter||0:0);
   const layout=footingBarLayout(f,face,axis),count=layout.count;
   if(layout.status!=='OK')return fail(layout.reason);
   if(!Number.isFinite(count)||count<1||count>100||!(depth>0))return fail('FOOTING_BAR_GEOMETRY_OR_SIZE_LIMIT');
   depths[face]=depth;
   for(let i=0;i<count;i++)layers.push({face,y:(face==='bottom'?1:-1)*(f.thickness/2-depth),z:-width/2+layout.positions[i],diameter:bar.diameter,area:(bar.area??Math.PI*bar.diameter**2/4)});
  }
  for(const sign of [-1,1]){
   const faceCut=geometry.axes[axis].cut(sign),cut=netFootingCut(contact,f,ledger,axis,sign,faceCut),face=cut.moment< -1e-9?'top':'bottom',d=depths[face];
   if(!d)return fail('TOP_REINFORCEMENT_REQUIRED_FOR_REVERSE_MOMENT');
   const section=evaluateKdsSection({B:width,H:f.thickness},layers,{fc,fy,Es:steel.elastic.E},{N:0,My:0,Mz:-cut.moment});
   flex.push({...section,demand:Math.abs(cut.moment),signedMoment:cut.moment,axis,side:sign,cutCoordinate:sign*faceCut,face,effectiveDepth:d,barCount:layers.filter(b=>b.face===face).length,steelArea:layers.filter(b=>b.face===face).reduce((s,b)=>s+b.area,0)});
   const shearCut=Math.min(span/2,faceCut+d),shear=Math.abs(netFootingCut(contact,f,ledger,axis,sign,shearCut).force),Vc=Math.min(Math.sqrt(fc),8.4)*width*d*1000/6,capacity=.75*Vc;
   const refs=getKcscRuleSources(['142022','142010','142070']).map(x=>({...x,clause:x.id==='142022'?'4.2.1(1); 4.3.3(1); 4.11.1':x.id==='142010'?'4.2.3(2)':'4.2.1(5); 4.2.2.2(1),(2)'}));
   shears.push({status:shear>capacity?'NG':'OK',ratio:shear/capacity,demand:shear,capacity,Vc,phi:.75,axis,side:sign,cutCoordinate:sign*shearCut,face,effectiveDepth:d,codeReferences:refs,qualification:'clause-scoped-not-whole-design',minimumShearReinforcementException:'KDS 14 20 22 4.3.3(1) footings'});
  }
  for(const face of ['bottom','top']){
   if(face==='top'&&!flex.some(x=>x.axis===axis&&x.face==='top'))continue;
   const bar=rb[`${face}${axis}`],area=layers.filter(b=>b.face===face).reduce((n,b)=>n+b.area,0);
   minimum.push({...footingMinimumSteel({width,thickness:f.thickness,fy,area,spacing:footingBarLayout(f,face,axis).maximumSpacing}),axis,face});
  }
 }
 const priority={OK:0,NG:1,NOT_CHECKED:2,FAILED:3};
 const worst=rows=>rows.reduce((a,b)=>!a||priority[b.status]>priority[a.status]||priority[b.status]===priority[a.status]&&(b.ratio||0)>(a.ratio||0)?b:a,null);
 return {'foundation-flexure':{...worst(flex),axisChecks:flex,loadLedger:ledger},'foundation-one-way-shear':{...worst(shears),axisChecks:shears,loadLedger:ledger},'foundation-reinforcement':f.shrinkageRestraint==='ordinary-not-severely-restrained'?{...worst(minimum),axisChecks:minimum}:nc('SHRINKAGE_RESTRAINT_CLASSIFICATION_REQUIRED'),'foundation-distribution':footingDistribution(f)};
}
