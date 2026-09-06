import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assignMemberFoundation,
  buildFoundationInspector,
  createWinklerLineFoundationProperty,
  migrateModel,
  validateModel,
} from '../src/index.js';

const [command, inputPath, ...rawArgs] = process.argv.slice(2);
const args = parseArgs(rawArgs);
if (!command || !inputPath || !['inspect', 'validate', 'assign', 'remove'].includes(command)) usage();

const sourcePath = resolve(inputPath);
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
let model = migrateModel(source).model;

if (command === 'validate') {
  const validation = validateModel(model);
  emit({ command, sourcePath, ok: validation.ok, errors: validation.errors, warnings: validation.warnings || [] });
  process.exit(validation.ok ? 0 : 2);
}

if (command === 'inspect') {
  const validation = validateModel(model);
  emit({ command, sourcePath, validation, inspector: buildFoundationInspector(model, null, { memberIds: list(args.members) }) });
  process.exit(validation.ok ? 0 : 2);
}

if (!args.output) fail('FOUNDATION_CLI_OUTPUT_REQUIRED', 'Mutation commands require --output=<model.json>.');
const memberIds = list(args.members);
if (!memberIds.length) fail('FOUNDATION_CLI_MEMBERS_REQUIRED', 'Use --members=M1,M2.');

if (command === 'assign') {
  if (args['property-file']) {
    const record = JSON.parse(await readFile(resolve(args['property-file']), 'utf8'));
    const property = createWinklerLineFoundationProperty(record);
    model.foundationProperties = [...(model.foundationProperties || []).filter((row) => row.id !== property.id), property];
  }
  if (!args.foundation) fail('FOUNDATION_CLI_PROPERTY_REQUIRED', 'Use --foundation=<propertyId>.');
  model = assignMemberFoundation(model, memberIds, args.foundation).model;
} else {
  const ids = new Set(memberIds);
  model = { ...model, members: model.members.map((member) => ids.has(String(member.id)) ? withoutFoundation(member) : member) };
}

const validation = validateModel(model);
if (!validation.ok) fail('FOUNDATION_CLI_MODEL_INVALID', JSON.stringify(validation.errors));
const outputPath = resolve(args.output);
await writeFile(outputPath, `${JSON.stringify(model, null, 2)}\n`, { encoding: 'utf8', flag: args.force === 'true' ? 'w' : 'wx' });
emit({ command, sourcePath, outputPath, ok: true, memberIds, foundationId: args.foundation || null });

function parseArgs(values) {
  return Object.fromEntries(values.map((value) => {
    if (!value.startsWith('--')) fail('FOUNDATION_CLI_ARGUMENT_INVALID', value);
    const index = value.indexOf('=');
    return index < 0 ? [value.slice(2), 'true'] : [value.slice(2, index), value.slice(index + 1)];
  }));
}
function list(value) { return String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }
function withoutFoundation(member) { const next = { ...member }; delete next.foundationId; return next; }
function emit(value) { console.log(JSON.stringify(value, null, 2)); }
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function usage() {
  console.error('Usage: node tools/sstructures-foundation.mjs <inspect|validate|assign|remove> <model.json> [--members=M1,M2] [--foundation=WF] [--property-file=property.json] [--output=model.json] [--force=true]');
  process.exit(64);
}
