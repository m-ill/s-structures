export function createApiClient(options = {}) {
  const baseUrl = options.baseUrl || '';
  const fetchImpl = options.fetch || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) throw new Error('No fetch implementation available for the API client.');
  let token = options.token || null;

  async function request(method, path, { body, raw, headers } = {}) {
    const reqHeaders = { ...(headers || {}) };
    let payload;
    if (raw != null) {
      payload = raw;
    } else if (body !== undefined) {
      reqHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (token) reqHeaders.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(`${baseUrl}${path}`, { method, headers: reqHeaders, body: payload });
    const contentType = res.headers?.get ? res.headers.get('content-type') || '' : '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json() : await res.arrayBuffer();
    if (!res.ok) {
      if (res.status === 401 && typeof options.onUnauthorized === 'function') options.onUnauthorized();
      const error = new Error(isJson ? data?.error?.message || 'Request failed.' : 'Request failed.');
      error.status = res.status;
      error.code = isJson ? data?.error?.code : 'NON_JSON_ERROR';
      error.details = isJson ? data?.error?.details : null;
      throw error;
    }
    return isJson ? data.data : data;
  }

  return {
    setToken(nextToken) { token = nextToken; },
    getToken() { return token; },
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    patch: (path, opts) => request('PATCH', path, opts),
    put: (path, opts) => request('PUT', path, opts),
    delete: (path, opts) => request('DELETE', path, opts),
  };
}
