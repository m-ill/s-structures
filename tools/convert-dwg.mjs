#!/usr/bin/env node
import {
  createDwgConversionPlan,
  createDwgMissingConverterResult,
} from '../src/import/dwg/adapter.js';

const args = parseArgs(process.argv.slice(2));
const plan = createDwgConversionPlan({
  inputPath: args.input,
  outputDir: args.out,
  converterPath: args.converter,
  targetFormat: args.format,
  recursive: args.recursive === 'true',
  audit: args.audit !== 'false',
});

const result = plan.canRun ? { ok: true, plan } : createDwgMissingConverterResult({ ...args, inputPath: args.input });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 2;

function parseArgs(values) {
  const out = {};
  for (let i = 0; i < values.length; i += 1) {
    const token = values[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = values[i + 1];
    out[key] = next && !next.startsWith('--') ? next : 'true';
    if (out[key] === next) i += 1;
  }
  return out;
}
