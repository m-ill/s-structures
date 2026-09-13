import {punchingUtilization} from './punchingUtilization.js';
import {footingCriticalPerimeter,perimeterStress} from './footingCriticalPerimeter.js';
import {clipPolygon,polygonMoments} from './compressionContact.js';
import {kdsPunchingCapacity} from './kdsPunchingCapacity.js';
import {footingBarLayout} from './footingBarLayout.js';
import {tensionDevelopment} from '../rc/kdsAnchorage.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';

export function openPerimeterActions(g,{ledger,contact}){
 const {xmin,xmax,ymin,ymax}=g.bounds;let polygon=contact.polygon;
 for(const [a,b,c] of [[-xmin,1,0],[xmax,-1,0],[-ymin,0,1],[ymax,0,-1]])polygon=clipPolygon(polygon,a,b,c);
 const m=polygonMoments(polygon),[a,b,c]=contact.pressurePlane;
 const soilForce=a*m.A+b*m.X+c*m.Y,soilFirstX=a*m.X+b*m.XX+c*m.XY,soilFirstY=a*m.Y+b*m.XY+c*m.YY;
 const area=(xmax-xmin)*(ymax-ymin),distributedDownwardForce=ledger.uniformDownwardPressure*area;
 const V=ledger.columnN+distributedDownwardForce-soilForce;
 const globalMx=ledger.totalMx+distributedDownwardForce*(ymin+ymax)/2-soilFirstY;
 const globalMy=ledger.totalMy-distributedDownwardForce*(xmin+xmax)/2+soilFirstX;
 return {V,Mx:globalMx-V*g.centroid.y,My:globalMy+V*g.centroid.x,globalMx,globalMy,momentReference:'critical-perimeter-centroid',soilForce,soilFirstX,soilFirstY,distributedDownwardForce,enclosedArea:area,centroid:g.centroid,units:{force:'kN',moment:'kN.m'}};
}

export function evaluateRectangularFootingPunching(model,f,{ledger,contact,d,dB,dL,preparedPerimeter}){
 const codeReferences=getKcscRuleSources(['142022','142010','142070']).map(r=>({...r,clause:({142022:'4.11.1(3),(4); 4.11.2(2); 4.11.7(1)-(5)',142010:'4.2.3(2)',142070:'4.2.2.2; 4.2.2.3'})[r.id]}));
 const base={codeReferences,methodReviewRequired:true,qualification:'conservative-perimeter-method-independent-review-pending',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(f.punchingMomentMethod!=='conservative-perimeter-shear')return nc('RECTANGULAR_PUNCHING_MOMENT_METHOD_REQUIRED');
 if(!ledger?.ok||!contact?.ok||![ledger.totalMx,ledger.totalMy,ledger.columnN].every(Number.isFinite)||ledger.columnN<=0)return nc('PUNCHING_NET_ACTION_LEDGER_REQUIRED');
 if(!(Math.min(d,dB,dL)>0))return nc('PUNCHING_EFFECTIVE_DEPTH_REQUIRED');
 const geometry=preparedPerimeter??footingCriticalPerimeter(f,d);if(!geometry.ok)return nc(geometry.reason);
 const rb=f.reinforcement,fc=resolveMaterialRecord(model,f.materialId)?.strength?.concrete?.fck,fy=resolveMaterialRecord(model,rb.materialId)?.strength?.steel?.Fy;
 const layouts={B:footingBarLayout(f,'bottom','B'),L:footingBarLayout(f,'bottom','L')};
 if(Object.values(layouts).some(x=>x.status!=='OK'))return nc('FOOTING_BAR_LAYOUT_REQUIRED');
 const development={};
 for(const axis of ['B','L']){
  const bar=rb[`bottom${axis}`],db=bar.diameter*1000;
  development[axis]=tensionDevelopment({db,fy,fck:fc,lambda:1,c:Math.min(f.cover+bar.diameter/2,layouts[axis].minimumSpacing/2)*1000,Ktr:0,topBar:false,coating:'uncoated',sizeFactor:db<=19.1?.8:1});
  if(development[axis].status!=='CALCULATED')return nc('PUNCHING_REINFORCEMENT_DEVELOPMENT_REQUIRED');
 }
 const perimeterChecks=geometry.equivalent.map(g=>{
  const ratios=['B','L'].map(axis=>{
   const width=axis==='B'?f.L:f.B,low=Math.max(-width/2,(axis==='B'?g.bounds.ymin:g.bounds.xmin)-f.thickness),high=Math.min(width/2,(axis==='B'?g.bounds.ymax:g.bounds.xmax)+f.thickness);
   const bar=rb[`bottom${axis}`],count=layouts[axis].positions.filter(p=>p-width/2>=low-1e-10&&p-width/2<=high+1e-10).length;
   return {axis,low,high,count,rho:count*(bar.area??Math.PI*bar.diameter**2/4)/((high-low)*(axis==='B'?dB:dL))};
  });
  const rho=ratios.reduce((n,r)=>n+r.rho,0)/2,calc=kdsPunchingCapacity({fck:fc,d:d*1000,b0:g.length*1000,rho,lambda:1,columnPosition:g.columnPosition});
  if(calc.status!=='CALCULATED')return {...calc,perimeter:g};
  const vc=calc.nominalCapacity/g.area/1000,cuRatio=calc.factors.cu/(d*1000),nominalStress=Math.min(vc,.58*fc*cuRatio,.63*Math.sqrt(fc),.25*fc);
  const actions=openPerimeterActions(g,{ledger,contact}),transfer={...perimeterStress(g,{...actions,designStress:.75*nominalStress*1000}),actions,nominalStress,method:'conservative-perimeter-shear',independentMethodReview:'pending'};
  const extensions=g.segments.map(segment=>{
   const {axis,side}=segment,coordinate=segment.a[axis==='B'?0:1],available=f[axis]/2-side*coordinate-f.cover,required=f.thickness+development[axis].requiredMm/1000;
   return {axis,side,available,required,status:available+1e-10>=required?'OK':'NG',source:development[axis].source};
  });
  const extensionFailure=extensions.some(row=>row.status==='NG');
  return {...calc,status:transfer.status==='NOT_CHECKED'?'NOT_CHECKED':transfer.status==='NG'||extensionFailure?'NG':'OK',...punchingUtilization(extensions,transfer.ratio),demand:transfer.demandStress,capacity:transfer.capacity,nominalCapacity:nominalStress*1000,unit:'kPa',demandBasis:'combined-perimeter-stress',verticalDemand:actions.V,verticalShearCapacity:calc.capacity,nominalVerticalShearCapacity:calc.nominalCapacity,reason:extensionFailure?'PUNCHING_REINFORCEMENT_EXTENSION_INSUFFICIENT':transfer.reason??null,perimeter:g,alphaSSelection:'perimeter-topology-assumption-requires-independent-review',reinforcementBands:ratios,transfer,extensions};
 });
 const rank={OK:0,NOT_CHECKED:1,NG:2};
 const worst=perimeterChecks.reduce((a,b)=>rank[b.status]>rank[a.status]||rank[b.status]===rank[a.status]&&(b.ratio??0)>(a.ratio??0)?b:a);
 return {...worst,...base,perimeterChecks,minimumPerimeter:geometry.length,soilReactionReductionApplied:true,codeReferences:[...codeReferences,...worst.codeReferences,...Object.values(development).map(r=>r.source)],scope:'rectangular isolated footing, contained rectangular column, interior/edge/corner minimum paths, no openings or flexural transfer credit'};
}
