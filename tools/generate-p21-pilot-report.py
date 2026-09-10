"""Generate the Phase21 evidence report from recorded outputs, never solver reruns."""
from pathlib import Path
import json, hashlib, shutil
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A3, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from PIL import Image

root=Path.cwd(); run=root/'output/phase21/m6-browser-r2'; first=root/'output/phase21/m6-browser-r1'
evidence=root/'verification/evidence/phase21/m6/browser';evidence.mkdir(parents=True,exist_ok=True)
pdfdir=root/'output/pdf';pdfdir.mkdir(exist_ok=True)
node=json.loads((root/'output/phase21/m6-pilot-node-r4/summary.json').read_text())
downloads=json.loads((run/'download-manifest.json').read_text())
check=json.loads((run/'006-checkpoint-save.json').read_text())
sources=[]
for folder in [first,run,*[root/f'output/phase21/m6-browser-r{i}' for i in range(3,7)]]:
 for file in sorted(folder.glob('*.png')):
  dst=evidence/(folder.name+'-'+file.name);shutil.copy2(file,dst)
  sources.append({'path':dst.relative_to(root).as_posix(),'sha256':hashlib.sha256(dst.read_bytes()).hexdigest(),'sourceRun':folder.name})
(evidence/'capture-manifest.json').write_text(json.dumps(sources,indent=2)+'\n',encoding='utf-8')
(evidence/'download-manifest.json').write_text(json.dumps(downloads,indent=2)+'\n',encoding='utf-8')
sections=[
 ('검증 판정',[
  'M0-M5 계약 범위 구현과 집중 회귀를 완료했다. M6에서는 실제 내부 브라우저로 20개 1차해석, 강체 다이어프램 Direct X/Y, RC 예비 검토, 보고서 생성, IndexedDB 저장 및 재열기 복원을 수행했다. M6 전체 게이트와 M7 배포 완료 판정은 IMPLEMENTATION_STATUS.md 및 release-gate.json을 따른다.',
  '이 문서는 제품 시험 보고서다. 해당 건물의 구조안전 확인서나 최종 구조계산서가 아니다. 예비 검토 결과는 NG이며 최종 설계 전달은 차단 상태다. 외부 비교 2건·pilot 5건 및 독립 검토를 완료한 것으로 세지 않는다.']),
 ('입력과 적용 범위',[
  '태평동 4392 상가주택 3층 검토의 복원 입력을 사용했다. 원래 RUN-001 입력 hash와 동일하다고 주장하지 않는다. 대지 78.7㎡, 기존 건축면적 50.05㎡는 이전 조사 기록이고 신축 가정은 층당 36㎡ × 3층 = 108㎡다. 기존 연면적 117.5㎡와 EUM 0㎡ 불일치는 미확정으로 유지한다.',
  '24 절점, 39 부재, 138 하중, 20 하중조합, 층별 강체 다이어프램 3개. RC 400×400 기둥 18개와 300×500 보 21개, 기초 고정 및 Fc24·탄성 총단면 강성을 가정했다. 실제 지반·배근·접합부 상세 검증을 대체하지 않는다.',
  '층 고정하중 8 kPa, 지붕 6 kPa, 부재 자중은 명시 하중이며 엔진 자중 중복 적용을 껐다. 활하중·적설·풍압 1 kPa·지진계수 0.15 등은 구조계획 가정이다. 이 검증에서 법정 하중값을 새로 확정하지 않았다.',
  '제품 가져오기 후 inputHash: '+node['inputIdentity']['inputHash']]),
 ('수치 재시험',[
  'D-only 최대변위 1.390754 mm, 1.4D 1.947055 mm: 선형 배율 1.4 일치. X 방향 1차 9.425820 mm → Direct 9.505956 mm. Y 방향 1차 7.689735 mm → Direct 7.696129 mm. 강체 구속을 포함한 CPU Direct 수렴을 확인했다.',
  'RC 검토 5,724개: OK 4,968 / WARN 122 / NG 76 / NOT_CHECKED 120 / N_A 438. 실패 부재 13개. 지배 항목 BX11, MAX-EX-P, Direct X, rc-shear-y: 143.094973 / 84.323684 kN = 1.696972. 이 수치는 합격이 아니라 예비 설계 개선 필요를 뜻한다.',
  '20개 고유 조합마다 authoritative source를 하나 선택하고 X/Y 해당 조합에는 Direct 결과를 채택했다. 22개 해석 기록은 모두 보존했다. 1차와 Direct 동일 조합을 중복 집계하지 않는다.']),
 ('실제 발견한 장애와 수정',[
  'M6 r1: 전체 결과와 보고서 저장 시 MANAGED_MEMORY_BUDGET_EXCEEDED. 원인은 전체 clone·직렬화 staging의 중첩이다. 예산을 늘리지 않고 v2 조각 저장으로 수정했다. 메모리 ledger는 관리 데이터의 보수적 추정이며 브라우저 전체 heap 상한은 아니다.',
  'v2는 하나의 IndexedDB transaction에서 조각과 manifest를 확정하고, 조각별 SHA-256 및 read-back을 검사한다. 완료 결과와 보고서를 immutable하게 공유하며 복원 시 전체 결과를 또 복제하지 않는다. 이전 v1 읽기는 호환한다.',
  'M6 r2: 52,488,161 bytes 저장 및 reload 후 복원 성공. 저장 hash: '+check['sha256'],
  '실제 IndexedDB 합성 장애 시험에서 중간 중단 시 이전 저장본 보존, orphan 조각 없음, 덮어쓰기 세대 정리, 변조 거부, 임시 자원 ledger 0을 확인했다.',
  '복원 뒤 샘플 조합 목록과 상태 문구가 남는 UI 문제도 발견했다. 복원 시 조합 목록 재구성, 상태 초기화, 복원 review 연결을 수정했다. 커스텀 케이스는 해석 케이스 선택기로 확인한다.']),
 ('중간 규모 결함과 후속 후보',[
  '후속 후보 823591f에서는 정적 케이스가 암묵적으로 modal/RSA까지 실행하던 경로를 분리했다. 125절점 모델의 dynamics 결과만 206,636,022 bytes였고 catalog 등록 시 복사본과 겹쳐 관리 예산을 초과했다. 실패 원인은 계산 비수렴이 아닌 결과 등록이다.',
  '수정 후 Node 중간 규모 1차와 Direct 모두 등록 성공. 전체 324.04초, 관리 데이터 peak 125,063,936 bytes. 프로세스 최대 RSS 1,146,408 KiB는 관리 ledger와 다른 값이며, 동시 시험이 있어 성능 인증 수치가 아니다. Direct 진행 통지가 수분간 끊기는 문제는 추가 검토 대상이다.',
  '같은 후보의 Node 상가주택 r5도 22회 해석·보고서 전체 SHA·저장·복원 통과. r4와 변위·반력·부재력 66개 비어 있지 않은 데이터 묶음의 SHA가 동일했다. IAB r1/r2는 이전 후보 기록이며 r3는823591f의 복원·3회 재해석·61MB 재저장/재열기 기록이다. 이들을 새 후보의 전체 Chrome 비교로 소급하지 않는다.']),
 ('보고서와 메모리 관측',[
  '실제 복원된 UI에서 HTML·JSON·CSV를 내려받아 native WebMCP artifact manifest의 전체 SHA-256과 일치함을 확인했다. download 이벤트는 timeout이었지만 실제 다운로드 파일은 존재했고 바이트와 hash를 검증했다.',
  'Node 제품 Worker 전체 pilot r4: 저장/복원 후 입력 hash와 세 원본 보고서 hash 일치. peak managed 208,710,774 bytes, 최대 RSS 889,132 KiB. 단일 실행 RSS를 반복 leak 없음의 증거로 사용하지 않는다.',
  '제품 자동 PDF는 PDF_EXPORT_BLOCKED. export adapter, 필수 7개 figure 등록, 보고서 qualification이 미충족이다. 이 별도 캡처 PDF를 만들었다고 제품 자동 PDF를 지원으로 표시하지 않는다.']),
 ('가능·제한·추가 검증',[
  '확인: 제품 입력 가져오기, 조회 중 입력 보존, 단일 조합 실행·선택, CPU 강체 다이어프램 Direct, RC 예비 검토 집계, 원본 3포맷 다운로드, 실제 저장·재열기·변조 검출.',
  '제한: 실제 GPU 강체 Direct 미자격, 최종 RC 배근 설계·지반·접합 상세 미검증, 자동 PDF 차단. Chrome 동일 모델 UI 비교는 확장 프로그램 파일 URL 권한 때문에 아직 완료하지 못했다.',
  '125 절점/260 부재/750 full DOF의 중간 규모 반복·취소 시험과 Win/Ubuntu 동일 후보 회귀는 별도 증거로 기록한다. 미실행·미측정 항목에 PASS를 부여하지 않는다. 최종 상태는 상태 문서 및 배포 gate를 우선한다.',
  '화면은 원본 viewport 캡처이며 아래 각 경로와 SHA는 capture-manifest.json에 보존한다. r1은 저장 수정 전 단계 기록, r2는 저장 수정·복원 재시험 기록이다.'])]
sections.append(('최신 후보와 남은 게이트',[
 '202d293 Windows 전체 회귀 124/124 통과. 사용자 정의 결과 케이스의 리본 연결과 현재 상태 접근성을 수정했다. WebMCP 원본 변위 0.009505956274493006 m를 화면 단위 mm와 분리하여 표시한다. 원 수치의 스케일을 바꾸지 않았다.',
 'Direct 증폭 표시는 선택 조합의 절점 성분 최대 증폭이다. 화면 1.116은 서로 다른 위치일 수 있는 전역 최대변위 두 값의 비율이 아니다. 선택 조합 대신 전체 최대 증폭을 표시하던 경로도 수정했다.',
 'IAB 중간 규모 125절점·260부재: 예열 3회와 측정 5회의 FIRST/Direct 해석 모두 통과하고 매회 dispose 후 관리 ledger 0. Peak 125064722 bytes. 로드된 수치 모듈은 823591f이며 202d293까지 해당 모듈 변경 없음. 전체 renderer/Worker 합산 heap 자격은 미완료다.',
 '결과 준비 단계 취소는 15초 단계 대기에서 두 번 실패하여 미검증으로 보존했다. 초기 Worker 실행 후 취소는 별도 시험 범위다. Chrome 동일 pilot·Ubuntu CI·전체 메모리 검증과 공개 승인 조건이 남았다. M6 일부 미충족, M7 로컬 패키지 준비 완료/공개 배포 차단이다.',
 'r4는 리본/접근성 수정과 단위 결함 발견, r5는 단위 수정, r6는 증폭 설명과 반복/취소 시험의 원본 화면이다. 과거 화면의 결함을 최신 정상 동작으로 표시하지 않는다. 제품 자동 PDF 및 최종 구조설계 자격은 여전히 차단 상태다.']))
md=['# Phase21 상가주택 실제 업무 흐름 재시험 보고서','', '시험일: 2026-09-10 시작 · CPU / Windows · 개발 검증 · 최종 설계 승인 아님','']
for title,paras in sections:
 md+=['## '+title,'']+sum(([p,''] for p in paras),[])
md+=['## 원본 보고서 파일 검증','','| 포맷 | UTF-8 bytes | SHA-256 |','|---|---:|---|']
for item in downloads:md.append(f"| {item['format']} | {item['bytes']} | `{item['sha256']}` |")
md+=['','## 단계별 화면','']
for s in sources:md+=['### '+Path(s['path']).stem,'',f"![실제 화면](../../{s['path']})",'']
(root/'docs/phase21/PILOT_RETEST_REPORT.md').write_text('\n'.join(md),encoding='utf-8')
pdfmetrics.registerFont(TTFont('Korean','C:/Windows/Fonts/malgun.ttf'))
pdfmetrics.registerFont(TTFont('KoreanBold','C:/Windows/Fonts/malgunbd.ttf'))
pdf=pdfdir/'S-Structures_Phase21_Pilot_Retest.pdf';c=canvas.Canvas(str(pdf),pagesize=landscape(A3));w,h=landscape(A3)
c.setTitle('S-Structures Phase21 실제 업무 흐름 재시험');c.setAuthor('S-Structures verification')
style=ParagraphStyle('body',fontName='Korean',fontSize=17,leading=29,wordWrap='CJK')
page=0
def header(title):
 global page
 page+=1;c.setFillColorRGB(.06,.17,.29);c.rect(0,h-105,w,105,fill=1,stroke=0);c.setFillColorRGB(1,1,1);c.setFont('KoreanBold',25);c.drawString(48,h-58,title);c.setFont('Korean',12);c.drawString(48,h-84,'S-STRUCTURES / PHASE21 / SOFTWARE VERIFICATION / 구조설계 승인 아님');c.setFillColorRGB(.1,.17,.24)
def end():
 c.setFont('Korean',11);c.drawString(48,26,'2026-09-10 시작 | 실제 실행 기록·원본 캡처 | 미충족 항목은 상태 문서에서 추적');c.drawRightString(w-48,26,str(page));c.showPage()
for title,paras in sections:
 header(title);y=h-140
 for text in paras:
  p=Paragraph(escape(text),style);_,ph=p.wrap(w-96,y-70)
  if y-ph<60:end();header(title+' (계속)');y=h-140
  p.drawOn(c,48,y-ph);y-=ph+25
 end()
for s in sources:
 file=root/s['path'];header(Path(s['path']).stem.replace('m6-browser-',''))
 iw,ih=Image.open(file).size;scale=min((w-96)/iw,(h-190)/ih);dw,dh=iw*scale,ih*scale
 c.drawImage(str(file),(w-dw)/2,70+(h-190-dh)/2,width=dw,height=dh)
 c.setFont('Korean',10);c.drawString(48,48,'원본 SHA-256: '+s['sha256']);end()
c.save();print(json.dumps({'pdf':str(pdf),'pages':page,'screenshots':len(sources)},ensure_ascii=False))
