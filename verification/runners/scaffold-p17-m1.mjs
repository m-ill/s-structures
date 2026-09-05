#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyP17M1Scaffold } from '../framework/phase17/scaffoldBuilder.mjs';

const argumentsSet = new Set(process.argv.slice(2));
const supported = new Set(['--check', '--write']);
for (const argument of argumentsSet) {
  if (!supported.has(argument)) throw new Error(`Unknown argument: ${argument}\nUsage: node verification/runners/scaffold-p17-m1.mjs --check|--write`);
}
if (argumentsSet.has('--check') && argumentsSet.has('--write')) throw new Error('--check and --write are mutually exclusive.');

const mode = argumentsSet.has('--write') ? 'write' : 'check';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const result = applyP17M1Scaffold(repoRoot, { mode });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
