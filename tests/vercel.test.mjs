import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import inspectHandler from '../api/inspect.js';
import downloadHandler from '../api/download.js';

function responseFor(handler, method = 'GET') {
  const headers = {};
  const response = { statusCode: 200, setHeader(name, value) { headers[name.toLowerCase()] = value; }, end(body) { this.body = body; } };
  return handler({ method, url: '/api/test', headers: { host: 'vercel-preview.invalid' } }, response).then(() => ({ response, headers }));
}

test('Vercel route adapters expose serverless handlers and reject non-POST requests', async () => {
  assert.equal(typeof inspectHandler, 'function'); assert.equal(typeof downloadHandler, 'function');
  const inspect = await responseFor(inspectHandler); const download = await responseFor(downloadHandler);
  assert.equal(inspect.response.statusCode, 405); assert.equal(download.response.statusCode, 405);
  assert.equal(inspect.headers.allow, 'POST'); assert.equal(download.headers.allow, 'POST');
});

test('Vercel preview configuration prevents indexing until deployment metadata is finalized', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.equal(config.headers[0].headers[0].key, 'X-Robots-Tag');
  assert.match(config.headers[0].headers[0].value, /noindex/);
  assert.equal(config.functions['api/*.js'].maxDuration, 10);
});
