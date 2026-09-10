import {createModel} from '../../src/core/model.js';
// Phase21 M fixture: 5x5 nodes per plane, 4 storeys; 125 nodes / 750 full DOF.
// This is a fixed solver/load test, not a building design or 10,000-DOF claim.
export function createP21MediumFixture(){
 const m=createModel();m.meta={projectId:'P21-M-125'};m.nodes=[];m.members=[];m.loads=[];m.diaphragms=[];
 const id=(z,x,y)=>`N${z}-${x}-${y}`;
 for(let z=0;z<=4;z++)for(let x=0;x<5;x++)for(let y=0;y<5;y++){
  const n=id(z,x,y);m.nodes.push({id:n,x:x*4,y:y*4,z:z*3.2,...(z===0?{support:'fixed'}:{})});
  if(z){
   m.members.push({id:`C${n}`,n1:id(z-1,x,y),n2:n,type:'frame',matId:'steel',secId:'rcsq400'});
   if(x<4)m.members.push({id:`X${n}`,n1:n,n2:id(z,x+1,y),type:'frame',matId:'steel',secId:'rcsq400'});
   if(y<4)m.members.push({id:`Y${n}`,n1:n,n2:id(z,x,y+1),type:'frame',matId:'steel',secId:'rcsq400'});
   m.loads.push({id:`D${n}`,type:'nodal',node:n,case:'D',P:100,dir:'-z'},{id:`W${n}`,type:'nodal',node:n,case:'W',P:1,dir:'+x'});
  }
 }
 for(let z=1;z<=4;z++)m.diaphragms.push({id:`F${z}`,type:'rigid',nodeIds:m.nodes.filter(n=>n.z===z*3.2).map(n=>n.id)});
 m.loadCases=[{id:'D',name:'D',type:'dead'},{id:'W',name:'W',type:'wind'}];
 m.loadCombinations=[{id:'DW',name:'DW',type:'strength',factors:{D:1,W:1}}];
 m.analysisCases=[{id:'M-FIRST',kind:'static',name:'M first order',settings:{comboId:'DW',pDeltaMethod:'off'}},{id:'M-DIRECT',kind:'static',name:'M Direct',settings:{comboId:'DW',pDeltaMethod:'direct'}}];
 m.analysisSettings.includeSelfWeight=false;return m;
}
