import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import inspectHandler from '../api/inspect.js';
import downloadHandler from '../api/download.js';

function responseFor(handler, request = {}) {
  const headers = {};
  const response = { statusCode: 200, setHeader(name, value) { headers[name.toLowerCase()] = value; }, end(body) { this.body = body; } };
  const req = request.stream || Readable.from([]);
  req.method = request.method || 'GET'; req.url = '/api/test'; req.headers = { host: 'vercel-preview.invalid', ...(request.headers || {}) };
  if (Object.prototype.hasOwnProperty.call(request, 'body')) req.body = request.body;
  return handler(req, response).then(() => ({ response, headers }));
}

test('Vercel route adapters expose serverless handlers and reject non-POST requests', async () => {
  assert.equal(typeof inspectHandler, 'function'); assert.equal(typeof downloadHandler, 'function');
  const inspect = await responseFor(inspectHandler); const download = await responseFor(downloadHandler);
  assert.equal(inspect.response.statusCode, 405); assert.equal(download.response.statusCode, 405);
  assert.equal(inspect.headers.allow, 'POST'); assert.equal(download.headers.allow, 'POST');
});

test('Vercel inspect accepts parsed bodies and raw JSON streams', async () => {
  const url = 'https://www.youtube.com/watch?v=1';
  const parsed = await responseFor(inspectHandler, { method: 'POST', body: { url } });
  const raw = await responseFor(inspectHandler, { method: 'POST', stream: Readable.from([JSON.stringify({ url })]), headers: { 'content-type': 'application/json' } });
  for (const result of [parsed, raw]) {
    assert.equal(result.response.statusCode, 200);
    assert.equal(JSON.parse(result.response.body.toString()).message, 'YouTube link recognized. Direct YouTube downloads are not currently supported.');
  }
});

test('Vercel endpoints reject malformed, missing, and oversized JSON safely', async () => {
  const malformed = await responseFor(inspectHandler, { method: 'POST', stream: Readable.from(['not-json']) });
  const missing = await responseFor(downloadHandler, { method: 'POST', body: {} });
  const oversized = await responseFor(downloadHandler, { method: 'POST', stream: Readable.from(['x'.repeat(4097)]) });
  assert.equal(malformed.response.statusCode, 400);
  assert.equal(missing.response.statusCode, 400);
  assert.equal(oversized.response.statusCode, 413);
});

test('Vercel download rejects social URLs before any direct-file fetch', async () => {
  const url = 'https://www.youtube.com/watch?v=1';
  const parsed = await responseFor(downloadHandler, { method: 'POST', body: { url } });
  const raw = await responseFor(downloadHandler, { method: 'POST', stream: Readable.from([JSON.stringify({ url })]) });
  for (const result of [parsed, raw]) {
    assert.equal(result.response.statusCode, 400);
    assert.equal(JSON.parse(result.response.body).error, 'Social-media links are recognized but direct-file downloads are not supported.');
  }
});

test('Vercel preview configuration prevents indexing until deployment metadata is finalized', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.equal(config.headers[0].headers[0].key, 'X-Robots-Tag');
  assert.match(config.headers[0].headers[0].value, /noindex/);
  assert.equal(config.functions['api/*.js'].maxDuration, 10);
});
