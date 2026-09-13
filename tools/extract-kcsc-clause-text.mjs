// Turn a captured KCSC official JSON into the `<code>-text.txt` convention that
// phase 24 established, so every captured code document is readable the same
// way instead of only the ones that happened to get a text file.
//
//   node tools/extract-kcsc-clause-text.mjs <official.json> [--out <file>] [--check]
//
// The convention was recovered from the phase 24 files rather than invented:
// one line per clause entry, `<sort> <title>  <contents without markup> `, CRLF
// between lines. `.gitattributes` keeps verification/** byte-exact, so the line
// ending is part of the format and is written explicitly.
//
// How faithful is the recovered transform? Measured against all nine phase 24
// files (2,689 lines):
//
//   byte-identical              2,413 / 2,689   (90%)
//   identical ignoring spacing  2,686 / 2,689   (99.9%)
//
// No clause text differs anywhere. The byte-level differences are spacing around
// formula images, and the 3 remaining differences are layout spacing around tab
// characters inside the KDS 14 20 70 appendix tables. The phase 24 files came
// from an earlier pipeline that is not in the repository, so this tool does not
// overwrite them; it is for documents that have no text file yet.
//
// --check regenerates and reports the comparison instead of writing.

import { readFile, writeFile } from 'node:fs/promises';
import { argv } from 'node:process';
import path from 'node:path';

// Markup that separates two pieces of text becomes a space; structural markup
// disappears. An equation image leaves a single space, which is why a clause
// whose formula is an image shows a gap exactly where the formula was.
const SPACING_TAGS = new Set(['sup', 'sub', 'span']);

const args = argv.slice(2);
const source = args.find((value) => !value.startsWith('--'));
if (!source) throw new Error('Usage: node tools/extract-kcsc-clause-text.mjs <official.json> [--out <file>] [--check]');

const outFlagIndex = args.indexOf('--out');
const check = args.includes('--check');

const document = readDocument(JSON.parse(await readFile(source, 'utf8')), source);

const target = outFlagIndex >= 0
  ? args[outFlagIndex + 1]
  : path.join(path.dirname(source), `${document.code}-text.txt`);

const text = document.list
  .map((entry) => `${entry.sort} ${entry.title}  ${stripMarkup(entry.contents)} `)
  .join('\r\n');

// Two capture endpoints are in use and they return different envelopes. Both
// carry the same thing -- an ordered list of clause entries with a heading and
// an HTML body -- so they are normalised to one shape here rather than growing
// a second extractor.
function readDocument(parsed, from) {
  const openApi = parsed?.['0'];
  if (openApi?.list) {
    return {
      code: openApi.code,
      name: openApi.name,
      version: openApi.version,
      list: openApi.list.map((entry) => ({
        sort: entry.sort,
        title: entry.title,
        contents: entry.contents,
      })),
    };
  }
  const rows = parsed?.result?.document;
  if (Array.isArray(rows) && rows.length) {
    // KDS 171000_01 -> 171000
    const code = (/KDS\s*(\d+)/i.exec(String(rows[0].onto_link_cd ?? '')) || [])[1] || 'unknown';
    return {
      code,
      name: parsed?.result?.docName ?? null,
      version: parsed?.result?.docVer ?? null,
      // This envelope has no sort field; position is the order.
      list: rows.map((row, index) => ({
        sort: index + 1,
        title: String(row.group_title ?? '').trim(),
        contents: row.full_content,
      })),
    };
  }
  throw new Error(`Unrecognised capture envelope in ${from}`);
}

// A clause that renders its formula as an image is the reason this repository
// separates "the clause exists" from "the equation is implemented", so the
// count is reported rather than hidden.
const imageBearing = document.list.filter((entry) => /<img/i.test(String(entry.contents ?? ''))).length;

if (check) {
  const existing = await readFile(target, 'utf8').then((value) => value.replace(/\r?\n$/, ''));
  const mine = text.split('\r\n');
  const theirs = existing.split('\r\n');
  const collapse = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  let identical = 0;
  let sameIgnoringSpacing = 0;
  for (let index = 0; index < Math.max(mine.length, theirs.length); index += 1) {
    if (mine[index] === theirs[index]) identical += 1;
    if (collapse(mine[index]) === collapse(theirs[index])) sameIgnoringSpacing += 1;
  }
  console.log(JSON.stringify({
    check: target,
    lines: Math.max(mine.length, theirs.length),
    identical,
    sameIgnoringSpacing,
  }, null, 2));
} else {
  await writeFile(target, text, 'utf8');
  console.log(JSON.stringify({
    wrote: target,
    code: document.code,
    name: document.name,
    version: document.version,
    entries: document.list.length,
    clausesWithImageFormulas: imageBearing,
    bytes: text.length,
  }, null, 2));
}

function stripMarkup(contents) {
  return String(contents ?? '')
    .replace(/<[^>]*>/g, (tag) => {
      if (/^<img/i.test(tag)) return ' ';
      const name = (/^<\/?\s*([a-z0-9]+)/i.exec(tag) || [])[1]?.toLowerCase();
      return SPACING_TAGS.has(name) ? ' ' : '';
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    // Captured spacing is left alone otherwise: it is evidence, not formatting.
    // Only a line break inside a clause becomes a space, because one clause is
    // one line.
    .replace(/[\r\n]+/g, ' ');
}
