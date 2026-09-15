import {installWorkShell} from './workspaceUxShell.js';
import {loadHarnessPackage} from '../agentHarness/package.js';
import {PUBLIC_SITE_URL,planDirectory,prepareDirectory} from '../agentHarness/directory.js';

export function installAgentConnection(target){
 const doc=target.document,menu=doc.getElementById('menuDrop');if(!menu||doc.getElementById('ssAgentConnect'))return;
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const panel=el('section');panel.id='ssAgentConnection';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','ssAgentConnectionTitle');
 const title=el('h2','AI Agent에 연결');title.id='ssAgentConnectionTitle';panel.append(title);
 panel.append(el('p','AI 앱에서 열어 둔 프로젝트와 같은 폴더를 선택하세요. 필요한 업무 지침과 기록 폴더를 자동으로 준비합니다.'));
 const link=el('a','S-Structures 공개 사이트');link.href=PUBLIC_SITE_URL;link.target='_blank';link.rel='noopener';panel.append(link);
 panel.append(el('p','자료가 없으면 사람에게 확인하고, 설계 결정은 사람에게 맡기는 기본 지침이 적용됩니다. 기존 파일과 현재 모델은 보존합니다.'));
 panel.append(el('p','연결된 에이전트에는 시작 안내와 현재 모델 조회, WebMCP·브라우저 도구 선택, 공통 보고서 출력 절차를 제공합니다. AI에게 원하는 작업을 요청하면 됩니다.'));
 const status=el('p','프로젝트 폴더를 선택해 주세요.');status.setAttribute('role','status');panel.append(status);
 const list=el('ul');panel.append(list);
 const detail=el('details');detail.append(el('summary','연결 범위'),el('p','선택한 폴더에 AGENTS.md와 공통 업무 지침을 준비합니다. WebMCP 지원 에이전트는 준비 상태와 지침을 조회할 수 있습니다. 폴더 준비만으로 AI 대화가 시작되거나 연결이 확인되지는 않습니다.'));
 detail.append(el('p','폴더 접근은 브라우저에서 허용한 범위에 한합니다. 사람의 신원 인증이나 모든 해석 명령의 승인 강제는 포함하지 않습니다.'));panel.append(detail);doc.body.append(panel);
 const shell=installWorkShell(target,panel),button=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',fn);return b;};
 let handle=null,files=null;
 const apply=button('이 폴더에 준비',async()=>{
  apply.disabled=true;choose.disabled=true;
  try{const result=await prepareDirectory(handle,files);status.textContent=result.prepared?`“${handle.name}” 폴더 준비 완료. AI 연결은 아직 확인되지 않았습니다.${result.preserveCount?' 기존 지침은 보존했습니다. 에이전트는 공통 지침도 함께 확인해야 합니다.':''}`:'기존 프로젝트 기록과 충돌하여 파일을 변경하지 않았습니다. 기존 프로젝트를 그대로 사용하거나 다른 폴더를 선택하세요.';}
  catch(e){status.textContent='준비를 완료하지 못했습니다. 폴더 권한을 확인하고 다시 선택하세요. 이미 만든 파일은 보존됩니다.';}
  finally{choose.disabled=false;}
 });apply.disabled=true;
 const choose=button('프로젝트 폴더 선택',async()=>{
  apply.disabled=true;choose.disabled=true;list.replaceChildren();
  try{
   handle=await target.showDirectoryPicker({mode:'readwrite',id:'sstructures-agent-project'});
   files=(await loadHarnessPackage({siteUrl:PUBLIC_SITE_URL})).files;
   const plan=await planDirectory(handle,files);
   status.textContent=plan.blocked?`“${handle.name}”에 기존 프로젝트 기록이 있습니다. 자동 병합하지 않습니다.`:`“${handle.name}”에 새 파일 ${plan.createCount}개를 준비합니다. 기존 파일 ${plan.preserveCount}개는 그대로 둡니다.`;
   for(const row of plan.rows)list.append(el('li',`${row.action==='create'?'새로 준비':row.action==='unchanged'?'이미 준비됨':'기존 파일 보존'} · ${row.path}`));
   apply.disabled=plan.blocked;
  }catch(e){status.textContent=e.name==='AbortError'?'폴더 선택을 취소했습니다. 파일을 변경하지 않았습니다.':'이 브라우저에서 폴더 접근을 완료하지 못했습니다. 폴더 접근을 지원하는 브라우저에서 공개 사이트를 열어 준비해 주세요.';}
  finally{choose.disabled=false;}
 });
 if(typeof target.showDirectoryPicker!=='function'){choose.disabled=true;status.textContent='현재 브라우저는 프로젝트 폴더 접근을 지원하지 않습니다. 폴더 접근을 지원하는 Chrome 또는 Edge에서 공개 사이트를 열어 준비해 주세요. AI 앱의 자동 설치 연결은 아직 제공되지 않습니다.';}
 shell.footer.append(choose,apply);
 const open=button('AI Agent에 연결',()=>{menu.classList.remove('show');panel.hidden=false;target.__ssActiveWorkPanel=panel;});open.id='ssAgentConnect';menu.prepend(open);
 new target.MutationObserver(()=>{if(panel.hidden)doc.getElementById('menuBtn')?.focus();}).observe(panel,{attributes:true,attributeFilter:['hidden']});return{panel,open:()=>open.click()};
}
