import { migrateToV3 } from '../core/migration.js';
import { productModelSignature } from '../ui/indexNativePersistence.js';

export const PERSISTENCE_CLIENT_VERSION = 'p3-persistence-client-v2';

/**
 * L3 (server project) layer. L1 (browser local) and L2 (file export/import)
 * already exist in src/ui/indexNativePersistence.js — this module adds the
 * server round trip and keeps all three layers on the same signature check
 * (PERSISTENCE_PLAN.md).
 */
export function createPersistenceClient(api) {
  return {
    version: PERSISTENCE_CLIENT_VERSION,

    async saveToServer(projectId, inputModel, { note, parentRev } = {}) {
      const model = migrateToV3(inputModel);
      const result = await api.post(`/api/projects/${projectId}/revisions`, {
        body: { model, note: note || '', parentRev: parentRev ?? null },
      });
      return {
        rev: result.revision.rev,
        lineageWarning: result.lineageWarning,
        latestRev: result.latestRev ?? result.lineage?.latestRev ?? null,
        lineage: result.lineage || null,
        signature: productModelSignature(model),
      };
    },

    async loadFromServer(projectId, rev) {
      const result = await api.get(`/api/projects/${projectId}/revisions/${rev}`);
      const model = migrateToV3(result.model);
      return { model, signature: productModelSignature(model) };
    },

    async listRevisions(projectId) {
      const result = await api.get(`/api/projects/${projectId}/revisions`);
      return result.revisions;
    },
  };
}
