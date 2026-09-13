export function createPageWindow({offset,limit,maxPages}){
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||!Number.isInteger(maxPages)||maxPages<1||limit>maxPages)throw Error('DRAWING_PAGE_WINDOW_INVALID');
 let count=0;const retained=[];
 return {
  retained,
  get length(){return count;},
  willRetainNext:()=>count>=offset&&count-offset<limit,
  push(page){if(count>=maxPages)throw Error('DRAWING_PAGE_LIMIT');if(count>=offset&&count-offset<limit)retained.push(page);return ++count;},
  forEach(fn){retained.forEach((page,i)=>fn(page,offset+i));}
 };
}
