import {practicalInputFields} from '../modeling/practicalInputContract.js';
// One selected detail and twenty changed fields; source arrays remain in the
// existing paginated candidate-detail result, not duplicated into DOM nodes.
export function renderConnectedDetailChanges(doc,container,changes,type){
 if(!Array.isArray(changes)||!changes.length)return false;
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
 const title=type==='foundation-record'?'기초':'접합부',section=el('section'),select=el('select'),body=el('div');let offset=0;
 const fields=new Map(practicalInputFields(type).map(f=>[f.key,f]));
 section.appendChild(el('h4',`${title} 변경 전후`));select.setAttribute('aria-label',`변경 ${title}`);
 changes.forEach((c,i)=>{const option=el('option',`${c.after?.id||title}: ${c.before?.version??'없음'} → ${c.after?.version??'없음'}`);option.value=String(i);select.appendChild(option);});select.value='0';
 section.appendChild(select);section.appendChild(body);container.appendChild(section);
 const value=x=>{if(x===undefined)return '—';const text=typeof x==='object'?JSON.stringify(x):String(x);return text.length>240?`${text.slice(0,240)}… (상세 데이터 참조)`:text;};
 function render(){
  body.replaceChildren();const c=changes[Number(select.value)];if(!c)return;
  const keys=(c.changedFields||[]).filter(k=>k!=='version'),table=el('table'),header=el('tr');
  for(const label of ['항목','변경 전','변경 후','단위'])header.appendChild(el('th',label));table.appendChild(header);
  for(const key of keys.slice(offset,offset+20)){const row=el('tr');for(const v of [fields.get(key)?.label||key,value(c.before?.[key]),value(c.after?.[key]),c.units?.[key]||fields.get(key)?.unit||'—'])row.appendChild(el('td',v));table.appendChild(row);}
  body.appendChild(table);body.appendChild(el('p',`변경 항목 ${keys.length}개 · ${keys.length?offset+1:0}–${Math.min(offset+20,keys.length)} 표시. 적합성은 후보 검토 결과를 확인하세요.`));
  if(offset){const prev=el('button','이전 변경 항목');prev.type='button';prev.addEventListener('click',()=>{offset=Math.max(0,offset-20);render();});body.appendChild(prev);}
  if(offset+20<keys.length){const next=el('button','다음 변경 항목');next.type='button';next.addEventListener('click',()=>{offset+=20;render();});body.appendChild(next);}
 }
 select.addEventListener('change',()=>{offset=0;render();});render();return true;
}
