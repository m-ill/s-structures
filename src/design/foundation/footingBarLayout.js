import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
// Coordinates measured from the distribution-width edge, in metres. One owner
// supplies strength, development, punching, candidate quantities and drawings.
export function footingBarLayout(f,face,axis) {
 const bar=f.reinforcement?.[`${face}${axis}`],span=f[axis],width=f[axis==='B'?'L':'B'];
 const nc=reason=>({status:'NOT_CHECKED',reason,count:0,positions:[],minimumSpacing:null,maximumSpacing:null});
 if(!bar||![span,width,f.cover,bar.diameter,bar.spacing].every(x=>Number.isFinite(x)&&x>0))return nc('FOOTING_BAR_LAYOUT_INPUT_REQUIRED');
 const edge=f.cover+bar.diameter/2,available=width-2*edge;
 if(available<=0||bar.spacing<bar.diameter)return nc('FOOTING_BAR_LAYOUT_GEOMETRY');
 let positions,centerBand=null;
 if(f.barDistribution==='kds-centered-band'&&span<width-1e-9){
  const offset=(axis==='B'?f.columnOffsetY:f.columnOffsetX)??0,low=(width-span)/2+offset,high=low+span,left=low-edge,right=width-edge-high,beta=width/span,fraction=2/(beta+1);
  if(!Number.isFinite(offset)||Math.min(left,right)<=0)return nc('CENTER_BAND_OUTSIDE_USABLE_WIDTH');
  const leftCount=Math.max(1,Math.ceil(left/bar.spacing)),rightCount=Math.max(1,Math.ceil(right/bar.spacing));
  const centerCount=Math.max(Math.ceil(span/bar.spacing),Math.ceil(fraction*(leftCount+rightCount)/(1-fraction)-1e-10));
  if(leftCount+rightCount+centerCount>100)return nc('FOOTING_BAR_LAYOUT_SIZE_LIMIT');
  const cells=(a,b,n)=>Array.from({length:n},(_,i)=>a+(i+.5)*(b-a)/n);
  positions=[...cells(edge,low,leftCount),...cells(low,high,centerCount),...cells(high,width-edge,rightCount)];
  centerBand={low,high,beta,requiredFraction:fraction,count:centerCount};
 }else{
  const count=Math.floor(available/bar.spacing+1e-10)+1;
  if(count<1||count>100)return nc('FOOTING_BAR_LAYOUT_SIZE_LIMIT');
  positions=Array.from({length:count},(_,i)=>edge+i*bar.spacing);
 }
 const gaps=positions.slice(1).map((x,i)=>x-positions[i]);
 const minimumSpacing=gaps.length?Math.min(...gaps):bar.spacing,maximumSpacing=gaps.length?Math.max(...gaps):bar.spacing;
 if(minimumSpacing<bar.diameter-1e-10)return nc('FOOTING_BAR_LAYOUT_OVERLAP');
 return {status:'OK',count:positions.length,positions,minimumSpacing,maximumSpacing,centerBand,bodyLength:span-2*f.cover,area:positions.length*(bar.area??Math.PI*bar.diameter**2/4)};
}
export function footingDistribution(f){
 const refs=getKcscRuleSources(['142070']).map(r=>({...r,clause:'4.2.2.1(3),(4); Eq.4.2-1'})),checks=[];
 for(const face of ['bottom','top'])for(const axis of ['B','L']){
  if(!f.reinforcement?.[`${face}${axis}`])continue;
  const layout=footingBarLayout(f,face,axis);
  if(layout.status!=='OK')return {...layout,ratio:null,codeReferences:refs};
  const span=f[axis],width=f[axis==='B'?'L':'B'];
  if(span<width-1e-9){
   const offset=(axis==='B'?f.columnOffsetY:f.columnOffsetX)??0,low=(width-span)/2+offset,high=low+span;
   if(!Number.isFinite(offset)||low<0||high>width)return {status:'NOT_CHECKED',ratio:null,reason:'CENTER_BAND_OUTSIDE_FOOTING',codeReferences:refs};
   const requiredFraction=2/(width/span+1),centerCount=layout.positions.filter(x=>x>=low-1e-10&&x<=high+1e-10).length,providedFraction=centerCount/layout.count;
   checks.push({axis,face,centerCount,totalCount:layout.count,requiredFraction,providedFraction,ratio:providedFraction?requiredFraction/providedFraction:null,status:providedFraction+1e-10>=requiredFraction?'OK':'NG'});
  }else checks.push({axis,face,status:'OK',ratio:0,reason:'UNIFORM_FULL_WIDTH'});
 }
 if(!checks.length)return {status:'NOT_CHECKED',ratio:null,reason:'FOOTING_REINFORCEMENT_REQUIRED',codeReferences:refs};
 const failed=checks.find(x=>x.status==='NG'),worst=failed||checks.reduce((a,b)=>(b.ratio||0)>(a.ratio||0)?b:a);
 return {...worst,checks,codeReferences:refs,qualification:'clause-scoped-not-whole-design',scope:'column-centered-band-or-uniform-footing-bars',designTransferAllowed:false};
}
