// Select before copying: a metadata query must not clone the complete catalog.
export function boundedResultSlice(result,{path='summary',limit=25}={}) {
  if(!/^(summary|payload)(\.[A-Za-z0-9_-]+)*$/.test(path)||path.split('.').some(p=>['__proto__','constructor','prototype'].includes(p)))throw Object.assign(new Error('INVALID_PATH'),{code:'INVALID_PATH'});
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Object.assign(new Error('INVALID_LIMIT'),{code:'INVALID_LIMIT'});
  let data=result;
  for(const key of path.split('.'))data=data!=null&&Object.hasOwn(data,key)?data[key]:undefined;
  const count=Array.isArray(data)?data.length:Array.isArray(data?.rows)?data.rows.length:null;
  if(Array.isArray(data))data=data.slice(0,limit);
  else if(Array.isArray(data?.rows))data={...data,rows:data.rows.slice(0,limit)};
  // Bound the selected subtree before allocating its isolated copy.
  let size=0;const stack=[data],seen=new Set();
  while(stack.length){const item=stack.pop();size+=typeof item==='string'?item.length*2:16;if(size>64000)throw Object.assign(new Error('RESULT_TOO_LARGE'),{code:'RESULT_TOO_LARGE'});if(item&&typeof item==='object'&&!seen.has(item)){seen.add(item);for(const key in item)if(Object.hasOwn(item,key)){size+=key.length*2;stack.push(item[key]);if(stack.length>4000)throw Object.assign(new Error('RESULT_TOO_LARGE'),{code:'RESULT_TOO_LARGE'});}}}
  return {path,limit,data:structuredClone(data),truncated:count!==null&&count>limit};
}
