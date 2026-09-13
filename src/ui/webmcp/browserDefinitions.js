// Keep canonical typed definitions for in-process callers; advertise the large
// command union through its existing on-demand schema endpoint in browsers.
export function browserDefinitions(definitions){
 return definitions.map(definition=>{
  if(definition.name==='preview_design_changes'){
   const inputSchema=structuredClone(definition.inputSchema),commands=inputSchema.properties.commands;
   const types=[...new Set(commands.items.oneOf.flatMap(s=>s.properties.type.enum))];
   commands.items={type:'object',properties:{type:{type:'string',enum:types}},required:['type'],additionalProperties:true};
   return {...definition,inputSchema,description:'Preview typed design input changes without applying or solving. First call get_design_input_schema for each command type and follow its fields, units and required inputs. Runtime validates the complete canonical command schema. Supply current inputHash and requestId; use the returned preview handle with apply_design_changes. Model, member, material, reinforcement, foundation and connection changes retain their existing validation and session rules.'};
  }
  if(definition.name==='plan_design_candidates')return {...definition,description:'Plan bounded design repair candidates for the current evaluation. First query get_design_modules with moduleId optimization for supported inputs, limits and unresolved checks. This only creates a plan; start_design_candidates runs isolated analyses. Input loads, material strength, ground properties and locked details cannot be changed automatically. Candidate results are not whole-design approval; apply_design_candidate_and_review applies an explicitly selected candidate and rechecks the current model.'};
  return definition;
 });
}
