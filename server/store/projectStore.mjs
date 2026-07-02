import { extname, join } from 'node:path';
import {
  ensureDir, isValidId, joinSafe, listDir, newId, readBuffer, readJson,
  removeDir, writeBufferAtomic, writeJsonAtomic,
} from './fileStore.mjs';

const ROLE_RANK = { viewer: 1, reviewer: 2, engineer: 3, owner: 4 };

export function roleAtLeast(role, minRole) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minRole] || 0);
}

export function createProjectStore(dataDir) {
  const projectsRoot = join(dataDir, 'projects');

  function projectDir(id) {
    return joinSafe(projectsRoot, id);
  }

  async function readProjectMeta(id) {
    return readJson(join(projectDir(id), 'project.json'), null);
  }

  async function writeProjectMeta(id, meta) {
    await writeJsonAtomic(join(projectDir(id), 'project.json'), meta);
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
        approval: { state: 'none', rev: null, approvedAt: null, approvedBy: null },
        revisionCount: 0,
      };
      await ensureDir(projectDir(id));
      await ensureDir(join(projectDir(id), 'revisions'));
      await ensureDir(join(projectDir(id), 'files'));
      await ensureDir(join(projectDir(id), 'imports'));
      await ensureDir(join(projectDir(id), 'libraries'));
      await writeProjectMeta(id, meta);
      await writeJsonAtomic(join(projectDir(id), 'revisions', 'index.json'), []);
      await writeJsonAtomic(join(projectDir(id), 'files', 'index.json'), []);
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
      const meta = await this.get(id);
      if (!meta) return null;
      const revisions = await this.listRevisions(id);
      const latest = revisions.at(-1) || null;
      const rev = (latest?.rev || 0) + 1;
      const lineageWarning = latest != null && parentRev != null && parentRev !== latest.rev;
      const entry = {
        rev, author, savedAt: new Date().toISOString(), note: note || '',
        schemaVersion: model?.schemaVersion ?? null, parentRev: parentRev ?? latest?.rev ?? null,
      };
      revisions.push(entry);
      await writeJsonAtomic(join(projectDir(id), 'revisions', 'index.json'), revisions);
      await writeJsonAtomic(join(projectDir(id), 'revisions', `${rev}.json`), model);
      meta.revisionCount = revisions.length;
      meta.updatedAt = new Date().toISOString();
      if (meta.approval.state === 'approved' && meta.approval.rev !== rev) {
        meta.approval = { state: 'revoked', rev: meta.approval.rev, approvedAt: null, approvedBy: null };
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

    async saveFile(id, { originalName, contentType, buffer }, allowedExtensions) {
      const ext = extname(originalName || '').toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        return { ok: false, code: 'UNSUPPORTED_EXTENSION' };
      }
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

    async setApproval(id, { state, rev, approvedBy }) {
      const meta = await this.get(id);
      if (!meta) return null;
      meta.approval = {
        state, rev: rev ?? meta.approval.rev,
        approvedAt: state === 'approved' ? new Date().toISOString() : null,
        approvedBy: state === 'approved' ? approvedBy : null,
      };
      await writeProjectMeta(id, meta);
      return meta.approval;
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
  };
}

function libraryFile(root, kind) {
  return join(root, 'libraries', kind === 'sections' ? 'sections.json' : 'materials.json');
}
