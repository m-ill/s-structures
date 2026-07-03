import { verifyToken } from './token.mjs';
import { isProjectRole, roleAtLeast } from '../store/projectStore.mjs';
import { ApiError } from '../router.mjs';

export function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

export async function authenticate(ctx) {
  const token = extractBearerToken(ctx.req);
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Missing bearer token.');
  const secret = await ctx.userStore.getSecret();
  const result = verifyToken(secret, token);
  if (!result.ok) throw new ApiError(401, 'UNAUTHORIZED', `Invalid token (${result.reason}).`);
  const user = await ctx.userStore.findById(result.claims.uid);
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'User no longer exists.');
  if ((user.tokenVersion || 1) !== result.claims.ver) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Token has been invalidated.');
  }
  ctx.req.user = user;
  return user;
}

export async function requireProjectRole(ctx, projectId, userId, minRole) {
  if (!isProjectRole(minRole)) {
    throw new ApiError(500, 'INTERNAL', 'Project role guard is misconfigured.');
  }
  const role = await ctx.projectStore.memberRole(projectId, userId);
  if (!role) throw new ApiError(404, 'NOT_FOUND', 'Project not found.');
  if (!roleAtLeast(role, minRole)) {
    await ctx.auditLog?.append('forbidden', { projectId, userId, role, requiredRole: minRole });
    throw new ApiError(403, 'FORBIDDEN', `Requires role >= ${minRole}, has ${role}.`);
  }
  return role;
}
