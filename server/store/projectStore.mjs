import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { extname, join } from 'node:path';
import {
  ensureDir, isValidId, joinSafe, listDir, newId, readBuffer, readJson,
  removeDir, withLock, writeBufferAtomic, writeJsonAtomic, writeJsonAtomicUnlocked,
} from './fileStore.mjs';

export const PROJECT_ROLES = ['viewer', 'reviewer', 'engineer', 'owner'];

const ROLE_RANK = { viewer: 1, reviewer: 2, engineer: 3, owner: 4 };
const requestCache = new AsyncLocalStorage();

export async function withProjectStoreRequestCache(fn) {
  return requestCache.run(new Map(), fn);
}

export function roleAtLeast(role, minRole) {
  if (!isProjectRole(role) || !isProjectRole(minRole)) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export function isProjectRole(role) {
  return PROJECT_ROLES.includes(role);
}

export function createProjectStore(dataDir) {
  const projectsRoot = join(dataDir, 'projects');
  const debug = { metaReads: new Map() };

  function projectDir(id) {
    return joinSafe(projectsRoot, id);
  }

  async function readProjectMeta(id) {
    const cache = requestCache.getStore();
    const cacheKey = `${dataDir}:${id}`;
    if (cache?.has(cacheKey)) return cache.get(cacheKey);
    debug.metaReads.set(id, (debug.metaReads.get(id) || 0) + 1);
    const meta = await readJson(join(projectDir(id), 'project.json'), null);
    cache?.set(cacheKey, meta);
    return meta;
  }

  async function writeProjectMeta(id, meta) {
    await writeJsonAtomic(join(projectDir(id), 'project.json'), meta);
    requestCache.getStore()?.set(`${dataDir}:${id}`, meta);
  }

  return {
    async list(userId) {
      const ids = await listDir(projectsRoot);
      const projects = [];
      for (const id of ids) {
        if (!isValidId(id)) continue;
        const meta = await readProjectMeta(id);
        if (!meta || meta.deleted) continue;
        if (meta.members.some((member) => member.userId === userId)) {
          projects.push(meta);
        }
      }
      return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async create(userId, { name, description }) {
      const id = newId();
      const meta = {
        id,
        name: String(name || 'Untitled project').trim(),
        description: String(description || ''),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false,
        members: [{ userId, role: 'owner' }],
        approval: {
          state: 'none', rev: null, modelHash: null, current: false, version: 0,
          approvedAt: null, approvedBy: null, releasedAt: null, releasedBy: null, history: [],
        },
        revisionCount: 0,
      };
      await ensureDir(projectDir(id));
      await ensureDir(join(projectDir(id), 'revisions'));
      await ensureDir(join(projectDir(id), 'files'));
      await ensureDir(join(projectDir(id), 'imports'));
      await ensureDir(join(projectDir(id), 'evidence'));
      await ensureDir(join(projectDir(id), 'libraries'));
      await writeProjectMeta(id, meta);
      await writeJsonAtomic(join(projectDir(id), 'revisions', 'index.json'), []);
      await writeJsonAtomic(join(projectDir(id), 'files', 'index.json'), []);
      await writeJsonAtomic(join(projectDir(id), 'evidence', 'index.json'), []);
      await writeJsonAtomic(join(projectDir(id), 'libraries', 'materials.json'), []);
      await writeJsonAtomic(join(projectDir(id), 'libraries', 'sections.json'), []);
      return meta;
    },

    async get(id) {
      if (!isValidId(id)) return null;
      const meta = await readProjectMeta(id);
      if (!meta || meta.deleted) return null;
      return meta;
    },

    async memberRole(id, userId) {
      const meta = await this.get(id);
      if (!meta) return null;
      const member = meta.members.find((item) => item.userId === userId);
      return member ? member.role : null;
    },

    async update(id, patch) {
      const meta = await this.get(id);
      if (!meta) return null;
      const next = { ...meta, ...patch, updatedAt: new Date().toISOString() };
      await writeProjectMeta(id, next);
      return next;
    },

    async softDelete(id) {
      const meta = await this.get(id);
      if (!meta) return null;
      meta.deleted = true;
      meta.updatedAt = new Date().toISOString();
      await writeProjectMeta(id, meta);
      return meta;
    },

    async setMemberRole(id, userId, role) {
      const meta = await this.get(id);
      if (!meta) return null;
      const index = meta.members.findIndex((member) => member.userId === userId);
      if (index === -1) meta.members.push({ userId, role });
      else meta.members[index].role = role;
      await writeProjectMeta(id, meta);
      return meta;
    },

    async removeMember(id, userId) {
      const meta = await this.get(id);
      if (!meta) return null;
      meta.members = meta.members.filter((member) => member.userId !== userId);
      await writeProjectMeta(id, meta);
      return meta;
    },

    async listRevisions(id) {
      return (await readJson(join(projectDir(id), 'revisions', 'index.json'), [])) || [];
    },

    async saveRevision(id, { model, note, author, parentRev }) {
      if (!isValidId(id)) return null;
      const [meta, revisions] = await Promise.all([this.get(id), this.listRevisions(id)]);
      if (!meta) return null;
      const latest = revisions.at(-1) || null;
      const rev = (latest?.rev ?? 0) + 1;
      const lineageWarning = latest != null && parentRev != null && parentRev !== latest.rev;
      const entry = {
        rev, author, savedAt: new Date().toISOString(), note: note || '',
        schemaVersion: model?.schemaVersion ?? null, parentRev: parentRev ?? latest?.rev ?? null,
        modelHash: hashRevisionModel(model),
      };
      revisions.push(entry);
      await writeJsonAtomic(join(projectDir(id), 'revisions', 'index.json'), revisions);
      await writeJsonAtomic(join(projectDir(id), 'revisions', `${rev}.json`), model);
      meta.revisionCount = revisions.length;
      meta.updatedAt = new Date().toISOString();
      const approval = normalizeApproval(meta.approval);
      if (['approved', 'released'].includes(approval.state) && approval.rev !== rev) {
        const now = new Date().toISOString();
        const staleState = approval.state === 'released' ? 'stale' : 'revoked';
        meta.approval = {
          ...approval,
          state: staleState,
          current: false,
          version: approval.version + 1,
          staleAt: now,
          staleReason: 'NEW_REVISION',
          supersededByRev: rev,
          history: [...approval.history, {
            state: staleState, rev: approval.rev, modelHash: approval.modelHash,
            at: now, reason: 'NEW_REVISION', supersededByRev: rev,
          }],
        };
      }
      await writeProjectMeta(id, meta);
      return { entry, lineageWarning, latestRev: latest?.rev ?? null };
    },

    async getRevision(id, rev) {
      const revNum = Number(rev);
      if (!Number.isInteger(revNum) || revNum < 1) return null;
      return readJson(join(projectDir(id), 'revisions', `${revNum}.json`), null);
    },

    async listFiles(id) {
      return (await readJson(join(projectDir(id), 'files', 'index.json'), [])) || [];
    },

    async storageUsage(id) {
      const files = await this.listFiles(id);
      return { fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + Number(file.size || 0), 0) };
    },

    async saveFile(id, { originalName, contentType, buffer }, allowedExtensions, limits = {}) {
      const ext = extname(originalName || '').toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        return { ok: false, code: 'UNSUPPORTED_EXTENSION' };
      }
      const usage = await this.storageUsage(id);
      if (limits.maxFiles && usage.fileCount >= limits.maxFiles) return { ok: false, code: 'FILE_QUOTA' };
      if (limits.maxBytes && usage.totalBytes + buffer.length > limits.maxBytes) return { ok: false, code: 'STORAGE_QUOTA' };
      const fileId = newId();
      const storedName = `${fileId}${ext}`;
      await writeBufferAtomic(join(projectDir(id), 'files', storedName), buffer);
      const files = await this.listFiles(id);
      const entry = {
        id: fileId, originalName: originalName || storedName, storedName,
        contentType: contentType || 'application/octet-stream', size: buffer.length,
        uploadedAt: new Date().toISOString(),
      };
      files.push(entry);
      await writeJsonAtomic(join(projectDir(id), 'files', 'index.json'), files);
      return { ok: true, entry };
    },

    async getFile(id, fileId) {
      if (!isValidId(fileId)) return null;
      const files = await this.listFiles(id);
      const entry = files.find((file) => file.id === fileId);
      if (!entry) return null;
      const buffer = await readBuffer(join(projectDir(id), 'files', entry.storedName));
      return { entry, buffer };
    },

    async deleteFile(id, fileId) {
      const files = await this.listFiles(id);
      const next = files.filter((file) => file.id !== fileId);
      if (next.length === files.length) return false;
      await writeJsonAtomic(join(projectDir(id), 'files', 'index.json'), next);
      return true;
    },

    async listImports(id) {
      const ids = await listDir(join(projectDir(id), 'imports'));
      const imports = [];
      for (const file of ids) {
        if (!file.endsWith('.json')) continue;
        const data = await readJson(join(projectDir(id), 'imports', file), null);
        if (data) imports.push(data);
      }
      return imports.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async saveImport(id, { fileId, candidate, audit }) {
      const importId = newId();
      const entry = {
        id: importId, fileId: fileId || null, candidate, audit,
        status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null,
      };
      await writeJsonAtomic(join(projectDir(id), 'imports', `${importId}.json`), entry);
      return entry;
    },

    async getImport(id, importId) {
      if (!isValidId(importId)) return null;
      return readJson(join(projectDir(id), 'imports', `${importId}.json`), null);
    },

    async updateImport(id, importId, patch) {
      const existing = await this.getImport(id, importId);
      if (!existing) return null;
      const next = { ...existing, ...patch, resolvedAt: new Date().toISOString() };
      await writeJsonAtomic(join(projectDir(id), 'imports', `${importId}.json`), next);
      return next;
    },

    async listEvidence(id) {
      return (await readJson(join(projectDir(id), 'evidence', 'index.json'), [])) || [];
    },

    async addEvidence(id, { evidence, author }) {
      const meta = await this.get(id);
      if (!meta) return null;
      const rows = await this.listEvidence(id);
      const entry = {
        ...evidence,
        id: String(evidence.id || '').trim(),
        status: String(evidence.status || (evidence.accepted ? 'accepted' : 'submitted')).trim().toLowerCase(),
        accepted: evidence.accepted === true || String(evidence.status || '').toLowerCase() === 'accepted',
        author,
        recordedAt: new Date().toISOString(),
      };
      rows.push(entry);
      await ensureDir(join(projectDir(id), 'evidence'));
      await writeJsonAtomic(join(projectDir(id), 'evidence', 'index.json'), rows);
      meta.updatedAt = new Date().toISOString();
      await writeProjectMeta(id, meta);
      return entry;
    },

    async transitionApproval(id, { state, rev, actorId, expectedVersion }) {
      if (!isValidId(id)) return { ok: false, code: 'NOT_FOUND' };
      const metaPath = join(projectDir(id), 'project.json');
      return withLock(metaPath, async () => {
        const meta = await readJson(metaPath, null);
        if (!meta || meta.deleted) return { ok: false, code: 'NOT_FOUND' };
        const revisions = await this.listRevisions(id);
        const revNumber = Number(rev);
        const entry = revisions.find((item) => item.rev === revNumber);
        if (!entry) return { ok: false, code: 'REV_NOT_FOUND' };
        const latest = revisions.at(-1) || null;
        if (!latest || latest.rev !== revNumber) return { ok: false, code: 'STALE_REV', latestRev: latest?.rev ?? null };
        const model = await this.getRevision(id, revNumber);
        if (!model) return { ok: false, code: 'REV_NOT_FOUND' };
        const actualHash = hashRevisionModel(model);
        if (entry.modelHash && entry.modelHash !== actualHash) return { ok: false, code: 'REV_TAMPERED' };
        if (!entry.modelHash) {
          entry.modelHash = actualHash;
          await writeJsonAtomic(join(projectDir(id), 'revisions', 'index.json'), revisions);
        }

        const current = normalizeApproval(meta.approval);
        if (expectedVersion != null && Number(expectedVersion) !== current.version) {
          return { ok: false, code: 'VERSION_CONFLICT', currentVersion: current.version };
        }
        if (state === 'released' && !(current.state === 'approved' && current.current && current.rev === revNumber && current.modelHash === actualHash)) {
          return { ok: false, code: 'INVALID_TRANSITION' };
        }

        const now = new Date().toISOString();
        const event = { state, rev: revNumber, modelHash: actualHash, actorId, at: now };
        const next = state === 'approved'
          ? {
            state, rev: revNumber, modelHash: actualHash, current: true,
            version: current.version + 1, approvedAt: now, approvedBy: actorId,
            releasedAt: null, releasedBy: null, staleAt: null, staleReason: null,
            supersededByRev: null, history: [...current.history, event],
          }
          : {
            ...current, state, current: true, version: current.version + 1,
            releasedAt: now, releasedBy: actorId, history: [...current.history, event],
          };
        meta.approval = next;
        meta.updatedAt = now;
        await writeJsonAtomicUnlocked(metaPath, meta);
        requestCache.getStore()?.set(`${dataDir}:${id}`, meta);
        return { ok: true, approval: next, latestRev: latest.rev };
      });
    },

    async listLibrary(id, kind) {
      const file = libraryFile(projectDir(id), kind);
      return (await readJson(file, [])) || [];
    },

    async upsertLibraryItem(id, kind, item) {
      const file = libraryFile(projectDir(id), kind);
      const rows = await this.listLibrary(id, kind);
      const version = Number(item.version || 1);
      const index = rows.findIndex((row) => row.id === item.id && Number(row.version || 1) === version);
      if (index >= 0) rows[index] = item;
      else rows.push(item);
      await ensureDir(join(projectDir(id), 'libraries'));
      await writeJsonAtomic(file, rows);
      return item;
    },

    async purgeForTest(id) {
      await removeDir(projectDir(id));
    },

    debugMetaReadCount(id) {
      return debug.metaReads.get(id) || 0;
    },

    resetDebugCounters() {
      debug.metaReads.clear();
    },
  };
}

export function hashRevisionModel(model) {
  return createHash('sha256').update(stableStringify(model)).digest('hex');
}

function normalizeApproval(value = {}) {
  return {
    state: value.state || 'none',
    rev: value.rev ?? null,
    modelHash: value.modelHash || null,
    current: value.current === true || ['approved', 'released'].includes(value.state),
    version: Number(value.version || 0),
    approvedAt: value.approvedAt || null,
    approvedBy: value.approvedBy || null,
    releasedAt: value.releasedAt || null,
    releasedBy: value.releasedBy || null,
    staleAt: value.staleAt || null,
    staleReason: value.staleReason || null,
    supersededByRev: value.supersededByRev ?? null,
    history: Array.isArray(value.history) ? value.history : [],
  };
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function libraryFile(root, kind) {
  return join(root, 'libraries', kind === 'sections' ? 'sections.json' : 'materials.json');
}
