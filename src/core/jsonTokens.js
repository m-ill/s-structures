// Bounded-size tokens with native JSON property order and toJSON semantics.
export function* jsonTokens(value,{maxUnits=Number.MAX_SAFE_INTEGER,pretty=false}={}){
 function* quoted(text){
  if(text.length>maxUnits)throw Error('ARTIFACT_SIZE_LIMIT');
  yield '"';
  for(let start=0;start<text.length;){
   let end=Math.min(start+4096,text.length);
   if(end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff&&text.charCodeAt(end)>=0xdc00&&text.charCodeAt(end)<=0xdfff)end--;
   yield JSON.stringify(text.slice(start,end)).slice(1,-1);start=end;
  }
  yield '"';
 }
 function normalize(v,key){
  if(v!==null&&(typeof v==='object'||typeof v==='bigint')&&typeof v.toJSON==='function')v=v.toJSON(key);
  if(v instanceof Number||v instanceof String||v instanceof Boolean)v=v.valueOf();
  if(typeof v==='bigint'||Object.prototype.toString.call(v)==='[object BigInt]')throw TypeError('JSON_BIGINT');
  return v;
 }
 const omitted=v=>v===undefined||typeof v==='function'||typeof v==='symbol';
 function* tokens(){
  const ancestors=new Set();
  function* visit(v,depth){
   if(depth>128)throw Error('JSON_DEPTH_LIMIT');
   if(typeof v==='string'){yield* quoted(v);return;}
   if(v===null||typeof v!=='object'){yield JSON.stringify(v);return;}
   if(ancestors.has(v))throw Error('JSON_CYCLE');
   ancestors.add(v);
   const array=Array.isArray(v),indent=pretty?'  '.repeat(depth+1):'',closing=pretty?'  '.repeat(depth):'';
   yield array?'[':'{';let count=0;
   if(array){
    const length=v.length;
    // Even an array of nulls needs at least one byte per entry.
    if(length>maxUnits)throw Error('ARTIFACT_SIZE_LIMIT');
    for(let i=0;i<length;i++){
     let child=normalize(v[i],String(i));if(omitted(child))child=null;
     yield (count++?(pretty?',\n':','):(pretty?'\n':''))+indent;yield* visit(child,depth+1);
    }
   }else{
    for(const key of Object.keys(v)){
     const child=normalize(v[key],key);if(omitted(child))continue;
     yield (count++?(pretty?',\n':','):(pretty?'\n':''))+indent;yield* quoted(key);yield pretty?': ':':';yield* visit(child,depth+1);
    }
   }
   if(count&&pretty)yield '\n'+closing;
   yield array?']':'}';ancestors.delete(v);
  }
  const root=normalize(value,'');if(omitted(root))throw TypeError('JSON_ROOT_REQUIRED');
  yield* visit(root,0);
 }
 yield* tokens();
}
