// Active model references, excluding superseded design-detail versions.
// Reference collection does not resolve, normalize or calculate material properties.
function latest(rows=[]){
 const records=new Map();
 for(const row of rows)if(!records.has(row.id)||records.get(row.id).version<row.version)records.set(row.id,row);
 return records.values();
}
export function activeLibraryReferences(model={}){
 const materials=new Set(),sections=new Set();
 const add=ref=>{if(ref)materials.add(ref);};
 for(const member of model.members||[]){add(member.matId);if(member.secId)sections.add(member.secId);}
 for(const r of latest(model.designDetails?.reinforcement)){
  add(r.barMaterialId);
  if(r.stirrups)add(r.stirrupMaterialId||r.barMaterialId);
 }
 for(const r of latest(model.designDetails?.connections)){add(r.jointMaterialId);add(r.reinforcement?.materialId);}
 for(const r of latest(model.designDetails?.foundations)){add(r.materialId);add(r.reinforcement?.materialId);}
 return {materialRefs:[...materials].sort(),sectionRefs:[...sections].sort(),scope:'members-and-latest-design-details'};
}
