import { validatePasswordStrength } from '../auth/password.mjs';
import { issueToken } from '../auth/token.mjs';
import { authenticate } from '../auth/guard.mjs';
import { ApiError, ok } from '../router.mjs';
import { publicUser } from '../store/userStore.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerAuthRoutes(router, ctx) {
  router.post('/api/auth/register', async (req, res, params, body) => {
    if (!ctx.config.allowRegistration) {
      throw new ApiError(403, 'FORBIDDEN', 'Registration is disabled on this server.');
    }
    const { email, password, name } = body || {};
    if (!EMAIL_RE.test(String(email || ''))) {
      throw new ApiError(400, 'VALIDATION', 'A valid email is required.');
    }
    const strength = validatePasswordStrength(password);
    if (!strength.ok) throw new ApiError(400, 'VALIDATION', strength.message);
    const result = await ctx.userStore.create({ email, password, name });
    if (!result.ok) throw new ApiError(409, 'CONFLICT', 'Email is already registered.');
    return ok({ user: publicUser(result.user) });
  });

  router.post('/api/auth/login', async (req, res, params, body) => {
    const { email, password } = body || {};
    const result = await ctx.userStore.verifyCredentials(email, password, {
      failLimit: ctx.config.loginFailLimit,
      lockSeconds: ctx.config.loginLockSeconds,
    });
    if (!result.ok) {
      const message = result.code === 'LOCKED'
        ? 'Account is temporarily locked after repeated failed logins.'
        : 'Invalid email or password.';
      throw new ApiError(401, 'UNAUTHORIZED', message, { reason: result.code });
    }
    const secret = await ctx.userStore.getSecret();
    const { token, expiresAt } = issueToken(
      secret,
      { uid: result.user.id, ver: result.user.tokenVersion || 1 },
      ctx.config.tokenTtlSeconds,
    );
    return ok({ token, expiresAt, user: publicUser(result.user) });
  });

  router.post('/api/auth/logout', async (req) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    await ctx.userStore.bumpTokenVersion(user.id);
    return ok({ loggedOut: true });
  });

  router.get('/api/auth/me', async (req) => {
    const user = await authenticate({ req, userStore: ctx.userStore });
    return ok({ user: publicUser(user) });
  });
}
