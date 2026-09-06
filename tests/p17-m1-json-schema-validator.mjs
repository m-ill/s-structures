import assert from 'node:assert/strict';
import {
  assertJsonSchema,
  validateJsonSchema,
  validateSchemaDefinition,
} from '../verification/framework/phase17/jsonSchemaStrict.mjs';

const contract = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:s-structures:test:p17-m1-json-schema-validator',
  title: 'P17-M1 validator contract',
  description: 'Exercises the fail-closed Phase 17 JSON Schema subset.',
  $defs: {
    digest: {
      type: 'string',
      pattern: '^[a-f0-9]{8}$',
    },
    payload: {
      oneOf: [
        {
          type: 'object',
          required: ['a'],
          properties: {
            a: {
              type: 'number',
              exclusiveMinimum: 0,
              exclusiveMaximum: 10,
              multipleOf: 0.5,
            },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['b'],
          properties: { b: { type: 'string', minLength: 1 } },
          additionalProperties: false,
        },
      ],
    },
  },
  type: 'object',
  required: ['kind', 'stamp', 'digest'],
  minProperties: 3,
  maxProperties: 4,
  dependentRequired: { payload: ['digest'] },
  properties: {
    kind: { enum: ['A', 'B'] },
    stamp: { type: 'string', format: 'date-time' },
    digest: { $ref: '#/$defs/digest' },
    payload: { $ref: '#/$defs/payload' },
  },
  additionalProperties: false,
  allOf: [
    { not: { required: ['forbidden'] } },
    { anyOf: [{ required: ['digest'] }, { required: ['payload'] }] },
  ],
  if: { properties: { kind: { const: 'A' } }, required: ['kind'] },
  then: { required: ['payload'] },
  else: { maxProperties: 3 },
};

assert.deepEqual(validateSchemaDefinition(contract), []);

const valid = {
  kind: 'A',
  stamp: '2026-08-28T09:30:45.125+09:00',
  digest: 'deadbeef',
  payload: { a: 1.5 },
};
assertJsonSchema(contract, valid, 'valid composite contract');

const nestedDeletion = structuredClone(valid);
delete nestedDeletion.payload.a;
assert.ok(validateJsonSchema(contract, nestedDeletion).some((error) => error.keyword === 'oneOf'));

const nestedExtra = structuredClone(valid);
nestedExtra.payload.extra = true;
assert.ok(validateJsonSchema(contract, nestedExtra).some((error) => error.keyword === 'oneOf'));

const topLevelExtra = { ...valid, unexpected: true };
assert.ok(validateJsonSchema(contract, topLevelExtra).some((error) => error.keyword === 'additionalProperties' && error.instancePath === '/unexpected'));

const ambiguousOneOf = {
  oneOf: [
    { type: 'number', minimum: 0 },
    { type: 'number', maximum: 10 },
  ],
};
assert.ok(validateJsonSchema(ambiguousOneOf, 5).some((error) => error.keyword === 'oneOf' && /matched 2/.test(error.message)));

const localPropertyReference = {
  type: 'object',
  properties: {
    canonical: { type: 'integer', minimum: 1 },
    alias: { $ref: '#/properties/canonical' },
  },
};
assert.deepEqual(validateJsonSchema(localPropertyReference, { canonical: 2, alias: 3 }), []);
assert.ok(validateJsonSchema(localPropertyReference, { canonical: 2, alias: 0 }).some((error) => error.keyword === 'minimum' && error.instancePath === '/alias'));
assert.ok(validateJsonSchema(contract, { ...valid, digest: 'BAD' }).some((error) => error.keyword === 'pattern' && error.instancePath === '/digest'));

const unknownKeywordSchema = {
  type: 'object',
  requird: ['value'],
};
const lintErrors = validateSchemaDefinition(unknownKeywordSchema);
assert.ok(lintErrors.some((error) => error.keyword === 'requird' && error.schemaPath === '#/requird'));
assert.ok(validateJsonSchema(unknownKeywordSchema, {}).some((error) => error.keyword === 'requird' && /invalid schema/.test(error.message)));
assert.throws(() => assertJsonSchema(unknownKeywordSchema, {}), /unsupported schema keyword/);

assert.deepEqual(validateJsonSchema({ type: 'string', format: 'date-time' }, '2024-02-29T23:59:59Z'), []);
assert.ok(validateJsonSchema({ type: 'string', format: 'date-time' }, '2023-02-29T23:59:59Z').some((error) => error.keyword === 'format'));
assert.ok(validateJsonSchema({ type: 'string', format: 'date-time' }, '2026-08-28 09:30:45').some((error) => error.keyword === 'format'));

assert.ok(validateJsonSchema({ type: 'number' }, Number.NaN).some((error) => error.keyword === 'type' && /finite JSON number/.test(error.message)));
assert.deepEqual(validateJsonSchema({ multipleOf: 0.1 }, 0.3), []);
assert.ok(validateJsonSchema({ multipleOf: 0.5 }, 0.3).some((error) => error.keyword === 'multipleOf'));

assert.ok(validateJsonSchema(contract, { ...valid, payload: { a: 0 } }).some((error) => error.keyword === 'oneOf'));
assert.ok(validateJsonSchema(contract, { ...valid, payload: { a: 10 } }).some((error) => error.keyword === 'oneOf'));
assert.ok(validateJsonSchema(contract, { kind: 'B', stamp: valid.stamp, digest: valid.digest, payload: { b: 'ok' } }).some((error) => error.keyword === 'maxProperties'));

process.stdout.write(`${JSON.stringify({
  suite: 'P17-M1 JSON Schema validator',
  status: 'PASS',
  coverage: [
    'nested deletion',
    'nested additional property',
    'oneOf ambiguity',
    'local $ref',
    'unknown keyword lint',
    'date-time',
    'NaN',
  ],
}, null, 2)}\n`);
