// Recover the KDS 14 20 70 appendix coefficient tables from the captured HTML.
//
//   node tools/extract-slab-coefficient-tables.mjs [--out <file>]
//
// Why this exists: the flattened `-text.txt` rendering collapses the blank
// cells, so a coefficient can no longer be told apart from the gap next to it
// and the short-span/long-span attribution is lost. The captured HTML keeps
// both -- each case cell carries colspan=3 and exactly three <p> elements, one
// per sub-column, with an empty one where the table has a gap.
//
// The Case 1~9 support-condition diagrams are NOT in the capture: they occupy
// three rows of empty cells whose thick borders drew the sketches, and no
// border, style or class attribute survives. They were supplied separately from
// the published figures and are merged in below, marked as owner-supplied so
// they are never mistaken for captured data.
//
// The merge is checked rather than trusted. A restrained edge must produce a
// negative-moment coefficient in that direction and an unrestrained one must
// leave it blank, which makes the diagrams and the table's own blanks
// independent evidence for each other: all 99 combinations agree.

import { readFile, writeFile } from 'node:fs/promises';
import { argv } from 'node:process';

const SOURCE = 'verification/evidence/phase24/kcsc/KDS-142070-official.json';
const TABLES = [
  { sort: 357, id: '4-1', subject: '슬래브의 부모멘트에 대한 계수', shortKey: 'CA_neg', longKey: 'CB_neg', load: '계수고정하중+계수활하중' },
  { sort: 358, id: '4-2', subject: '슬래브의 고정하중에 의한 정모멘트계수', shortKey: 'CA_DL', longKey: 'CB_DL', load: '계수고정하중' },
  { sort: 359, id: '4-3', subject: '슬래브의 활하중에 의한 정모멘트계수', shortKey: 'CA_LL', longKey: 'CB_LL', load: '계수활하중' },
  { sort: 360, id: '4-4', subject: '전단력과 받침점 하중 계산을 위한 하중분포비', shortKey: 'WA', longKey: 'WB', load: '등분포하중 분포비' },
];

// Owner-supplied from the published figures. `thick` marks an edge that is
// continuous over its support or fixed at it; `thin` marks a support whose
// torsional resistance may be neglected. A thin edge is still a supported edge
// and must not be treated as free.
//
// Top and bottom carry the short span l1 and so govern the CA coefficients;
// left and right carry the long span l2 and govern CB. A real slab must be
// oriented short-span-first before a case is selected, and rotating it has to
// carry the edge conditions and the A/B direction along with it.
const SUPPORT_CONDITIONS = {
  Case1: { top: 'thin', bottom: 'thin', left: 'thin', right: 'thin', summary: '네 변 모두 단순지지' },
  Case2: { top: 'thick', bottom: 'thick', left: 'thick', right: 'thick', summary: '네 변 모두 연속/고정' },
  Case3: { top: 'thin', bottom: 'thin', left: 'thick', right: 'thick', summary: '왼쪽·오른쪽 두 대변' },
  Case4: { top: 'thin', bottom: 'thick', left: 'thick', right: 'thin', summary: '아래·왼쪽 두 인접변' },
  Case5: { top: 'thick', bottom: 'thick', left: 'thin', right: 'thin', summary: '위·아래 두 대변' },
  Case6: { top: 'thick', bottom: 'thin', left: 'thin', right: 'thin', summary: '위 한 변' },
  Case7: { top: 'thin', bottom: 'thin', left: 'thin', right: 'thick', summary: '오른쪽 한 변' },
  Case8: { top: 'thin', bottom: 'thick', left: 'thick', right: 'thick', summary: '위를 제외한 세 변' },
  Case9: { top: 'thick', bottom: 'thick', left: 'thin', right: 'thick', summary: '왼쪽을 제외한 세 변' },
};

// Values the published table prints as they stand. They are kept exactly as the
// source has them and flagged; replacing one with an interpolated guess would
// put an invented coefficient into a design path.
const SUSPECTED_SOURCE_DEFECTS = [
  {
    table: '4-1', case: 'Case4', spanRatio: 0.85, key: 'CA_neg', printed: '0066',
    issue: 'decimal point missing', neighbours: [0.06, 0.071],
  },
  {
    table: '4-2', case: 'Case7', spanRatio: 0.9, key: 'CA_DL', printed: '0.025',
    issue: 'breaks the otherwise monotonic column', neighbours: [0.031, 0.04],
  },
  {
    table: '4-3', scope: 'row labels', printed: 'CB DL',
    issue: 'the live load table labels its long-span rows DL; 4-3 carries LL coefficients',
  },
  {
    table: '4-2', scope: 'footnote', printed: '짧은 경간 구속단부에서 부모멘트계수',
    issue: 'the footnote is copied verbatim from table 4-1; 4-2 is a positive moment table at midspan',
  },
];

const outIndex = argv.indexOf('--out');
const target = outIndex >= 0 ? argv[outIndex + 1] : 'verification/evidence/phase29/slab-coefficient-tables.json';

const doc = JSON.parse(await readFile(SOURCE, 'utf8'))['0'];
const output = { version: 'p29-slab-coefficient-tables-v1', source: SOURCE, document: '142070', edition: doc.version,
  momentEquations: {
    negative: 'Ma = CA_neg * wu * l1^2, Mb = CB_neg * wu * l2^2 with wu = 1.2D + 1.6L',
    positive: 'Ma+ = (CA_DL * 1.2D + CA_LL * 1.6L) * l1^2, Mb+ = (CB_DL * 1.2D + CB_LL * 1.6L) * l2^2',
    note: 'a blank negative-moment coefficient means the table gives none for that direction, not that the design negative moment there is zero; the discontinuous-edge provision applies separately',
  },
  suspectedSourceDefects: SUSPECTED_SOURCE_DEFECTS,
  tables: [] };

for (const spec of TABLES) {
  const entry = doc.list.find((row) => row.sort === spec.sort);
  if (!entry) throw new Error(`clause entry ${spec.sort} missing`);
  const rows = [...String(entry.contents).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);

  const header = cells(rows[0]);
  const caseLabels = header.slice(1).map((cell) => plain(cell.body));
  if (caseLabels.length !== 9) throw new Error(`expected 9 cases in table ${spec.id}, found ${caseLabels.length}`);

  // Rows 1..3 are the diagram band: empty cells whose borders drew the
  // sketches. Confirmed empty here rather than assumed, so a future capture
  // that does carry them makes this check fail loudly.
  const diagramBand = rows.slice(1, 4).map((row) => cells(row));
  const diagramsPresent = diagramBand.some((row) => row.some((cell) => plain(cell.body) !== '' || /<img/i.test(cell.body)));

  const ratios = [];
  for (const raw of rows.slice(4, 15)) {
    const row = cells(raw);
    const label = paragraphs(row[0].body).map(plain).filter(Boolean);
    const ratio = Number(label.find((value) => /^\d+\.\d+$/.test(value)));
    if (!Number.isFinite(ratio)) throw new Error(`no span ratio in table ${spec.id} row label ${JSON.stringify(label)}`);

    const values = {};
    row.slice(1).forEach((cell, index) => {
      let parts = paragraphs(cell.body).map(plain);
      // A case with no coefficient at all collapses to a single blank cell
      // instead of three blank sub-columns.
      if (parts.length === 1 && parts[0] === '') parts = ['', '', ''];
      if (parts.length !== 3) throw new Error(`table ${spec.id} case ${index + 1} has ${parts.length} sub-columns, expected 3`);
      // Sub-column 0 is the short-span coefficient, 2 the long-span one; the
      // middle sub-column is the gap between them.
      values[`Case${index + 1}`] = {
        [spec.shortKey]: numberOrNull(parts[0]),
        [spec.longKey]: numberOrNull(parts[2]),
      };
    });
    ratios.push({ spanRatio: ratio, values });
  }

  // A restrained edge must produce a coefficient in that direction. Checked on
  // the negative-moment table, where a blank means exactly that.
  const agreement = spec.id !== '4-1' ? null : ratios.flatMap((row) => Object.entries(SUPPORT_CONDITIONS).map(([name, edges]) => {
    const shortRestrained = edges.top === 'thick' || edges.bottom === 'thick';
    const longRestrained = edges.left === 'thick' || edges.right === 'thick';
    return {
      spanRatio: row.spanRatio,
      case: name,
      agrees: shortRestrained === (row.values[name].CA_neg !== null)
        && longRestrained === (row.values[name].CB_neg !== null),
    };
  }));
  if (agreement && agreement.some((row) => !row.agrees)) {
    throw new Error(`support conditions disagree with the table blanks: ${JSON.stringify(agreement.filter((r) => !r.agrees))}`);
  }

  output.tables.push({
    id: spec.id,
    clause: `부록 표 ${spec.id}`,
    subject: spec.subject,
    load: spec.load,
    shortSpanKey: spec.shortKey,
    longSpanKey: spec.longKey,
    spanRatioDefinition: 'm = l1 / l2, l1 = 단변 순경간, l2 = 장변 순경간',
    caseLabels,
    supportConditions: SUPPORT_CONDITIONS,
    supportConditionProvenance: 'owner-supplied from the published figures; the capture carries only the empty diagram band',
    diagramBandPresentInCapture: diagramsPresent,
    supportConditionCrossCheck: agreement
      ? { basis: 'a restrained edge must produce a negative moment coefficient in that direction', checked: agreement.length, agreed: agreement.filter((row) => row.agrees).length }
      : null,
    directionMapping: {
      shortSpan: 'l1, carried by the top and bottom edges, gives the CA/WA coefficients',
      longSpan: 'l2, carried by the left and right edges, gives the CB/WB coefficients',
      note: 'orient the slab short-span-first before selecting a case; rotating it must carry the edge conditions and the A/B direction with it',
    },
    footnotes: plain(rows[15]).split('*').map((value) => value.trim()).filter(Boolean),
    rows: ratios,
  });
}

await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  wrote: target,
  tables: output.tables.map((table) => ({
    id: table.id,
    spanRatios: table.rows.length,
    populated: table.rows.reduce((sum, row) => sum + Object.values(row.values).filter((v) => Object.values(v).some((x) => x !== null)).length, 0),
    supportConditionsKnown: table.supportConditionsKnown,
  })),
}, null, 2));

function cells(rowHtml) {
  return [...String(rowHtml).matchAll(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi)]
    .map((match) => ({ attrs: match[2] || '', body: match[3] }));
}

// The three <p> elements inside a case cell are its three sub-columns; an empty
// one is a gap, and dropping it would shift every coefficient left.
function paragraphs(body) {
  const found = [...String(body).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => match[1]);
  return found.length ? found : [body];
}

function plain(html) {
  return String(html)
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberOrNull(value) {
  const text = plain(value);
  if (!text) return null;
  // 0066 appears in the published table where 0.066 is meant; it is left as the
  // source has it and flagged, not silently corrected.
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return { raw: text, malformed: true };
  if (!/^0\.\d+$/.test(text)) return { raw: text, value: parsed, malformedInSource: true };
  return parsed;
}

// Emit the runtime data module as well, the way kcscRuleSources.js is a
// generated module: the evidence JSON stays the record, and src/ gets a plain
// ESM module so nothing has to read JSON at run time.
if (argv.includes('--module')) {
  const moduleTarget = 'src/design/rc/slabCoefficientTables.js';
  const body = [
    '// GENERATED by tools/extract-slab-coefficient-tables.mjs. Do not edit by hand.',
    '//',
    '// KDS 14 20 70 appendix tables 4-1 to 4-4. The coefficients come from the',
    '// captured HTML, where each case cell keeps its three sub-columns so the',
    '// blanks and the short-span/long-span attribution survive. The support',
    '// conditions are owner-supplied from the published figures, because the',
    '// capture holds only the empty diagram band; the extractor checks them',
    '// against the table blanks before writing this file.',
    '',
    `export const SLAB_COEFFICIENT_TABLES = ${JSON.stringify({
      version: output.version,
      document: output.document,
      edition: output.edition,
      momentEquations: output.momentEquations,
      suspectedSourceDefects: output.suspectedSourceDefects,
      supportConditions: SUPPORT_CONDITIONS,
      directionMapping: output.tables[0].directionMapping,
      tables: Object.fromEntries(output.tables.map((table) => [table.id, {
        clause: table.clause,
        subject: table.subject,
        load: table.load,
        shortSpanKey: table.shortSpanKey,
        longSpanKey: table.longSpanKey,
        rows: table.rows,
      }])),
    }, null, 1)};`,
    '',
  ].join('\n');
  await writeFile(moduleTarget, body, 'utf8');
  console.log(JSON.stringify({ wroteModule: moduleTarget, bytes: body.length }));
}
