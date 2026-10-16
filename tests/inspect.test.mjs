import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, onRequestPost, recognizeProvider } from '../functions/api/inspect.js';
test('recognizes approved provider hosts', () => { assert.equal(recognizeProvider('https://www.tiktok.com/@creator/video/1').provider.id, 'tiktok'); assert.equal(recognizeProvider('https://youtu.be/example').provider.id, 'youtube'); });
test('rejects unsupported and unsafe URLs', () => { assert.match(recognizeProvider('https://example.com/video').error, /not supported/); assert.match(recognizeProvider('http://localhost:8787/').error, /public web/); assert.match(recognizeProvider('file:///etc/passwd').error, /public web/); });
test('rejects malformed and oversized input', () => { assert.match(recognizeProvider('not-a-url').error, /valid URL/); assert.match(recognizeProvider('x'.repeat(2049)).error, /2,048/); });
test('rejects private, reserved, and unsafe IPv4 and IPv6 destinations', () => {
  for (const url of ['http://10.0.0.1/', 'http://172.16.0.1/', 'http://192.168.1.1/', 'http://169.254.1.1/', 'http://[::1]/', 'http://[fc00::1]/', 'http://[fe80::1]/', 'http://[2001:db8::1]/', 'http://[::ffff:192.168.1.1]/']) assert.match(recognizeProvider(url).error, /public web/);
});
test('rate limiter expires buckets and bounds stored keys', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 2 });
  assert.equal(limiter.allow('a', 0), true); assert.equal(limiter.allow('a', 1), true); assert.equal(limiter.allow('a', 2), false); assert.equal(limiter.allow('a', 1001), true);
  limiter.allow('b', 1002); limiter.allow('c', 1003); assert.ok(limiter.size() <= 2);
});
test('rejects oversized request bodies before JSON parsing', async () => {
  const request = new Request('https://arewa.test/api/inspect', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '4097', 'CF-Connecting-IP': 'body-test' }, body: '{}' });
  const response = await onRequestPost({ request });
  assert.equal(response.status, 413); assert.match((await response.json()).error, /too large/);
});
test('uses honest platform-specific recognition messages', async () => {
  const request = (url, ip) => new Request('https://arewa.test/api/inspect', { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify({url}) });
  const facebook = await (await import('../functions/api/inspect.js')).onRequestPost({ request: request('https://www.facebook.com/watch/?v=1', 'message-facebook') });
  const youtube = await (await import('../functions/api/inspect.js')).onRequestPost({ request: request('https://www.youtube.com/watch?v=1', 'message-youtube') });
  assert.equal((await facebook.json()).message, 'Facebook link recognized. Direct Facebook downloads are not currently supported.');
  assert.equal((await youtube.json()).message, 'YouTube link recognized. Direct YouTube downloads are not currently supported.');
});
