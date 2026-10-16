import { configuredOrigins, DownloadError, downloadDirectFile, readJsonRequest } from '../lib/direct-download.js';
import { recognizeProvider } from '../functions/api/inspect.js';

export default async function handler(req, res) {
  if ((req.method || 'GET').toUpperCase() !== 'POST') { res.statusCode = 405; res.setHeader('allow', 'POST'); res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify({ error: 'Method not allowed.' })); return; }
  try {
    const body = await readJsonRequest(req); const social = recognizeProvider(body?.url); if (!social.error) throw new DownloadError(400, 'Social-media links are recognized but direct-file downloads are not supported.');
    const origins = configuredOrigins();
    if (!origins.length) throw new DownloadError(503, 'Direct-file downloads are not configured for this deployment.');
    const result = await downloadDirectFile({ rawUrl: body?.url, allowedOrigins: origins });
    res.statusCode = 200; res.setHeader('content-type', result.contentType); res.setHeader('content-disposition', `attachment; filename="${result.filename}"`); res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('cache-control', 'no-store'); if (result.contentLength !== undefined) res.setHeader('content-length', String(result.contentLength));
    result.body.on('error', () => { if (!res.headersSent) res.statusCode = 502; res.destroy?.(); }); result.body.pipe(res);
  } catch (error) { const status = error instanceof DownloadError ? error.status : 502; res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'The download could not be completed safely.' })); }
}
export const config = { api: { bodyParser: false } };
