import { authenticate, requireProjectRole } from '../auth/guard.mjs';
import { ApiError, ok, readRawBody } from '../router.mjs';

export function registerFileRoutes(router, ctx) {
  router.get('/api/projects/:id/files', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const files = await ctx.projectStore.listFiles(params.id);
    return ok({ files });
  });

  router.post('/api/projects/:id/files', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'engineer');
    const originalName = readUploadFileName(req.headers['x-file-name']);
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const buffer = await readRawBody(req, ctx.config.maxUploadBytes);
    if (!buffer.length) throw new ApiError(400, 'VALIDATION', 'Upload body is empty.');
    const result = await ctx.projectStore.saveFile(
      params.id, { originalName, contentType, buffer }, ctx.config.allowedUploadExtensions,
    );
    if (!result.ok) throw new ApiError(400, 'VALIDATION', 'File extension is not allowed.');
    return ok({ file: result.entry });
  }, { bodyType: 'raw' });

  router.get('/api/projects/:id/files/:fileId', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'viewer');
    const found = await ctx.projectStore.getFile(params.id, params.fileId);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'File not found.');
    res.writeHead(200, {
      'Content-Type': found.entry.contentType,
      'Content-Length': found.buffer.length,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(found.entry.originalName)}"`,
    });
    res.end(found.buffer);
    return { handled: true };
  });

  router.delete('/api/projects/:id/files/:fileId', async (req, res, params) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await requireProjectRole(ctx, params.id, user.id, 'engineer');
    const deleted = await ctx.projectStore.deleteFile(params.id, params.fileId);
    if (!deleted) throw new ApiError(404, 'NOT_FOUND', 'File not found.');
    return ok({ deleted: true });
  });
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
