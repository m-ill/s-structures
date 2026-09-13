import {installFloatingPanel,clampFloatingRect} from './floatingPanel.js';
export function defaultWorkRect(width,height,top=56){
 const w=Math.max(240,width-32),h=Math.max(160,height-top-24);
 return clampFloatingRect({left:(width-Math.min(1180,w))/2,top:top+12,width:Math.min(1180,w),height:Math.min(780,h)}, {left:8,top:Math.min(top+8,Math.max(8,height-160)),width:Math.max(0,width-16),height:Math.max(0,height-top-16)},{minWidth:240,minHeight:160});
}
export function anchorMenuRect(anchor,size,viewport){
 const width=Math.min(size.width,Math.max(0,viewport.width-16)),height=Math.min(size.height,Math.max(0,viewport.height-16));
 return {left:Math.max(8,Math.min(anchor.left,viewport.width-width-8)),top:Math.max(8,Math.min(anchor.bottom+6,viewport.height-height-8)),width,height};
}
// Moves existing controls, retaining event listeners and owner-held references.
export function installWorkShell(target,panel){
 if(panel.__uxShell)return panel.__uxShell;
 const doc=target.document,el=(tag,cls)=>{const n=doc.createElement(tag);n.className=cls;return n;};
 const body=el('div','ss-work-body'),header=el('header','ss-work-header'),footer=el('footer','ss-work-footer');
 for(const child of [...panel.childNodes])body.appendChild(child);
 const title=body.querySelector('h2');if(title)header.appendChild(title);
 const hint=el('span','ss-work-hint');hint.textContent='제목을 끌어 이동';header.appendChild(hint);
 const reset=el('button','');reset.type='button';reset.textContent='위치 초기화';header.appendChild(reset);
 const close=el('button','');close.type='button';close.textContent='×';close.setAttribute('aria-label',`${panel.getAttribute('aria-label')} 닫기`);header.appendChild(close);
 panel.classList.add('ss-work-window');panel.style.cssText='';panel.append(header,body,footer);
 const placement=()=>{const r=defaultWorkRect(target.innerWidth,target.innerHeight,doc.getElementById('topbar')?.getBoundingClientRect().bottom||48);for(const k of ['left','top','width','height'])panel.style[k]=r[k]+'px';};
 placement();
 const floating=installFloatingPanel(target,panel,{storageKey:`s-structures:ux-v1:${panel.id}`,handleSelector:'.ss-work-header',allowPanelHandle:false,minWidth:240,minHeight:160,maxWidth:1600,maxHeight:1400,viewportPadding:8});
 // Viewport recovery must not overwrite the placement chosen by the user.
 const storageKey=`s-structures:ux-v1:${panel.id}`,baseClamp=floating.clamp.bind(floating);
 floating.clamp=()=>{let raw=null;try{raw=target.localStorage.getItem(storageKey);if(raw){const preferred=JSON.parse(raw);for(const k of ['left','top','width','height'])if(Number.isFinite(preferred[k]))panel.style[k]=preferred[k]+'px';}}catch{}
  const result=baseClamp();try{if(raw===null)target.localStorage.removeItem(storageKey);else target.localStorage.setItem(storageKey,raw);}catch{}return result;
 };
 let trigger=null,wasHidden=panel.hidden;
 const visible=()=>{if(panel.hidden===wasHidden)return;wasHidden=panel.hidden;if(panel.hidden){if(target.__ssActiveWorkPanel===panel)target.__ssActiveWorkPanel=null;if(trigger?.isConnected)trigger.focus();return;}target.__ssActiveWorkPanel=panel;trigger=doc.activeElement;floating.clamp();close.focus({preventScroll:true});};
 close.addEventListener('click',()=>{panel.hidden=true;});
 reset.addEventListener('click',()=>{floating.reset();placement();floating.clamp();});
 const observer=new target.MutationObserver(visible);observer.observe(panel,{attributes:true,attributeFilter:['hidden']});
 panel.addEventListener('pointerdown',()=>{target.__ssActiveWorkPanel=panel;});
 target.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&!doc.getElementById('menuDrop')?.classList.contains('show')&&target.__ssActiveWorkPanel===panel&&!panel.hidden){panel.hidden=true;e.preventDefault();}});
 const api={body,header,footer,reset:()=>reset.click(),reveal(node){if(!node)return;for(let n=node.parentElement;n&&n!==body;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;body.scrollTop+=node.getBoundingClientRect().top-body.getBoundingClientRect().top-12;node.setAttribute('tabindex','-1');node.focus({preventScroll:true});}};
 panel.__uxShell=api;return api;
}
