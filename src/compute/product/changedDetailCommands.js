import {stableHash} from '../../core/stableHash.js';
// Compare typed input commands, not derived results. Assignment and new-record
// commands remain changes; only matched existing detail versions are omitted.
export function changedDetailCommands(commands,originals){
 const prior=new Map(originals.map(c=>[JSON.stringify([c.type,c.id]),c]));
 return commands.filter(c=>{const original=prior.get(JSON.stringify([c.type,c.id]));return !original||stableHash({...c,version:original.version})!==stableHash(original);});
}
