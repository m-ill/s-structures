// Dependency-free JSON Schema subset used by Phase 17 contracts.
// Supported keywords: type, required, properties, additionalProperties,
// const, enum, pattern, format(date|uri), minimum/maximum, min/maxLength,
// min/maxItems, uniqueItems and items.

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
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
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

export function validateJsonSchema(schema, value) {
  const errors = [];

  const fail = (instancePath, keyword, message) => errors.push({ instancePath, keyword, message });

  const visit = (nodeSchema, nodeValue, instancePath) => {
    if (!nodeSchema || typeof nodeSchema !== 'object') return;

    if ('const' in nodeSchema && !equal(nodeValue, nodeSchema.const)) {
      fail(instancePath, 'const', `must equal ${JSON.stringify(nodeSchema.const)}`);
    }
    if (nodeSchema.enum && !nodeSchema.enum.some((candidate) => equal(nodeValue, candidate))) {
      fail(instancePath, 'enum', `must be one of ${nodeSchema.enum.map((item) => JSON.stringify(item)).join(', ')}`);
    }

    const expectedTypes = nodeSchema.type
      ? (Array.isArray(nodeSchema.type) ? nodeSchema.type : [nodeSchema.type])
      : [];
    if (expectedTypes.length && !expectedTypes.some((expected) => matchesType(nodeValue, expected))) {
      fail(instancePath, 'type', `must be ${expectedTypes.join(' or ')}`);
      return;
    }

    if (typeof nodeValue === 'string') {
      if (nodeSchema.minLength !== undefined && nodeValue.length < nodeSchema.minLength) fail(instancePath, 'minLength', `must have length >= ${nodeSchema.minLength}`);
      if (nodeSchema.maxLength !== undefined && nodeValue.length > nodeSchema.maxLength) fail(instancePath, 'maxLength', `must have length <= ${nodeSchema.maxLength}`);
      if (nodeSchema.pattern && !new RegExp(nodeSchema.pattern).test(nodeValue)) fail(instancePath, 'pattern', `must match ${nodeSchema.pattern}`);
      if (nodeSchema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(nodeValue)) fail(instancePath, 'format', 'must be YYYY-MM-DD');
      if (nodeSchema.format === 'uri') {
        try {
          const parsed = new URL(nodeValue);
          if (!parsed.protocol) throw new Error('missing protocol');
        } catch {
          fail(instancePath, 'format', 'must be an absolute URI');
        }
      }
    }

    if (typeof nodeValue === 'number' && Number.isFinite(nodeValue)) {
      if (nodeSchema.minimum !== undefined && nodeValue < nodeSchema.minimum) fail(instancePath, 'minimum', `must be >= ${nodeSchema.minimum}`);
      if (nodeSchema.maximum !== undefined && nodeValue > nodeSchema.maximum) fail(instancePath, 'maximum', `must be <= ${nodeSchema.maximum}`);
    }

    if (Array.isArray(nodeValue)) {
      if (nodeSchema.minItems !== undefined && nodeValue.length < nodeSchema.minItems) fail(instancePath, 'minItems', `must contain >= ${nodeSchema.minItems} items`);
      if (nodeSchema.maxItems !== undefined && nodeValue.length > nodeSchema.maxItems) fail(instancePath, 'maxItems', `must contain <= ${nodeSchema.maxItems} items`);
      if (nodeSchema.uniqueItems) {
        const keys = nodeValue.map((item) => JSON.stringify(stable(item)));
        if (new Set(keys).size !== keys.length) fail(instancePath, 'uniqueItems', 'must not contain duplicate items');
      }
      if (nodeSchema.items) nodeValue.forEach((item, index) => visit(nodeSchema.items, item, `${instancePath}/${index}`));
    }

    if (nodeValue !== null && typeof nodeValue === 'object' && !Array.isArray(nodeValue)) {
      for (const required of nodeSchema.required || []) {
        if (!(required in nodeValue)) fail(instancePath, 'required', `missing property ${required}`);
      }
      const properties = nodeSchema.properties || {};
      for (const [key, child] of Object.entries(nodeValue)) {
        if (key in properties) visit(properties[key], child, `${instancePath}/${escapePointer(key)}`);
        else if (nodeSchema.additionalProperties === false) fail(`${instancePath}/${escapePointer(key)}`, 'additionalProperties', 'property is not allowed');
        else if (nodeSchema.additionalProperties && typeof nodeSchema.additionalProperties === 'object') visit(nodeSchema.additionalProperties, child, `${instancePath}/${escapePointer(key)}`);
      }
    }
  };

  visit(schema, value, '');
  return errors;
}

export function assertJsonSchema(schema, value, label = 'JSON document') {
  const errors = validateJsonSchema(schema, value);
  if (errors.length) {
    const detail = errors.map((error) => `${error.instancePath || '/'} [${error.keyword}] ${error.message}`).join('\n');
    throw new Error(`${label} failed schema validation:\n${detail}`);
  }
}
