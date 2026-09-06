// Dependency-free, fail-closed JSON Schema subset for Phase 17+ contracts.
// Unknown schema keywords are rejected so misspelled assertions cannot weaken
// a verification contract without being noticed.

const TYPE_NAMES = new Set(['null', 'array', 'object', 'integer', 'number', 'string', 'boolean']);
const ANNOTATION_KEYWORDS = new Set([
  '$schema', '$id', 'title', 'description', 'examples', 'default',
  'deprecated', 'readOnly', 'writeOnly',
]);
const ASSERTION_KEYWORDS = new Set([
  '$ref', '$defs', 'type', 'required', 'properties', 'additionalProperties',
  'const', 'enum', 'pattern', 'format', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength',
  'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'items',
  'minProperties', 'maxProperties', 'dependentRequired', 'allOf', 'anyOf',
  'oneOf', 'not', 'if', 'then', 'else',
]);
const ALLOWED_KEYWORDS = new Set([...ANNOTATION_KEYWORDS, ...ASSERTION_KEYWORDS]);
const SUPPORTED_FORMATS = new Set(['date', 'date-time', 'uri']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function matchesType(value, expected) {
  switch (expected) {
    case 'null': return value === null;
    case 'array': return Array.isArray(value);
    case 'object': return isPlainObject(value);
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    default: return false;
  }
}

function escapePointer(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function decodePointerToken(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return { ok: false, reason: 'contains invalid percent encoding' };
  }
  if (/~(?:[^01]|$)/.test(decoded)) {
    return { ok: false, reason: 'contains an invalid JSON Pointer escape' };
  }
  return { ok: true, value: decoded.replaceAll('~1', '/').replaceAll('~0', '~') };
}

function resolveLocalReference(rootSchema, reference) {
  if (reference === '#') return { ok: true, schema: rootSchema };
  if (typeof reference !== 'string' || !reference.startsWith('#/')) {
    return { ok: false, reason: 'only local JSON Pointer references are supported' };
  }

  let current = rootSchema;
  for (const rawToken of reference.slice(2).split('/')) {
    const token = decodePointerToken(rawToken);
    if (!token.ok) return token;
    if ((current === null || typeof current !== 'object') || !hasOwn(current, token.value)) {
      return { ok: false, reason: `does not resolve at token ${JSON.stringify(token.value)}` };
    }
    current = current[token.value];
  }
  if (typeof current !== 'boolean' && !isPlainObject(current)) {
    return { ok: false, reason: 'must resolve to a schema object or boolean schema' };
  }
  return { ok: true, schema: current };
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function isValidDateTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || !isValidDate(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (match[6] !== undefined && (Number(match[6]) > 23 || Number(match[7]) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}

function isMultipleOf(value, divisor) {
  const quotient = value / divisor;
  const nearest = Math.round(quotient);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(quotient)) * 16;
  return Math.abs(quotient - nearest) <= tolerance;
}

/**
 * Lint a schema definition before it is trusted as a verification contract.
 * Errors use JSON Pointer schema paths and never inspect keys inside ordinary
 * data values such as const, enum, default or examples as schema keywords.
 */
export function validateSchemaDefinition(schema) {
  const errors = [];
  const activeSchemas = new WeakSet();
  const fail = (schemaPath, keyword, message) => errors.push({ schemaPath, keyword, message });

  const visit = (nodeSchema, schemaPath) => {
    if (typeof nodeSchema === 'boolean') return;
    if (!isPlainObject(nodeSchema)) {
      fail(schemaPath, 'schema', 'must be a schema object or boolean schema');
      return;
    }
    if (activeSchemas.has(nodeSchema)) {
      fail(schemaPath, 'schema', 'must not contain an in-memory object cycle');
      return;
    }
    activeSchemas.add(nodeSchema);

    for (const keyword of Object.keys(nodeSchema)) {
      if (!ALLOWED_KEYWORDS.has(keyword)) {
        fail(`${schemaPath}/${escapePointer(keyword)}`, keyword, `unsupported schema keyword ${JSON.stringify(keyword)}`);
      }
    }

    for (const keyword of ['$schema', '$id', 'title', 'description']) {
      if (hasOwn(nodeSchema, keyword) && typeof nodeSchema[keyword] !== 'string') {
        fail(`${schemaPath}/${escapePointer(keyword)}`, keyword, 'must be a string');
      }
    }
    for (const keyword of ['deprecated', 'readOnly', 'writeOnly']) {
      if (hasOwn(nodeSchema, keyword) && typeof nodeSchema[keyword] !== 'boolean') {
        fail(`${schemaPath}/${keyword}`, keyword, 'must be a boolean');
      }
    }
    if (hasOwn(nodeSchema, 'examples') && !Array.isArray(nodeSchema.examples)) {
      fail(`${schemaPath}/examples`, 'examples', 'must be an array');
    }

    if (hasOwn(nodeSchema, 'type')) {
      const types = Array.isArray(nodeSchema.type) ? nodeSchema.type : [nodeSchema.type];
      if (!types.length || types.some((type) => typeof type !== 'string' || !TYPE_NAMES.has(type)) || new Set(types).size !== types.length) {
        fail(`${schemaPath}/type`, 'type', 'must be a supported type or a non-empty unique array of supported types');
      }
    }
    if (hasOwn(nodeSchema, 'required')) {
      const entries = nodeSchema.required;
      if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string') || new Set(entries).size !== entries.length) {
        fail(`${schemaPath}/required`, 'required', 'must be an array of unique strings');
      }
    }
    if (hasOwn(nodeSchema, 'enum') && (!Array.isArray(nodeSchema.enum) || nodeSchema.enum.length === 0)) {
      fail(`${schemaPath}/enum`, 'enum', 'must be a non-empty array');
    }
    if (hasOwn(nodeSchema, 'pattern')) {
      if (typeof nodeSchema.pattern !== 'string') {
        fail(`${schemaPath}/pattern`, 'pattern', 'must be a string');
      } else {
        try {
          new RegExp(nodeSchema.pattern);
        } catch {
          fail(`${schemaPath}/pattern`, 'pattern', 'must be a valid regular expression');
        }
      }
    }
    if (hasOwn(nodeSchema, 'format') && (typeof nodeSchema.format !== 'string' || !SUPPORTED_FORMATS.has(nodeSchema.format))) {
      fail(`${schemaPath}/format`, 'format', `must be one of ${[...SUPPORTED_FORMATS].join(', ')}`);
    }
    for (const keyword of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']) {
      if (hasOwn(nodeSchema, keyword) && !isFiniteNumber(nodeSchema[keyword])) {
        fail(`${schemaPath}/${keyword}`, keyword, 'must be a finite number');
      }
    }
    if (hasOwn(nodeSchema, 'multipleOf') && (!isFiniteNumber(nodeSchema.multipleOf) || nodeSchema.multipleOf <= 0)) {
      fail(`${schemaPath}/multipleOf`, 'multipleOf', 'must be a finite number greater than zero');
    }
    for (const keyword of ['minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties']) {
      if (hasOwn(nodeSchema, keyword) && !isNonNegativeInteger(nodeSchema[keyword])) {
        fail(`${schemaPath}/${keyword}`, keyword, 'must be a non-negative integer');
      }
    }
    if (hasOwn(nodeSchema, 'uniqueItems') && typeof nodeSchema.uniqueItems !== 'boolean') {
      fail(`${schemaPath}/uniqueItems`, 'uniqueItems', 'must be a boolean');
    }

    if (hasOwn(nodeSchema, '$ref')) {
      if (typeof nodeSchema.$ref !== 'string') {
        fail(`${schemaPath}/$ref`, '$ref', 'must be a string');
      } else {
        const resolved = resolveLocalReference(schema, nodeSchema.$ref);
        if (!resolved.ok) fail(`${schemaPath}/$ref`, '$ref', resolved.reason);
      }
    }

    for (const keyword of ['$defs', 'properties']) {
      if (!hasOwn(nodeSchema, keyword)) continue;
      const map = nodeSchema[keyword];
      if (!isPlainObject(map)) {
        fail(`${schemaPath}/${keyword}`, keyword, 'must be an object whose values are schemas');
        continue;
      }
      for (const [name, childSchema] of Object.entries(map)) {
        visit(childSchema, `${schemaPath}/${keyword}/${escapePointer(name)}`);
      }
    }

    if (hasOwn(nodeSchema, 'additionalProperties')) {
      const childSchema = nodeSchema.additionalProperties;
      if (typeof childSchema !== 'boolean' && !isPlainObject(childSchema)) {
        fail(`${schemaPath}/additionalProperties`, 'additionalProperties', 'must be a schema object or boolean schema');
      } else {
        visit(childSchema, `${schemaPath}/additionalProperties`);
      }
    }
    if (hasOwn(nodeSchema, 'items')) visit(nodeSchema.items, `${schemaPath}/items`);

    for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
      if (!hasOwn(nodeSchema, keyword)) continue;
      const schemas = nodeSchema[keyword];
      if (!Array.isArray(schemas) || schemas.length === 0) {
        fail(`${schemaPath}/${keyword}`, keyword, 'must be a non-empty array of schemas');
        continue;
      }
      schemas.forEach((childSchema, index) => visit(childSchema, `${schemaPath}/${keyword}/${index}`));
    }
    for (const keyword of ['not', 'if', 'then', 'else']) {
      if (hasOwn(nodeSchema, keyword)) visit(nodeSchema[keyword], `${schemaPath}/${keyword}`);
    }

    if (hasOwn(nodeSchema, 'dependentRequired')) {
      const dependencies = nodeSchema.dependentRequired;
      if (!isPlainObject(dependencies)) {
        fail(`${schemaPath}/dependentRequired`, 'dependentRequired', 'must be an object');
      } else {
        for (const [property, required] of Object.entries(dependencies)) {
          if (!Array.isArray(required) || required.some((entry) => typeof entry !== 'string') || new Set(required).size !== required.length) {
            fail(`${schemaPath}/dependentRequired/${escapePointer(property)}`, 'dependentRequired', 'must be an array of unique strings');
          }
        }
      }
    }

    activeSchemas.delete(nodeSchema);
  };

  visit(schema, '#');
  return errors;
}

export function validateJsonSchema(schema, value) {
  const definitionErrors = validateSchemaDefinition(schema);
  if (definitionErrors.length) {
    return definitionErrors.map((error) => ({
      instancePath: '',
      schemaPath: error.schemaPath,
      keyword: error.keyword,
      message: `invalid schema at ${error.schemaPath}: ${error.message}`,
    }));
  }

  const errors = [];
  const visit = (nodeSchema, nodeValue, instancePath, output, activeReferences) => {
    const fail = (keyword, message) => output.push({ instancePath, keyword, message });
    if (typeof nodeValue === 'number' && !Number.isFinite(nodeValue)) {
      fail('type', 'must be a finite JSON number');
      return;
    }
    if (nodeSchema === true) return;
    if (nodeSchema === false) {
      fail('falseSchema', 'is rejected by the false schema');
      return;
    }

    const probe = (candidateSchema) => {
      const branchErrors = [];
      visit(candidateSchema, nodeValue, instancePath, branchErrors, new Set(activeReferences));
      return branchErrors;
    };

    if (hasOwn(nodeSchema, '$ref')) {
      const referenceKey = `${nodeSchema.$ref}\u0000${instancePath}`;
      if (activeReferences.has(referenceKey)) {
        fail('$ref', `circular local reference ${nodeSchema.$ref}`);
      } else {
        const resolved = resolveLocalReference(schema, nodeSchema.$ref);
        if (!resolved.ok) {
          fail('$ref', resolved.reason);
        } else {
          activeReferences.add(referenceKey);
          visit(resolved.schema, nodeValue, instancePath, output, activeReferences);
          activeReferences.delete(referenceKey);
        }
      }
    }

    for (const childSchema of nodeSchema.allOf || []) {
      visit(childSchema, nodeValue, instancePath, output, activeReferences);
    }
    if (nodeSchema.anyOf) {
      const matches = nodeSchema.anyOf.filter((childSchema) => probe(childSchema).length === 0).length;
      if (matches === 0) fail('anyOf', 'must match at least one subschema');
    }
    if (nodeSchema.oneOf) {
      const matches = nodeSchema.oneOf.filter((childSchema) => probe(childSchema).length === 0).length;
      if (matches !== 1) fail('oneOf', `must match exactly one subschema; matched ${matches}`);
    }
    if (hasOwn(nodeSchema, 'not') && probe(nodeSchema.not).length === 0) {
      fail('not', 'must not match the prohibited subschema');
    }
    if (hasOwn(nodeSchema, 'if')) {
      const conditionMatches = probe(nodeSchema.if).length === 0;
      if (conditionMatches && hasOwn(nodeSchema, 'then')) {
        visit(nodeSchema.then, nodeValue, instancePath, output, activeReferences);
      } else if (!conditionMatches && hasOwn(nodeSchema, 'else')) {
        visit(nodeSchema.else, nodeValue, instancePath, output, activeReferences);
      }
    }

    if (hasOwn(nodeSchema, 'const') && !equal(nodeValue, nodeSchema.const)) {
      fail('const', `must equal ${JSON.stringify(nodeSchema.const)}`);
    }
    if (hasOwn(nodeSchema, 'enum') && !nodeSchema.enum.some((candidate) => equal(nodeValue, candidate))) {
      fail('enum', `must be one of ${nodeSchema.enum.map((item) => JSON.stringify(item)).join(', ')}`);
    }

    const expectedTypes = hasOwn(nodeSchema, 'type')
      ? (Array.isArray(nodeSchema.type) ? nodeSchema.type : [nodeSchema.type])
      : [];
    if (expectedTypes.length && !expectedTypes.some((expected) => matchesType(nodeValue, expected))) {
      fail('type', `must be ${expectedTypes.join(' or ')}`);
      return;
    }

    if (typeof nodeValue === 'string') {
      if (nodeSchema.minLength !== undefined && nodeValue.length < nodeSchema.minLength) fail('minLength', `must have length >= ${nodeSchema.minLength}`);
      if (nodeSchema.maxLength !== undefined && nodeValue.length > nodeSchema.maxLength) fail('maxLength', `must have length <= ${nodeSchema.maxLength}`);
      if (nodeSchema.pattern !== undefined && !new RegExp(nodeSchema.pattern).test(nodeValue)) fail('pattern', `must match ${nodeSchema.pattern}`);
      if (nodeSchema.format === 'date' && !isValidDate(nodeValue)) fail('format', 'must be a valid YYYY-MM-DD date');
      if (nodeSchema.format === 'date-time' && !isValidDateTime(nodeValue)) fail('format', 'must be a valid RFC 3339 date-time');
      if (nodeSchema.format === 'uri') {
        try {
          const parsed = new URL(nodeValue);
          if (!parsed.protocol) throw new Error('missing protocol');
        } catch {
          fail('format', 'must be an absolute URI');
        }
      }
    }

    if (typeof nodeValue === 'number') {
      if (nodeSchema.minimum !== undefined && nodeValue < nodeSchema.minimum) fail('minimum', `must be >= ${nodeSchema.minimum}`);
      if (nodeSchema.maximum !== undefined && nodeValue > nodeSchema.maximum) fail('maximum', `must be <= ${nodeSchema.maximum}`);
      if (nodeSchema.exclusiveMinimum !== undefined && nodeValue <= nodeSchema.exclusiveMinimum) fail('exclusiveMinimum', `must be > ${nodeSchema.exclusiveMinimum}`);
      if (nodeSchema.exclusiveMaximum !== undefined && nodeValue >= nodeSchema.exclusiveMaximum) fail('exclusiveMaximum', `must be < ${nodeSchema.exclusiveMaximum}`);
      if (nodeSchema.multipleOf !== undefined && !isMultipleOf(nodeValue, nodeSchema.multipleOf)) fail('multipleOf', `must be a multiple of ${nodeSchema.multipleOf}`);
    }

    if (Array.isArray(nodeValue)) {
      if (nodeSchema.minItems !== undefined && nodeValue.length < nodeSchema.minItems) fail('minItems', `must contain >= ${nodeSchema.minItems} items`);
      if (nodeSchema.maxItems !== undefined && nodeValue.length > nodeSchema.maxItems) fail('maxItems', `must contain <= ${nodeSchema.maxItems} items`);
      if (nodeSchema.uniqueItems) {
        const keys = nodeValue.map((item) => JSON.stringify(stable(item)));
        if (new Set(keys).size !== keys.length) fail('uniqueItems', 'must not contain duplicate items');
      }
      if (hasOwn(nodeSchema, 'items')) {
        nodeValue.forEach((item, index) => visit(nodeSchema.items, item, `${instancePath}/${index}`, output, activeReferences));
      }
    }

    if (isPlainObject(nodeValue)) {
      const propertyCount = Object.keys(nodeValue).length;
      if (nodeSchema.minProperties !== undefined && propertyCount < nodeSchema.minProperties) fail('minProperties', `must contain >= ${nodeSchema.minProperties} properties`);
      if (nodeSchema.maxProperties !== undefined && propertyCount > nodeSchema.maxProperties) fail('maxProperties', `must contain <= ${nodeSchema.maxProperties} properties`);

      for (const required of nodeSchema.required || []) {
        if (!hasOwn(nodeValue, required)) fail('required', `missing property ${required}`);
      }
      for (const [trigger, dependencies] of Object.entries(nodeSchema.dependentRequired || {})) {
        if (!hasOwn(nodeValue, trigger)) continue;
        for (const dependency of dependencies) {
          if (!hasOwn(nodeValue, dependency)) fail('dependentRequired', `property ${trigger} requires property ${dependency}`);
        }
      }

      const properties = nodeSchema.properties || {};
      for (const [key, child] of Object.entries(nodeValue)) {
        const childPath = `${instancePath}/${escapePointer(key)}`;
        if (hasOwn(properties, key)) visit(properties[key], child, childPath, output, activeReferences);
        else if (nodeSchema.additionalProperties === false) output.push({ instancePath: childPath, keyword: 'additionalProperties', message: 'property is not allowed' });
        else if (hasOwn(nodeSchema, 'additionalProperties') && nodeSchema.additionalProperties !== true) {
          visit(nodeSchema.additionalProperties, child, childPath, output, activeReferences);
        }
      }
    }
  };

  visit(schema, value, '', errors, new Set());
  return errors;
}

export function assertJsonSchema(schema, value, label = 'JSON document') {
  const errors = validateJsonSchema(schema, value);
  if (errors.length) {
    const detail = errors.map((error) => `${error.instancePath || '/'} [${error.keyword}] ${error.message}`).join('\n');
    throw new Error(`${label} failed schema validation:\n${detail}`);
  }
}
