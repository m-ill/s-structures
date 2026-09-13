import { migrateModel } from './migration.js';
import { validateModel } from './validation.js';

export function exportModel(model, options = {}) {
  if(model?.designDetails||['materials','sections'].some(key=>model?.[key]?.some(row=>String(row.inputContract||'').startsWith('p24-'))))throw Object.assign(new Error('Use Product Book v2 to preserve practical design input compatibility.'),{code:'PRODUCT_BOOK_REQUIRED'});
  const migrated = migrateModel(model);
  const payload = {
    ...migrated.model,
    exportedAt: options.exportedAt || new Date().toISOString(),
  };
  if (options.includeResults && options.results) payload.results = options.results;
  return payload;
}

export function modelToJson(model, options = {}) {
  return JSON.stringify(exportModel(model, options), null, 2);
}

export function parseModelJson(text) {
  try {
    const raw = JSON.parse(text);
    const migration = migrateModel(raw);
    const validation = validateModel(migration.model);
    return {
      ok: validation.ok,
      model: migration.model,
      migrations: migration.migrations,
      validation,
    };
  } catch (error) {
    return {
      ok: false,
      model: null,
      migrations: [],
      validation: {
        ok: false,
        errors: [{
          level: 'ERROR',
          code: 'BAD_JSON',
          message: error instanceof Error ? error.message : String(error),
          target: 'json',
        }],
        warnings: [],
      },
    };
  }
}
