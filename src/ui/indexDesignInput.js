import { DESIGN_INPUT_UNITS, MEMBER_DESIGN_FIELDS } from '../modeling/designInputCommands.js';
import { DESIGN_BASIS_NUMERIC_FIELDS } from '../design/designBasisInput.js';

const labels = {
  'design-basis':'설계기준', 'generate-loads':'기준 하중 생성', 'node-mass':'절점 질량',
  'mass-source':'질량원', 'load-case':'하중 케이스', load:'하중', combination:'수동 조합',
  'generate-combinations':'규칙 조합 생성', 'member-assignment':'재료·단면 할당',
  'member-design':'부재 설계 속성', 'analysis-case':'해석 케이스',
};
const f=(key,label,kind='text',values)=>({key,label,kind,values});
const mode=f('mode','작업','select',['create','update']);
const optionLabels={create:'새로 만들기',update:'기존 값 수정',strength:'강도설계',allowable:'허용응력설계',service:'사용성',false:'아니요',true:'예',dead:'고정하중',live:'활하중',roofLive:'지붕 활하중',wind:'풍하중',seismic:'지진하중',snow:'적설하중',rain:'우수하중',temperature:'온도하중',other:'기타',static:'정적',modal:'모달',responseSpectrum:'응답스펙트럼',buckling:'좌굴',linearTha:'선형 시간이력',nodal:'절점력',udl:'등분포력',nmoment:'절점 모멘트',mmoment:'부재 모멘트'};
const basisLabels={floorArea:'기준 층 면적',roofArea:'지붕 면적',deadLoad:'고정하중',liveLoad:'활하중',roofLiveLoad:'지붕 활하중',windPressureX:'X 풍압',windPressureY:'Y 풍압',seismicCoefficientX:'X 지진계수',seismicCoefficientY:'Y 지진계수',seismicLiveLoadFactor:'지진 질량 활하중계수',accidentalEccentricityRatio:'우발 편심비'};
const identity=[mode,f('id','ID'),f('name','이름')];
const memberIds=f('memberIds','부재 ID (쉼표 구분)');
const caseFields={
  static:[f('comboId','조합 ID'),f('pDeltaMethod','P–Delta','select',['off','direct','legacy'])],
  modal:[f('modalModeCount','모드 수','number'),f('massSource','질량원 ID'),f('prestressed','초기응력','select',['false','true']),f('gravityCombinationId','중력 조합 ID')],
  responseSpectrum:[f('modalModeCount','모드 수','number'),f('massSource','질량원 ID'),f('method','조합법','select',['SRSS','CQC']),f('directions','방향 (x,y,z)'),f('dampingRatio','감쇠비','number'),f('scale','스펙트럼 배율 (m/s²)','number'),f('points','각 행: 주기(s), Sa(g)','rows')],
  buckling:[f('modeCount','모드 수','number'),f('maxIterations','최대 반복','number'),f('preloadCombinationId','선행 조합 ID')],
  linearTha:[f('integration','적분','select',['direct','modal']),f('modalModeCount','모드 수','number'),f('massSource','질량원 ID'),f('direction','방향','select',['x','y','z']),f('dampingRatio','감쇠비','number'),f('dt','시간 간격 (s)','number'),f('accelerations','가속도 값 (쉼표/줄 구분)','rows'),f('accelerationUnit','가속도 단위','select',['m/s2','g']),f('accelerationScale','가속도 배율','number')],
};
function fields(type,kind) {
  switch(type) {
    case 'design-basis': return [f('designMethod','설계법','select',['','strength','allowable']),...DESIGN_BASIS_NUMERIC_FIELDS.map(x=>f(x.id,`${basisLabels[x.id]} (${x.unit})`,'number'))];
    case 'generate-loads': return [];
    case 'node-mass': return [f('nodeIds','절점 ID (쉼표 구분)'),...['x','y','z'].map(x=>f(x,`${x} 질량 (kN·s²/m)`,'number'))];
    case 'mass-source': return [f('id','질량원 ID'),f('entries','각 행: 하중 케이스 ID, 계수','rows'),...['includeNodeMass','includeMemberMass','includeSelfWeight','activate'].map(x=>f(x,{includeNodeMass:'절점 질량 포함',includeMemberMass:'부재 질량 포함',includeSelfWeight:'자중 포함',activate:'활성 질량원으로 지정'}[x],'select',['false','true'])),f('gravity','중력 가속도 (m/s²)','number')];
    case 'load-case': return [...identity,f('loadType','하중 유형','select',['dead','live','roofLive','wind','seismic','snow','rain','temperature','other'])];
    case 'load': return [mode,f('id','하중 ID'),f('loadType','하중 유형','select',['nodal','udl','nmoment','mmoment']),f('targetId','절점 또는 부재 ID'),f('case','하중 케이스 ID'),f('dir','방향','select',['+x','-x','+y','-y','+z','-z']),f('magnitude','크기 (절점력 kN / 분포력 kN/m / 모멘트 kN·m)','number'),f('at','부재 모멘트 위치 (0~1, 해당 시)','number')];
    case 'combination': return [...identity,f('purpose','용도','select',['strength','service']),f('factors','각 행: 하중 케이스 ID, 계수','rows')];
    case 'generate-combinations': return [f('rulePackId','규칙 팩 ID'),f('method','설계법','select',['strength','allowable'])];
    case 'member-assignment': return [memberIds,f('matId','재료 ID'),f('secId','단면 ID')];
    case 'member-design': return [memberIds,...Object.entries(MEMBER_DESIGN_FIELDS).map(([key,unit])=>f(key,`${key} (${unit})`,'number'))];
    case 'analysis-case': return [...identity,f('kind','해석 종류','select',Object.keys(caseFields)),...(caseFields[kind||'static']||[])];
    default: throw new Error('지원하지 않는 입력 유형입니다.');
  }
}
const split=value=>String(value||'').split(/[,\s]+/).filter(Boolean);
const number=value=>{if(String(value??'').trim()===''||!Number.isFinite(Number(value))) throw new Error('유한한 숫자를 입력하세요.');return Number(value);};
function pairs(value) {
  const rows=String(value||'').split(/\r?\n/).filter(x=>x.trim()).map(row=>{
    const parts=row.trim().split(/[,\s]+/);if(parts.length!==2) throw new Error('각 행에 ID와 계수 두 값을 입력하세요.');return [parts[0],number(parts[1])];
  });
  if(new Set(rows.map(x=>x[0])).size!==rows.length) throw new Error('중복 행 ID입니다.');
  return rows;
}
// The form adapter only maps units and fields; all validation/mutation belongs
// to the same service used by SStructuresAgent.
export function designInputCommandFromFields(type,values) {
  const data={};
  for(const field of fields(type,values.kind)) if(values[field.key]!==undefined && String(values[field.key]).trim()!=='') {
    data[field.key]=field.kind==='number'?number(values[field.key]):String(values[field.key]).trim();
  }
  switch(type) {
    case 'design-basis': return {type,patch:data};
    case 'generate-loads': return {type};
    case 'node-mass': return {type,nodeIds:split(data.nodeIds),mass:['x','y','z'].map(x=>number(data[x])),unit:'kN.s2/m'};
    case 'mass-source': return {type,...data,entries:pairs(data.entries).map(([id,factor])=>({case:id,factor})),...Object.fromEntries(['includeNodeMass','includeMemberMass','includeSelfWeight','activate'].filter(k=>k in data).map(k=>[k,data[k]==='true']))};
    case 'load-case': return {type,...data};
    case 'load': {
      const nodal=['nodal','nmoment'].includes(data.loadType),moment=['nmoment','mmoment'].includes(data.loadType);
      if(data.at!==undefined && data.loadType!=='mmoment') throw new Error('위치는 부재 모멘트에만 적용됩니다.');
      return {type,mode:data.mode,value:{id:data.id,type:data.loadType,[nodal?'node':'member']:data.targetId,case:data.case,dir:data.dir,[moment?'M':nodal?'P':'w']:data.magnitude,unit:moment?'kN.m':nodal?'kN':'kN/m',...(data.loadType==='mmoment'?{at:data.at}:{})}};
    }
    case 'combination': return {type,...data,factors:Object.fromEntries(pairs(data.factors))};
    case 'generate-combinations': return {type,...data};
    case 'member-assignment': return {type,...data,memberIds:split(data.memberIds)};
    case 'member-design': {const {memberIds,...patch}=data;return {type,memberIds:split(memberIds),patch};}
    case 'analysis-case': {
      const {mode,id,name,kind,...settings}=data;
      if('prestressed' in settings) settings.prestressed=settings.prestressed==='true';
      if(kind==='responseSpectrum') {
        const {method,directions,dampingRatio,scale,points,...rest}=settings;
        return {type,mode,id,name,kind,settings:{...rest,spectrum:{method,directions:split(directions),dampingRatio,scale,points:pairs(points).map(([period,sa])=>({period:number(period),sa}))}}};
      }
      if(kind==='linearTha') {settings.accelerations=split(settings.accelerations).map(number);settings.timeUnit='s';}
      return {type,mode,id,name,kind,settings};
    }
  }
}

export function createDesignInputController(bridge) {
  return {
    preview(commands,requestId) { return bridge.previewDesignInputChanges({requestId,units:{...DESIGN_INPUT_UNITS},commands}); },
    apply(preview) { return bridge.applyDesignInputChanges(preview); },
    undo() { return bridge.undoDesignInputChanges(); },
  };
}

export function installIndexDesignInput(target,bridge) {
  const doc=target.document;
  const host=doc?.querySelector?.('[data-ss-ribbon-panel="elastic"]');
  if(!host || !doc.body) return null;
  const controller=createDesignInputController(bridge);
  const clear=node=>{for(const child of Array.from(node.children)) node.removeChild(child);node.textContent='';};
  const el=(tag,text)=>{const node=doc.createElement(tag);if(text) node.textContent=text;return node;};
  const button=(text,action)=>{const node=el('button',text);node.type='button';node.addEventListener('click',action);return node;};
  const panel=el('section');panel.id='ssDesignInputs';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-label','탄성설계 입력 변경');
  panel.style.cssText='position:fixed;inset:8% 8%;z-index:19000;background:#fff;color:#172338;border:1px solid #b6c3d6;border-radius:10px;padding:20px;overflow:auto;box-shadow:0 12px 50px #0005;font:14px system-ui';
  const style=el('style');style.textContent='#ssDesignInputs button{padding:8px 12px;margin:4px 6px 4px 0;border:1px solid #b6c3d6;border-radius:6px;background:#eef3fa;color:#183d68;cursor:pointer}#ssDesignInputs button:disabled{opacity:.45;cursor:default}#ssDesignInputs input,#ssDesignInputs select,#ssDesignInputs textarea{padding:8px;border:1px solid #b6c3d6;border-radius:5px;font:inherit;min-width:0}#ssDesignInputs h2{margin:0 0 10px}#ssDesignInputs p{margin:10px 0}';panel.appendChild(style);
  panel.appendChild(el('h2','탄성설계 입력 변경'));
  panel.appendChild(el('p','입력을 변경안에 추가한 뒤 미리보기를 확인하고 적용하세요. 적용 후 해석을 다시 실행해야 합니다.'));
  const type=el('select');type.setAttribute('aria-label','입력 유형');
  for(const [value,label] of Object.entries(labels)) {const option=el('option',label);option.value=value;type.appendChild(option);}
  type.value='design-basis';
  panel.appendChild(type);
  const form=el('div');form.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:15px 0';panel.appendChild(form);
  const queue=el('ol'),status=el('p'),review=el('pre');status.setAttribute('role','status');review.style.cssText='white-space:pre-wrap;max-height:30vh;overflow:auto;background:#f3f6fa;padding:12px';
  let commands=[],preview=null,inputs={};
  const apply=button('변경안 적용',()=>{const result=controller.apply(preview);show(result);if(result.ok) {commands=[];clear(queue);status.textContent='변경안을 적용했습니다. 해석을 다시 실행하세요.';}preview=null;apply.disabled=true;});apply.disabled=true;
  function show(result) {
    status.textContent=result.ok?(result.undoneRequestId?'설계 입력을 실행취소했습니다. 해석을 다시 실행하세요.':result.changed?'변경 내용을 확인했습니다.':'변경 사항이 없습니다.'):`차단: ${result.code||result.message}`;
    review.textContent=result.ok ? `${result.sourceIdentity?`원본: ${result.sourceIdentity.inputHash}\n`:''}영향 부재: ${(result.affectedMemberIds||[]).join(', ')}\n${(result.changes||[]).map(x=>`${x.path}: ${JSON.stringify(x.before)} → ${JSON.stringify(x.after)}`).join('\n')}\n${(result.warnings||[]).map(x=>x.message||x.code||String(x)).join('\n')}` : JSON.stringify(result.details||result.message||'',null,2);
  }
  function invalidate() {preview=null;apply.disabled=true;}
  function render(kind='static',preserved={}) {
    clear(form);inputs={};
    for(const field of fields(type.value,kind)) {
      const wrap=el('label',field.label);wrap.style.cssText='display:flex;flex-direction:column;gap:4px';
      const input=el(field.kind==='select'?'select':field.kind==='rows'?'textarea':'input');
      input.setAttribute('aria-label',field.label);input.dataset.field=field.key;
      if(field.kind==='select') for(const value of field.values) {const option=el('option',value?(optionLabels[value]||value):'변경 안 함');option.value=value;input.appendChild(option);}
      if(field.kind==='select') input.value=field.values[0];
      if(field.kind==='number') {input.type='number';input.step='any';}
      if(field.key in preserved) input.value=preserved[field.key];
      if(field.key==='kind') {input.value=kind;input.addEventListener('change',()=>render(input.value,Object.fromEntries(['id','name','mode'].map(key=>[key,inputs[key].value]))));}
      inputs[field.key]=input;wrap.appendChild(input);form.appendChild(wrap);
    }
  }
  type.addEventListener('change',()=>render());
  panel.appendChild(button('변경안에 추가',()=>{
    try {commands.push(designInputCommandFromFields(type.value,Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value]))));queue.appendChild(el('li',labels[type.value]));invalidate();status.textContent=`${commands.length}개 변경 대기 중`;} catch(e) {status.textContent=e.message;}
  }));
  panel.appendChild(button('비우기',()=>{commands=[];clear(queue);review.textContent='';invalidate();}));
  panel.appendChild(queue);
  panel.appendChild(button('변경안 미리보기',()=>{preview=controller.preview(commands,`ui-${target.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`}`);show(preview);apply.disabled=!preview.ok;}));
  panel.appendChild(apply);
  panel.appendChild(button('설계 입력 실행취소',()=>{show(controller.undo());invalidate();}));
  panel.appendChild(button('닫기',()=>{panel.hidden=true;}));panel.appendChild(status);panel.appendChild(review);
  doc.body.appendChild(panel);
  const notice=el('span','설계 입력 변경 · 이전 결과는 무효입니다. 해석을 다시 실행하세요.');
  notice.id='ssDesignInputStale';notice.hidden=true;notice.setAttribute('role','status');notice.style.cssText='color:#8a3600;white-space:normal;max-width:260px';host.appendChild(notice);
  host.appendChild(button('설계 입력 변경',()=>{bridge.elasticSetupWorkflow?.close?.();panel.hidden=false;}));
  render();
  return {...controller,open(){panel.hidden=false;},close(){panel.hidden=true;}};
}
