import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { DownloadError, downloadDirectFile, sanitizeFilename, validateDirectFileUrl } from '../lib/direct-download.js';

const origin = 'https://files.example.test';
const response = (statusCode, headers, chunks = [Buffer.from('%PDF-1.7\n')]) => ({ statusCode, headers, body: Readable.from(chunks) });
const requestWith = (result) => async () => result;
const expectStatus = async (promise, status) => { await assert.rejects(promise, (error) => error instanceof DownloadError && error.status === status); };

test('downloads an allowed file response with safe metadata', async () => {
  const result = await downloadDirectFile({ rawUrl: `${origin}/folder/report%20final.pdf`, allowedOrigins: [origin], requestImpl: requestWith(response(200, {'content-type':'application/pdf', 'content-length':'9'})) });
  assert.equal(result.contentType, 'application/pdf'); assert.equal(result.filename, 'report final.pdf'); assert.equal(result.contentLength, 9);
  const chunks = []; for await (const chunk of result.body) chunks.push(chunk); assert.equal(Buffer.concat(chunks).toString(), '%PDF-1.7\n');
});

test('rejects invalid, private, and unapproved URLs before connecting', async () => {
  assert.throws(() => validateDirectFileUrl('not-a-url', [origin]), /valid direct/);
  assert.throws(() => validateDirectFileUrl('https://10.0.0.1/file.pdf', ['https://10.0.0.1']), /unsafe/);
  assert.throws(() => validateDirectFileUrl('https://other.example.test/file.pdf', [origin]), /approved/);
});

test('rejects redirects, unsupported MIME, oversized files, and malformed responses', async () => {
  await expectStatus(downloadDirectFile({ rawUrl: `${origin}/file.pdf`, allowedOrigins: [origin], requestImpl: requestWith(response(302, {location:'https://elsewhere.test/file.pdf'}, []) ) }), 502);
  await expectStatus(downloadDirectFile({ rawUrl: `${origin}/file.html`, allowedOrigins: [origin], requestImpl: requestWith(response(200, {'content-type':'text/html', 'content-length':'24'}, [Buffer.from('<html>challenge</html>')])) }), 415);
  await expectStatus(downloadDirectFile({ rawUrl: `${origin}/large.pdf`, allowedOrigins: [origin], requestImpl: requestWith(response(200, {'content-type':'application/pdf', 'content-length': String(25 * 1024 * 1024 + 1)})) }), 413);
  await expectStatus(downloadDirectFile({ rawUrl: `${origin}/bad.pdf`, allowedOrigins: [origin], requestImpl: requestWith({statusCode:200, headers:{'content-type':'application/pdf'}, body:null}) }), 502);
});

test('rejects empty files, upstream errors, and timeouts honestly', async () => {
  await expectStatus(downloadDirectFile({ rawUrl: `${origin}/empty.pdf`, allowedOrigins: [origin], requestImpl: requestWith(response(200, {'content-type':'application/pdf'}, [])) }), 502);
  await expectStatus(downloadDirectFile({ rawUrl: `${origin}/missing.pdf`, allowedOrigins: [origin], requestImpl: requestWith(response(404, {'content-type':'application/pdf'}, [])) }), 502);
  await expectStatus(downloadDirectFile({ rawUrl: `${origin}/timeout.pdf`, allowedOrigins: [origin], requestImpl: async () => { throw new DownloadError(504, 'timed out'); } }), 504);
});

test('sanitizes filenames from URL paths', () => { const filename = sanitizeFilename('/downloads/..%2Fprivate%2Freport%20(1).pdf'); assert.equal(filename.includes('/'), false); assert.equal(filename.includes('\\'), false); assert.equal(filename, '_private_report (1).pdf'); });
