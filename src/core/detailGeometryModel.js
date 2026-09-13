// Shared dependency boundary for detail geometry and its report snapshot.
// Preserve all registry scopes: section lookup and splice geometry also use
// global/office records. Values are borrowed; this selector never deep-copies.
const keys=['nodes','members','designDetails','sections','globalSections','officeSections','materials','globalMaterials','officeMaterials'];
export function selectDetailGeometryModel(model){
 return Object.fromEntries(keys.filter(key=>Object.hasOwn(model,key)).map(key=>[key,model[key]]));
}
