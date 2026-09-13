import {installWorkShell,anchorMenuRect} from './workspaceUxShell.js';
import {workspaceUxStyles} from './workspaceUxStyles.js';
import {installAgentConnection} from './agentConnection.js';
const INPUTS=[['material-record','재료'],['section-record','단면'],['reinforcement-record','배근'],['connection-record','접합'],['foundation-record','기초'],['ground-record','지반']];
export function installWorkspaceUx(target,bridge){
 const doc=target.document;
 // Browser layout adapter; computational services and headless bridge remain independent.
 if(!doc?.defaultView||!target.MutationObserver||doc.getElementById('ssWorkspaceUxStyles'))return null;
 const originalControls=[...doc.querySelectorAll('button,input,select,textarea')];
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',fn);return b;};
 const style=el('style',workspaceUxStyles);style.id='ssWorkspaceUxStyles';doc.head.appendChild(style);
 installAgentConnection(target);
 const input=doc.getElementById('ssDesignInputs'),review=doc.getElementById('ssDesignReview');
 const inputShell=input&&installWorkShell(target,input),reviewShell=review&&installWorkShell(target,review);
 const existingButton=(root,label)=>[...root.querySelectorAll('button')].find(b=>b.textContent===label);
 if(inputShell){
  for(const label of ['변경안 미리보기','변경안 적용','닫기']){const b=existingButton(inputShell.body,label);if(b)inputShell.footer.appendChild(b);}
  const open=bridge.designInputPanel.open.bind(bridge.designInputPanel);
  bridge.designInputPanel.open=()=>{bridge.designReviewPanel?.close();bridge.elasticSetupWorkflow?.close?.();open();};
 }
 const openInput=type=>{target.SStructuresNativeUI?.setMode('elastic');bridge.designReviewPanel?.close();bridge.designInputPanel.openRecord({type});};
 const shortcuts=el('div');shortcuts.className='ss-ux-shortcuts';shortcuts.setAttribute('aria-label','설계 입력 바로가기');
 const choose=el('select');choose.setAttribute('aria-label','설계 입력 종류 바로가기');for(const [value,label] of INPUTS){const o=el('option',label);o.value=value;choose.appendChild(o);}shortcuts.append(choose,button('입력 열기',()=>openInput(choose.value)));
 const elastic=doc.querySelector('[data-ss-ribbon-panel="elastic"]');elastic?.appendChild(shortcuts);
 const material=doc.getElementById('matSel');if(material){const row=el('div');row.className='ss-ux-shortcuts';row.appendChild(button('재료 만들기·편집',()=>openInput('material-record')));material.insertAdjacentElement('afterend',row);}
 const navEntries=[];
 if(reviewShell){
  const practical=doc.getElementById('ssPracticalDesign');
  const h=(text)=>[...review.querySelectorAll('h3,h4')].find(n=>n.textContent===text);
  const candidate=review.querySelector('[aria-label="후보 대상 종류"]');
  const output=existingButton(review,'도면·수량 생성')||review.querySelector('[aria-label="PDF 권 번호"]');
  navEntries.push(['개요',reviewShell.body.querySelector('p')],['상세 검토',practical],['사용성',h('RC 강성 반복해석')],['부착 후 변형',h('부착 후 축변형·양방향 처짐')],['이음',h('이음 해석 결과로 상세 검토')],['보완안',candidate],['도면·출력',output],['검토 결과',doc.getElementById('ssPracticalCheckResults')]);
  const nav=el('nav');nav.className='ss-ux-nav';nav.setAttribute('aria-label','설계 검토 내부 탐색');
  const reveal=(node,b)=>{reviewShell.reveal(node);for(const x of nav.querySelectorAll('button'))x.setAttribute('aria-current',String(x===b));};
  for(const [label,node] of navEntries){if(!node)continue;const b=button(label,()=>reveal(node,b));nav.appendChild(b);}
  review.insertBefore(nav,reviewShell.body);
  for(const label of ['닫기']){const b=existingButton(reviewShell.body,label);if(b)reviewShell.footer.appendChild(b);}
  const help=el('span');help.textContent='닫기는 창만 닫습니다. 실행 취소는 해당 작업의 취소 버튼을 사용하세요.';help.className='ss-work-hint';reviewShell.footer.appendChild(help);
  const openSection=label=>{target.SStructuresNativeUI?.setMode('elastic');bridge.designReviewPanel.open();const node=navEntries.find(x=>x[0]===label)?.[1];target.requestAnimationFrame(()=>{const b=[...nav.querySelectorAll('button')].find(n=>n.textContent===label);reveal(node,b);});};
  shortcuts.append(button('사용성·장기변형',()=>openSection('사용성')),button('보완안',()=>openSection('보완안')),button('도면·출력',()=>openSection('도면·출력')));
  for(const name of ['연결 접합부·기초 후보 조건 JSON','구간별 후보 허용 조건 JSON']){
   const field=review.querySelector(`[aria-label="${name}"]`);if(!field)continue;
   const box=el('details');box.className='ss-ux-advanced';box.appendChild(el('summary',name.replace(' JSON',' — 고급 입력')));
   field.before(box);const previous=box.previousElementSibling;if(previous?.tagName==='LABEL')box.appendChild(previous);box.appendChild(field);
  }
 }
 // Keep all legacy commands and references; only reduce their default visual density.
 if(elastic){const more=el('details');more.className='ss-ux-ribbon-more';more.appendChild(el('summary','결과 표시·보고·진단'));const content=el('div');content.className='ss-ux-more-body';more.appendChild(content);
  for(const id of ['elastic-analysis-results','elastic-results','elastic-reports','elastic-native-results','elastic-status']){const group=elastic.querySelector(`[data-ss-ribbon-group="${id}"]`);if(group)content.appendChild(group);}
  const status=doc.getElementById('ssWebMcpStatus');if(status)content.appendChild(status);
  elastic.appendChild(more);
  const current=el('span','결과 출처: 캔버스 간이 결과 / 저장 해석 결과는 결과 메뉴에서 선택');current.className='ss-work-hint';current.setAttribute('role','note');elastic.appendChild(current);
  for(const b of [...elastic.children].filter(x=>x.tagName==='BUTTON')){b.classList.add('ss-ribbon-command');}
 }
 // Expanded ribbons must leave legacy tool headers reachable below the toolbar.
 const legacyPanels=[...doc.querySelectorAll('.ss-elastic-workflow,[data-ss-workspace-panel]')];
 const recoverTools=()=>{
  const top=(doc.getElementById('subbar')?.getBoundingClientRect().bottom||48)+8;
  for(const panel of legacyPanels){const r=panel.getBoundingClientRect();if(!r.width||!r.height||target.getComputedStyle(panel).position!=='fixed')continue;
   const available=Math.max(80,target.innerHeight-top-8),nextTop=Math.max(top,Math.min(r.top,target.innerHeight-Math.min(r.height,available)-8));
   if(Math.abs(r.top-nextTop)>1)panel.style.top=nextTop+'px';
   if(r.height>available+1){panel.style.minHeight=Math.min(160,available)+'px';panel.style.height=available+'px';}
  }
 };
 if(target.ResizeObserver){const resize=new target.ResizeObserver(recoverTools);const subbar=doc.getElementById('subbar');if(subbar)resize.observe(subbar);}
 for(const panel of legacyPanels)new target.MutationObserver(recoverTools).observe(panel,{attributes:true,attributeFilter:['style','hidden','class']});
 target.addEventListener('resize',recoverTools);recoverTools();
 const label=(id,text)=>{const n=doc.getElementById(id);if(n){n.textContent=text;n.setAttribute('aria-label',text);}};
 label('ssRatioToggle','검정비');
 const scale=doc.getElementById('ssNativeResultScale');if(scale){scale.setAttribute('aria-label','변형 배율');for(const o of scale.options)if(o.value==='auto')o.textContent='자동';}
 const wb=doc.getElementById('ssPhase13WorkspaceOpen');wb?.setAttribute('aria-label','실무 워크벤치 열기');
 const sectionEditor=doc.getElementById('ssSectionEditor');if(sectionEditor)sectionEditor.style.zIndex='var(--ss-ux-panel-z)';
 const ratio=doc.getElementById('ssRatioToggle');if(ratio){ratio.setAttribute('aria-label','검정비 표시');ratio.title='검정비 표시';}
 const menu=doc.getElementById('menuDrop'),menuButton=doc.getElementById('menuBtn');
 if(menu){const status=el('p','개발 공개판 · 공학적 적합성 검증 미완료');status.id='ssReleaseStatus';status.className='ss-work-hint';status.setAttribute('role','note');menu.prepend(status);}
 if(menu&&menuButton){
  const updateMenu=()=>{if(!menu.classList.contains('show'))return;const a=menuButton.getBoundingClientRect();const r=anchorMenuRect(a,{width:menu.offsetWidth,height:menu.scrollHeight},{width:target.innerWidth,height:target.innerHeight});menu.style.left=r.left+'px';menu.style.top=r.top+'px';menu.style.maxHeight=r.height+'px';};
  new target.MutationObserver(updateMenu).observe(menu,{attributes:true,attributeFilter:['class']});target.addEventListener('resize',updateMenu);
  menuButton.addEventListener('click',()=>target.requestAnimationFrame(updateMenu));
  target.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.classList.contains('show')){menu.classList.remove('show');menuButton.focus();}});
  const names={'Calculation Package':'계산 패키지','Reset workspace':'창 배치 초기화'};
  for(const b of menu.querySelectorAll('button')){if(names[b.textContent.trim()]){b.textContent=names[b.textContent.trim()];b.setAttribute('aria-label',b.textContent);}}
  const groupLabel=(id,title)=>{const node=doc.getElementById(id);if(node?.parentNode===menu){const text=el('div',title);text.className='ss-ux-menu-label';node.before(text);}};
  groupLabel('mExportJson','프로젝트 파일');groupLabel('mExportMgt','호환 파일·화면 PDF');groupLabel('mClearPage','페이지 관리');groupLabel('mLoadCombos','설계·검토');groupLabel('mSettings','환경·도움말');
  const importFile=doc.getElementById('mImportJson');if(importFile){importFile.title=importFile.textContent;importFile.textContent='프로젝트 JSON 열기';}
  menu.appendChild(button('설계 창 위치 초기화',()=>{inputShell?.reset();reviewShell?.reset();}));
 }
 return {inputShell,reviewShell,preservationAtInstall:{originalCount:originalControls.length,disconnected:originalControls.filter(n=>!n.isConnected).map(n=>({id:n.id,label:n.getAttribute('aria-label')||n.textContent}))}};
}
