import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok, readRawBody } from '../router.mjs';

export function registerFileRoutes(router, ctx) {
  router.get('/api/projects/:id/files', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const files = await ctx.projectStore.listFiles(params.id);
    return ok({ files });
  }, { auth: { project: true, role: 'viewer' } });

  router.post('/api/projects/:id/files', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'engineer');
    const releaseSlot = acquireUploadSlot(ctx, params.id);
    try {
      const originalName = readUploadFileName(req.headers['x-file-name']);
      const contentType = req.headers['content-type'] || 'application/octet-stream';
      const declared = Number(req.headers['content-length'] || 0);
      if (declared > ctx.config.maxUploadBytes) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Upload exceeds the size limit.');
      const usage = await ctx.projectStore.storageUsage(params.id);
      if (usage.fileCount >= ctx.config.maxFilesPerProject) throw new ApiError(409, 'FILE_QUOTA', 'Project file quota is exhausted.');
      if (declared && usage.totalBytes + declared > ctx.config.maxProjectStorageBytes) {
        throw new ApiError(413, 'STORAGE_QUOTA', 'Project storage quota would be exceeded.');
      }
      const buffer = await readRawBody(req, ctx.config.maxUploadBytes);
      if (!buffer.length) throw new ApiError(400, 'VALIDATION', 'Upload body is empty.');
      const result = await ctx.projectStore.saveFile(
        params.id,
        { originalName, contentType, buffer },
        ctx.config.allowedUploadExtensions,
        { maxFiles: ctx.config.maxFilesPerProject, maxBytes: ctx.config.maxProjectStorageBytes },
      );
      if (!result.ok) {
        if (result.code === 'FILE_QUOTA') throw new ApiError(409, result.code, 'Project file quota is exhausted.');
        if (result.code === 'STORAGE_QUOTA') throw new ApiError(413, result.code, 'Project storage quota would be exceeded.');
        throw new ApiError(400, 'VALIDATION', 'File extension is not allowed.');
      }
      return ok({ file: result.entry });
    } finally {
      releaseSlot();
    }
  }, { bodyType: 'raw', auth: { project: true, role: 'engineer' } });

  router.get('/api/projects/:id/files/:fileId', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const found = await ctx.projectStore.getFile(params.id, params.fileId);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'File not found.');
    res.writeHead(200, {
      'Content-Type': safeDownloadContentType(found.entry.contentType),
      'Content-Length': found.buffer.length,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(found.entry.originalName)}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(found.buffer);
    return { handled: true };
  }, { auth: { project: true, role: 'viewer' } });

  router.delete('/api/projects/:id/files/:fileId', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'engineer');
    const deleted = await ctx.projectStore.deleteFile(params.id, params.fileId);
    if (!deleted) throw new ApiError(404, 'NOT_FOUND', 'File not found.');
    return ok({ deleted: true });
  }, { auth: { project: true, role: 'engineer' } });
}

function acquireUploadSlot(ctx, projectId) {
  ctx.uploadCounts ||= new Map();
  const count = ctx.uploadCounts.get(projectId) || 0;
  if (count >= ctx.config.maxConcurrentUploads) {
    throw new ApiError(429, 'UPLOAD_BUSY', 'Too many concurrent uploads for this project.');
  }
  ctx.uploadCounts.set(projectId, count + 1);
  return () => {
    const next = (ctx.uploadCounts.get(projectId) || 1) - 1;
    if (next <= 0) ctx.uploadCounts.delete(projectId);
    else ctx.uploadCounts.set(projectId, next);
  };
}

function readUploadFileName(value) {
  if (!value) return 'upload';
  let decoded;
  try {
    decoded = decodeURIComponent(String(value));
  } catch {
    throw new ApiError(400, 'BAD_URI', 'Upload file name contains invalid percent encoding.');
  }
  const name = decoded.trim();
  if (!name || name.length > 240 || /[/\\\0-\x1f\x7f]/.test(name)) {
    throw new ApiError(400, 'VALIDATION', 'Upload file name is not valid.');
  }
  return name;
}

const SAFE_DOWNLOAD_TYPES = new Set([
  'application/dxf',
  'application/json',
  'application/octet-stream',
  'text/plain',
]);

function safeDownloadContentType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase();
  if (SAFE_DOWNLOAD_TYPES.has(type)) return type;
  return 'application/octet-stream';
}
