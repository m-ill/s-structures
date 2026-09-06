import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { VERIFICATION_REPOSITORY_PATHS } from '../workspace-paths.mjs';

const resultPath = `${VERIFICATION_REPOSITORY_PATHS.strix21Runs}/first-batch-results.json`;
const artifact = JSON.parse(await readFile(resultPath, 'utf8'));
const determinismPath = `${VERIFICATION_REPOSITORY_PATHS.validationEvidence}/phase15/p15-m9-determinism-evidence.json`;
const determinism = JSON.parse(await readFile(determinismPath, 'utf8'));
const determinismAccepted = determinism.status === 'PASS'
  && determinism.deterministic === true
  && determinism.runCount === determinism.expectedRunCount
  && determinism.runCount === 3
  && determinism.calculationHash === artifact.calculationHash
  && determinism.resultHash === artifact.resultHash;
if (!determinismAccepted) {
  throw new Error('[REPORT_BLOCKED] Phase 15 determinism evidence does not match the benchmark artifact.');
}
const outputDirectory = 'output/pdf';
await mkdir(outputDirectory, { recursive: true });

const catalogStatus = [
  ...artifact.cases.map((row) => ({ id: row.id, status: row.status, reason: caseNote(row) })),
  { id: 'TH1', status: 'INPUT_BLOCKED', reason: '공개 PDF에 동일 지진파 시계열 샘플이 없어 원 사례 재현 불가' },
  { id: 'SM5b', status: 'INPUT_BLOCKED', reason: '층 질량과 회전관성의 완전한 수치가 공개 PDF에 없음' },
  { id: 'SM6', status: 'INPUT_BLOCKED', reason: '18개 파이프 부재의 정확한 절점 좌표와 연결표가 없음' },
  { id: 'SR1', status: 'INPUT_BLOCKED', reason: '집중질량 m의 절대값과 응답스펙트럼 절점값이 없음' },
  { id: 'SR2', status: 'INPUT_BLOCKED', reason: '편심 질량·단면·응답스펙트럼의 전체 입력표가 없음' },
  { id: 'SR2b', status: 'INPUT_BLOCKED', reason: 'L형 배치와 El-Centro 스펙트럼 전체 절점값이 없음' },
  { id: 'SP1', status: 'READY_NOT_RUN', reason: 'CSI 힌지와 S-Structures production hinge의 중립 매핑 fixture 추가 필요' },
  { id: 'SB12', status: 'UNSUPPORTED', reason: '경사진 일반 6축 twoNodeLink와 beta-angle 변환 요소 없음' },
  { id: 'SH1', status: 'UNSUPPORTED', reason: 'STRIX 전용 DcrPMMHinge3d P-M-M 요소 없음' },
].sort((a, b) => benchmarkOrder(a.id) - benchmarkOrder(b.id));

const reportDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date(artifact.completedAt));
const markdownPath = `${VERIFICATION_REPOSITORY_PATHS.strix21Runs}/S-Structures_STRIX21_1차_비교보고서.md`;
const texPath = 'tmp/pdfs/strix21-comparison/S-Structures_STRIX21_1차_비교보고서.tex';
await mkdir('tmp/pdfs/strix21-comparison', { recursive: true });
await writeFile(markdownPath, markdownReport(), 'utf8');
await writeFile(texPath, latexReport(), 'utf8');
console.log(JSON.stringify({ ok: true, resultPath, markdownPath, texPath, pdfPath: `${outputDirectory}/S-Structures_STRIX21_1차_비교보고서.pdf` }, null, 2));

function markdownReport() {
  const lines = [
    '# S-Structures STRIX 21개 검증군 Phase 15 보정 비교 보고서',
    '',
    `- 실행일: ${reportDate}`,
    `- 결과 artifact: \`${artifact.artifactHash}\``,
    `- 계산 hash: \`${artifact.calculationHash}\``,
    `- 결과 hash: \`${artifact.resultHash}\``,
    `- 실행기록 hash: \`${artifact.runRecordHash}\``,
    `- 결정론 검증: ${determinism.runCount}회 반복 ${determinism.status}`,
    `- 결정론 증거: \`${determinism.evidenceHash}\``,
    '- 실행엔진: S-Structures 자체 결정론적 해석엔진',
    '- 외부 solver runtime: 사용하지 않음',
    '',
    '## 요약',
    '',
    `실제 실행 ${artifact.summary.attempted}개 중 PASS ${artifact.summary.PASS}개, CUSTOM_PASS ${artifact.summary.CUSTOM_PASS}개, REVIEW ${artifact.summary.REVIEW}개, BLOCKED ${artifact.summary.BLOCKED}개다. 총 ${artifact.summary.metricCount}개 수치 중 ${artifact.summary.metricPassCount}개가 각 사례의 사전 허용오차를 통과했다.`,
    '',
    '| ID | 상태 | 통과/전체 | 최대 기준오차 | 비고 |',
    '| --- | --- | ---: | ---: | --- |',
    ...artifact.cases.map((row) => `| ${row.id} | ${row.status} | ${row.metrics.filter((metric) => metric.passed).length}/${row.metrics.length} | ${formatPercent(maxError(row))} | ${caseNote(row)} |`),
    '',
    '## 전체 21개 처리 상태',
    '',
    '| ID | 상태 | 근거 |',
    '| --- | --- | --- |',
    ...catalogStatus.map((row) => `| ${row.id} | ${row.status} | ${row.reason} |`),
    '',
    '## 상세 수치',
    '',
  ];
  for (const row of artifact.cases) {
    lines.push(`### ${row.id} - ${row.status}`, '', '| 응답 | S-Structures | 기준값 | STRIX 공개값 | 기준오차 | 판정 |', '| --- | ---: | ---: | ---: | ---: | --- |');
    for (const metric of row.metrics) lines.push(`| ${metric.quantity} (${metric.unit}) | ${formatNumber(metric.sStructures)} | ${formatNumber(metric.reference)} | ${formatNumber(metric.strix)} | ${formatPercent(metric.errorVsReferencePct)} | ${metric.passed ? 'PASS' : 'REVIEW'} |`);
    lines.push('', `- 모델 hash: \`${row.modelHash}\``, `- 결과 hash: \`${row.resultHash}\``, `- 해석경로: ${row.audit.formulation}`);
    const blockers = qualificationBlockers(row);
    if (blockers.length > 0) lines.push(`- 자격 차단 사유: ${blockers.map((code) => `\`${code}\``).join(', ')}`);
    lines.push('');
  }
  lines.push('## 판정 제한', '', '- MIDAS 값은 아직 실제 실행값이 없으므로 비교표에 넣지 않았다.', '- STRIX 값은 공개 보고서의 전사값이며 STRIX 바이너리를 이 컴퓨터에서 재실행한 값이 아니다.', '- REVIEW는 수치 허용오차 미충족, BLOCKED는 수치 통과와 별개로 필수 qualification 증빙이 미완료된 상태다. 둘 다 릴리스 또는 설계전이를 허용하지 않는다.', '- 속도 비교는 동일 모델·동일 메시·동일 출력 요청 조건이 아직 충족되지 않아 수행하지 않았다.', '');
  return `${lines.join('\n')}\n`;
}

function latexReport() {
  const caseRows = artifact.cases.map((row) => `${tex(row.id)} & ${statusCell(row.status)} & ${row.metrics.filter((metric) => metric.passed).length}/${row.metrics.length} & ${tex(formatPercent(maxError(row)))} & ${tex(caseNote(row))} \\\\`).join('\n');
  const catalogRows = catalogStatus.map((row) => `${tex(row.id)} & ${statusCell(row.status)} & ${tex(row.reason)} \\\\`).join('\n');
  const details = artifact.cases.map((row) => `
\\Needspace{${row.id === 'SB5' ? 20 : 12}\\baselineskip}
\\section{${tex(row.id)} - ${tex(row.status)}}
\\noindent\\textbf{해석경로}: ${tex(row.audit.formulation)}\\par
\\noindent\\textbf{모델 hash}: \\texttt{${tex(row.modelHash.slice(0, 32))}...}\\par
\\smallskip
\\begin{longtable}{>{\\raggedright\\arraybackslash}p{0.30\\textwidth}rrrrc}
\\toprule
응답 & S-Structures & 기준값 & STRIX & 오차(\\%) & 판정 \\\\
\\midrule
\\endfirsthead
\\toprule 응답 & S-Structures & 기준값 & STRIX & 오차(\\%) & 판정 \\\\ \\midrule
\\endhead
${row.metrics.map((metric) => `${tex(metric.quantity)} (${tex(metric.unit)}) & ${tex(formatNumber(metric.sStructures))} & ${tex(formatNumber(metric.reference))} & ${tex(formatNumber(metric.strix))} & ${tex(formatPercent(metric.errorVsReferencePct).replace('\\%', ''))} & ${metric.passed ? '\\textcolor{PassGreen}{PASS}' : '\\textcolor{ReviewOrange}{REVIEW}'} \\\\`).join('\n')}
\\bottomrule
\\end{longtable}
${diagnosisTex(row)}
`).join('\n');

  return `\\documentclass[10pt,a4paper]{article}
\\usepackage[margin=17mm,headheight=15pt]{geometry}
\\usepackage{fontspec}
\\setmainfont{Malgun Gothic}
\\setsansfont{Malgun Gothic}
\\usepackage{xcolor,booktabs,longtable,array,tabularx,fancyhdr,hyperref,enumitem,colortbl}
\\makeatletter
\\newcommand{\\Needspace}[1]{%
  \\begingroup
  \\setlength{\\dimen@}{#1}%
  \\vskip\\z@\\@plus\\dimen@
  \\penalty -100
  \\vskip\\z@\\@plus -\\dimen@
  \\vskip\\dimen@
  \\penalty 9999
  \\vskip -\\dimen@
  \\vskip\\z@skip
  \\endgroup}
\\makeatother
\\definecolor{DcrBlue}{HTML}{123A63}
\\definecolor{LightBlue}{HTML}{EAF2F8}
\\definecolor{PassGreen}{HTML}{138A4B}
\\definecolor{ReviewOrange}{HTML}{C46A00}
\\definecolor{BlockRed}{HTML}{B42318}
\\definecolor{Muted}{HTML}{5D6D7E}
\\hypersetup{colorlinks=true,linkcolor=DcrBlue,urlcolor=DcrBlue}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{S-Structures Verification}
\\rhead{STRIX 21개 검증군 1차 비교}
\\cfoot{\\thepage}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{5pt}
\\setlength{\\tabcolsep}{4.5pt}
\\emergencystretch=3em
\\renewcommand{\\arraystretch}{1.25}
\\XeTeXlinebreaklocale "ko"
\\XeTeXlinebreakskip=0pt plus 1pt
\\begin{document}
\\begin{center}
{\\Huge\\bfseries\\color{DcrBlue} S-Structures 수치 검증 보고서}\\par
\\vspace{3mm}
{\\Large STRIX 21개 공개 검증군 - Phase 15 보정 실행}\\par
\\vspace{5mm}
{\\large ${tex(reportDate)}}\\par
\\end{center}
\\vspace{5mm}
\\colorbox{LightBlue}{\\parbox{0.95\\textwidth}{
\\textbf{핵심 결과}\\quad 실제 실행 ${artifact.summary.attempted}개: PASS ${artifact.summary.PASS}, CUSTOM PASS ${artifact.summary.CUSTOM_PASS}, REVIEW ${artifact.summary.REVIEW}, BLOCKED ${artifact.summary.BLOCKED}. 총 ${artifact.summary.metricCount}개 수치 중 ${artifact.summary.metricPassCount}개가 사전 허용오차를 통과했다. 외부 solver runtime은 사용하지 않았다.
}}

\\section{목적과 판정 원칙}
본 보고서는 동결된 공개 검증 조건을 S-Structures 자체 결정론적 해석엔진에 옮겨, 독립 기준값과 STRIX 공개값에 각각 비교한 Phase 15 보정 실행 기록이다. STRIX 공개값을 유일한 정답으로 간주하지 않으며, MIDAS는 실제 동일 모델 실행값이 없으므로 수치 순위에 포함하지 않는다.

\\begin{itemize}[leftmargin=6mm]
\\item PASS: 해당 사례의 모든 필수 수치가 사전 허용오차 이내
\\item REVIEW: 계산은 완료됐으나 하나 이상의 필수 수치가 허용오차 초과
\\item BLOCKED: 수치는 통과했으나 필수 qualification 증빙 또는 gate가 미완료
\\item CUSTOM PASS: S-Structures 고유 기준 통과이며 STRIX 동일 검증 주장 아님
\\item INPUT BLOCKED: 엔진 기능은 있으나 공개 입력이 불완전하여 임의 추정 금지
\\item UNSUPPORTED: 동일 요소 또는 알고리즘이 없음
\\end{itemize}

\\section{실행 결과 요약}
\\begin{longtable}{@{}p{0.09\\textwidth}p{0.15\\textwidth}p{0.10\\textwidth}p{0.145\\textwidth}p{0.405\\textwidth}@{}}
\\toprule ID & 상태 & 통과/전체 & 최대 기준오차 & 비고 \\\\ \\midrule
${caseRows}
\\bottomrule
\\end{longtable}

\\section{전체 21개 처리 상태}
\\begin{longtable}{p{0.10\\textwidth}p{0.18\\textwidth}p{0.62\\textwidth}}
\\toprule ID & 상태 & 근거 \\\\ \\midrule
${catalogRows}
\\bottomrule
\\end{longtable}

${details}

\\section{핵심 결론}
\\begin{enumerate}[leftmargin=7mm]
\\item 공개 기준 11개 사례는 artifact에 기록된 수치와 필수 gate만으로 판정하며, 보고서는 artifact 밖의 수치나 원인을 생성하지 않는다.
\\item SB2·SB3·SB5는 정련 이력과 희소행렬 저장 진단을 포함하고, SB6은 hard simply-supported 경계계약으로 실행됐다.
\\item SB7은 구조단력과 지반평형단력을 분리한 station recovery를 사용한다.
\\item P3S2-SS는 S-Structures 고유 안정화 qualification이며 STRIX P3S2와 동일한 요소·변수라는 주장이 아니다.
\\end{enumerate}

\\section{제한 및 다음 실행}
MIDAS 실제 동일 모델 결과는 아직 없고, STRIX 값은 공개 보고서의 전사값이다. 입력이 불완전한 사례는 모델을 추정하지 않았다. 속도 비교는 동일 모델·메시·출력 요청과 측정환경이 동결된 뒤 별도로 수행한다.

\\section{증거와 재현 정보}
\\begin{itemize}[leftmargin=6mm]
\\item 결과 JSON: \\texttt{verification/benchmarks/strix21/runs/first-batch-results.json}
\\item artifact hash: \\texttt{${tex(artifact.artifactHash)}}
\\item 계산 hash: \\texttt{${tex(artifact.calculationHash)}}
\\item 결과 hash: \\texttt{${tex(artifact.resultHash)}}
\\item 실행기록 hash: \\texttt{${tex(artifact.runRecordHash)}}
\\item 결정론 검증: ${tex(determinism.runCount)}회 반복 ${determinism.status === 'PASS' ? '\\textcolor{PassGreen}{PASS}' : '\\textcolor{BlockRed}{BLOCKED}'}
\\item 결정론 증거 JSON: \\texttt{${tex(determinismPath)}}
\\item 결정론 증거 hash: \\texttt{${tex(determinism.evidenceHash)}}
\\item 원자료: \\texttt{STRIX-verification-21/benchmark-catalog.json}, 개별 공개 PDF
\\item 실행기: \\texttt{node tools/run-strix21-first-batch.mjs}
\\item 외부 solver runtime: 없음
\\end{itemize}
\\end{document}
`;
}

function diagnosisTex(row) {
  if (row.id === 'P3S2-SS') return '\\textbf{범위}: S-Structures 고유 안정화 qualification이며 STRIX P3S2 동일성 또는 상용 solver 교차검증을 뜻하지 않는다.';
  const blockers = qualificationBlockers(row);
  if (blockers.length > 0) {
    return `\\textbf{Artifact 판정}: 수치 ${tex(row.metrics.filter((metric) => metric.passed).length)}/${tex(row.metrics.length)}개는 통과했으나 qualification은 BLOCKED다. 차단 사유: ${tex(blockers.join(', '))}.`;
  }
  return `\\textbf{Artifact 판정}: ${tex(row.metrics.filter((metric) => metric.passed).length)}/${tex(row.metrics.length)}개 수치 통과, 최대 절대 기준오차 ${tex(formatPercent(maxError(row)))}. 해석경로는 ${tex(row.audit.formulation)}이다.`;
}

function statusCell(status) {
  const color = status === 'PASS' || status === 'CUSTOM_PASS' ? 'PassGreen' : status === 'REVIEW' || status === 'READY_NOT_RUN' ? 'ReviewOrange' : 'BlockRed';
  return `\\textcolor{${color}}{${tex(status)}}`;
}

function caseNote(row) {
  if (row.id === 'P3S2-SS') return 'S-Structures 고유 안정화 qualification; STRIX 동일성 주장 아님';
  const blockers = qualificationBlockers(row);
  if (blockers.length > 0) return `${row.audit.formulation}; 수치 ${row.metrics.filter((metric) => metric.passed).length}/${row.metrics.length} PASS; qualification BLOCKED (${blockers.join(', ')})`;
  return `${row.audit.formulation}; ${row.metrics.filter((metric) => metric.passed).length}/${row.metrics.length} mandatory metrics ${row.status}`;
}

function qualificationBlockers(row) {
  const qualification = row.audit?.phase15Qualification;
  if (qualification?.status !== 'BLOCKED') return [];
  const explicit = Array.from(qualification.reasonCodes || []);
  const gated = Array.from(qualification.mandatoryGates || [])
    .filter((gate) => gate?.status === 'BLOCKED')
    .map((gate) => gate.reasonCode)
    .filter(Boolean);
  return [...new Set([...explicit, ...gated])];
}

function benchmarkOrder(id) {
  const order = ['SB1', 'SB2', 'SB3', 'SB5', 'SB6', 'SB7', 'SB8', 'SB9', 'SB10', 'SB12', 'PD1', 'SM5', 'SM5b', 'SM6', 'SR1', 'SR2', 'SR2b', 'P3S2-SS', 'SP1', 'SH1', 'TH1'];
  return order.indexOf(id);
}

function maxError(row) { return Math.max(0, ...row.metrics.map((metric) => Math.abs(metric.errorVsReferencePct || 0))); }
function formatPercent(value) { return value == null ? '-' : `${formatNumber(value)}%`; }
function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  const number = Number(value);
  if (number === 0) return '0';
  if (Math.abs(number) >= 1e6 || Math.abs(number) < 1e-4) return number.toExponential(5);
  return Number(number.toPrecision(6)).toString();
}
function tex(value) {
  return String(value ?? '-')
    .replace(/([#$%&_{}])/g, '\\$1')
    // Qualification reason codes are intentionally long and underscore-delimited.
    // Give TeX legal break points without changing the visible evidence code.
    .replace(/\\_/g, '\\_\\allowbreak{}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}
