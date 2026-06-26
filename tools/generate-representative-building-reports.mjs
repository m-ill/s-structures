import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  REPRESENTATIVE_BUILDINGS_VERSION,
  analyzeModel,
  createAllRepresentativeBuildingModels,
  createHtmlReport,
  summarizeRepresentativeBuilding,
} from '../src/index.js';

const outputRoot = path.resolve('reports/representative-buildings');

const generated = [];
for (const { spec, model } of createAllRepresentativeBuildingModels()) {
  const analysis = analyzeModel(model);
  const summary = summarizeRepresentativeBuilding(spec, model, analysis);
  if (!analysis.ok) {
    throw new Error(`${spec.id} analysis failed: ${JSON.stringify(summary.analysis.errors, null, 2)}`);
  }
  for (const [comboId, combo] of Object.entries(summary.analysis.combos)) {
    if (!combo.ok) throw new Error(`${spec.id} ${comboId} combination failed.`);
    if (!(combo.equilibriumResidual < 1e-8)) {
      throw new Error(`${spec.id} ${comboId} equilibrium residual too high: ${combo.equilibriumResidual}`);
    }
  }

  const folder = path.join(outputRoot, spec.id);
  await mkdir(folder, { recursive: true });
  const report = createHtmlReport(model, analysis, {
    title: `${spec.name} - Elastic Analysis Report`,
    limitations: [
      'Representative model generated for workflow verification.',
      'Wall, slab, mat, and transfer plate behavior is represented only through equivalent frame members where applicable.',
    ],
  });
  await writeJson(path.join(folder, 'model.json'), model);
  await writeJson(path.join(folder, 'analysis-summary.json'), summary);
  await writeFile(path.join(folder, 'report.html'), report.html, 'utf8');
  await writeFile(path.join(folder, 'review.md'), renderReviewMarkdown(spec, summary), 'utf8');

  generated.push({
    id: spec.id,
    name: spec.name,
    ok: summary.analysis.ok,
    nodes: summary.model.nodeCount,
    members: summary.model.memberCount,
    loads: summary.model.loadCount,
    maxDisplacement: summary.analysis.maxEnvelopeDisplacement,
    maxUtilization: summary.analysis.maxEnvelopeUtilization,
    folder: path.relative(process.cwd(), folder),
  });
  console.log(`[${generated.length}/10] ${spec.id} OK - nodes ${summary.model.nodeCount}, members ${summary.model.memberCount}, loads ${summary.model.loadCount}`);
}

await writeJson(path.join(outputRoot, 'index.json'), {
  version: REPRESENTATIVE_BUILDINGS_VERSION,
  generatedAt: '2026-06-26T00:00:00.000Z',
  count: generated.length,
  buildings: generated,
});
await writeFile(path.join(outputRoot, 'README.md'), renderIndexMarkdown(generated), 'utf8');

console.log(JSON.stringify({
  ok: true,
  version: REPRESENTATIVE_BUILDINGS_VERSION,
  outputRoot: path.relative(process.cwd(), outputRoot),
  count: generated.length,
}, null, 2));

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderIndexMarkdown(items) {
  const rows = items.map((item) => (
    `| ${item.id} | ${item.name} | ${item.nodes} | ${item.members} | ${item.loads} | ${format(item.maxDisplacement)} | ${format(item.maxUtilization)} |`
  )).join('\n');
  return `# Representative Building Elastic Analysis Set

Generated for S-Structures verification.

## Contents

Each building folder contains:

- \`model.json\`: generated structural model
- \`analysis-summary.json\`: compact analysis summary
- \`report.html\`: HTML calculation report
- \`review.md\`: Korean review memo

## Building Summary

| ID | Name | Nodes | Members | Loads | Max displacement | Max utilization |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${rows}
`;
}

function renderReviewMarkdown(spec, summary) {
  const comboRows = Object.entries(summary.analysis.combos).map(([comboId, combo]) => (
    `| ${comboId} | ${combo.ok ? 'OK' : 'NG'} | ${format(combo.maxDisplacement)} | ${format(combo.maxUtilization)} | ${format(combo.equilibriumResidual)} |`
  )).join('\n');
  return `# ${spec.name}

## 검토 개요

- 대표 유형: ${spec.type}
- 형상 설명: ${spec.description}
- 모델링 방식: 3D frame elastic model
- 층수: ${summary.model.stories}
- 노드/부재/하중: ${summary.model.nodeCount} / ${summary.model.memberCount} / ${summary.model.loadCount}

## 해석 결과

- 해석 상태: ${summary.analysis.ok ? 'OK' : 'NG'}
- 최대 변위: ${format(summary.analysis.maxEnvelopeDisplacement)}
- 최대 검토비: ${format(summary.analysis.maxEnvelopeUtilization)}
- 예비 설계 상태: ${summary.analysis.designStatus || '-'}

| 조합 | 상태 | 최대 변위 | 최대 검토비 | 평형 오차 |
| --- | --- | ---: | ---: | ---: |
${comboRows}

## 검증 포인트

- 향후 도면 이미지 또는 MGT 변환기는 이 모델과 같은 schema version 3 데이터를 생성해야 한다.
- 자동 모델링 결과를 \`model.json\`과 비교해서 노드, 부재, 하중, 조합의 누락 여부를 검토한다.
- 보고서 검토는 \`report.html\`에서 수행한다.
`;
}

function format(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (number !== 0 && (Math.abs(number) < 0.001 || Math.abs(number) > 100000)) return number.toExponential(3);
  return number.toFixed(6).replace(/\.?0+$/, '');
}
