// Stream code points; preserve the existing 64-character and CRLF layout.
export function* wrapReportText(parts){
 let line='',count=0,hasText=false,pendingCR=false;
 function* consume(ch){
  if(ch==='\n'){
   if(line)yield line;else if(!hasText)yield ' ';
   line='';count=0;hasText=false;return;
  }
  line+=ch;count++;hasText=true;
  if(count===64){yield line;line='';count=0;}
 }
 for(const part of parts)for(const ch of part){
  if(pendingCR){pendingCR=false;if(ch!=='\n')yield* consume('\r');}
  if(ch==='\r'){pendingCR=true;continue;}
  yield* consume(ch);
 }
 if(pendingCR)yield* consume('\r');
 if(line)yield line;else if(!hasText)yield ' ';
}
