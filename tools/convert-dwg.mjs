#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import {
  buildDwgConversionPreflight,
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
const preflight = buildDwgConversionPreflight({
  plan,
  converterExists: parseOptionalBool(args.converterExists) ?? fileExists(args.converter),
  inputExists: parseOptionalBool(args.inputExists) ?? fileExists(args.input),
  outputDirWritable: parseOptionalBool(args.outputDirWritable) ?? directoryExists(args.out || plan.outputDir),
});

const result = plan.canRun
  ? { ok: true, readyToExecute: preflight.canExecute, plan, preflight }
  : { ...createDwgMissingConverterResult({ ...args, inputPath: args.input }), preflight };
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

function parseOptionalBool(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function fileExists(path) {
  if (!path) return undefined;
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function directoryExists(path) {
  if (!path) return undefined;
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
