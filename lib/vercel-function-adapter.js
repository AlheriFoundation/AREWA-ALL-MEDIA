import { hasParsedBody, isBodyStream, serializeParsedBody } from './request-body.js';

function toFetchRequest(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host || 'vercel-preview.invalid';
  const url = new URL(req.url || '/', `${protocol}://${host}`).toString();
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(',') : String(value));
  }
  if (!headers.has('cf-connecting-ip')) {
    const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip');
    if (forwarded) headers.set('cf-connecting-ip', forwarded);
  }
  const method = (req.method || 'GET').toUpperCase();
  const init = { method, headers };
  if (!['GET', 'HEAD'].includes(method)) {
    if (hasParsedBody(req)) init.body = serializeParsedBody(req.body);
    else { init.body = isBodyStream(req.body) ? req.body : req; init.duplex = 'half'; }
  }
  return new Request(url, init);
}

export function adaptPagesFunction(pagesHandler) {
  return async function vercelHandler(req, res) {
    if ((req.method || 'GET').toUpperCase() !== 'POST') {
      res.statusCode = 405;
      res.setHeader('allow', 'POST');
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method not allowed.' }));
      return;
    }
    try {
      const response = await pagesHandler({ request: toFetchRequest(req) });
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'The server could not process this request.' }));
    }
  };
}
