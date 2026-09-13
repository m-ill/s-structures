import {footingBarLayout} from './footingBarLayout.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {tensionDevelopment} from '../rc/kdsAnchorage.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {footingColumnGeometry} from './footingColumnGeometry.js';
export function evaluateFootingBarAnchorage(model,f){
 const nc=reason=>({status:'NOT_CHECKED',ratio:null,reason});
 if(f.barShape!=='straight'||f.concreteWeight!=='normal'||f.barCoating!=='uncoated')return nc('STRAIGHT_NORMAL_UNCOATED_FOOTING_BAR_SCOPE_REQUIRED');
 const rb=f.reinforcement,fy=resolveMaterialRecord(model,rb?.materialId)?.strength?.steel?.Fy,fck=resolveMaterialRecord(model,f.materialId)?.strength?.concrete?.fck,rows=[];
 if(!rb||!f.columnWidth||!f.columnDepth)return nc('COLUMN_AND_FOOTING_REINFORCEMENT_REQUIRED');
 const geometry=footingColumnGeometry(f);if(!geometry.ok)return nc(geometry.reason);
 for(const face of ['bottom','top'])for(const [axis,span,column] of [['B',f.B,f.columnWidth],['L',f.L,f.columnDepth]]){
  const bar=rb[`${face}${axis}`];if(!bar)continue;
  const db=bar.diameter*1000,depthBelow=face==='top'?f.thickness-f.cover-bar.diameter/2-(axis==='L'?rb.topB.diameter:0):f.cover+bar.diameter/2+(axis==='L'?rb.bottomB.diameter:0);
  const sideChecks=[-1,1].map(side=>({side,available:span/2-geometry.axes[axis].cut(side)-f.cover})),available=Math.min(...sideChecks.map(x=>x.available));
  const layout=footingBarLayout(f,face,axis);if(layout.status!=='OK')return nc(layout.reason);
  const calc=tensionDevelopment({db,fy,fck,lambda:1,c:Math.min(f.cover+bar.diameter/2,layout.minimumSpacing/2)*1000,Ktr:0,topBar:depthBelow>.3,coating:'uncoated',clearCover:f.cover*1000,clearSpacing:(layout.minimumSpacing-bar.diameter)*1000,sizeFactor:db<=19.1?.8:1});
  if(calc.status!=='CALCULATED')return {...nc(calc.reason),calculation:calc};
  rows.push({axis,face,available,required:calc.requiredMm/1000,ratio:available>0?calc.requiredMm/(available*1000):null,status:available<=0?'NG':calc.requiredMm<=available*1000+1e-7?'OK':'NG',sideChecks:sideChecks.map(row=>({...row,required:calc.requiredMm/1000})),source:calc.source,criticalSection:'column-face',topCastFactor:calc.factors.alpha});
 }
 if(!rows.length)return nc('FOOTING_REINFORCEMENT_REQUIRED');
 const worst=rows.find(row=>row.available<=0)||rows.reduce((a,b)=>b.ratio>a.ratio?b:a);
 return {...worst,reason:worst.status==='NG'?'FOOTING_BAR_DEVELOPMENT_LENGTH_INSUFFICIENT':null,checks:rows,qualification:'clause-scoped-not-whole-design',codeReferences:[...getKcscRuleSources(['142070']).map(r=>({...r,clause:'4.2.2.3(1)-(3)'})),...rows.map(r=>r.source)],scope:'uniform-full-span-straight-footing-bars; column-dowel-force-transfer separate',units:{available:'m',required:'m'}};
}
