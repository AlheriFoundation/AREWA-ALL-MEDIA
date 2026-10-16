import dns from 'node:dns/promises';
import https from 'node:https';
import { Transform } from 'node:stream';
import { isUnsafeDestination } from '../functions/api/inspect.js';
import { JsonBodyError, readNodeJsonBody } from './request-body.js';

export const MAX_DIRECT_FILE_BYTES = 25 * 1024 * 1024;
export const DIRECT_REQUEST_TIMEOUT_MS = 15_000;
export const MAX_REQUEST_BODY_BYTES = 4_096;
const ALLOWED_MIME_TYPES = new Set(['application/gzip', 'application/octet-stream', 'application/pdf', 'application/zip', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm']);

export class DownloadError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function configuredOrigins(raw = process.env.DIRECT_FILE_ORIGINS || '') {
  return raw.split(',').map((value) => value.trim()).filter(Boolean).map((value) => {
    try { const parsed = new URL(value); if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null; return parsed.origin.toLowerCase(); } catch { return null; }
  }).filter(Boolean);
}

export function sanitizeFilename(pathname) {
  let filename; try { filename = decodeURIComponent(pathname.split('/').pop() || 'download'); } catch { filename = 'download'; }
  filename = filename.replace(/[\u0000-\u001f\u007f"\\/]/g, '_').replace(/[^a-zA-Z0-9._ ()-]/g, '_').replace(/\.{2,}/g, '.').replace(/^\.+/, '').trim();
  if (!filename || filename === '.' || filename === '..') filename = 'download';
  return filename.slice(0, 120);
}

export function validateDirectFileUrl(rawUrl, allowedOrigins) {
  if (typeof rawUrl !== 'string' || rawUrl.length < 1 || rawUrl.length > 2048) throw new DownloadError(400, 'Enter a direct HTTPS file URL under 2,048 characters.');
  let parsed; try { parsed = new URL(rawUrl); } catch { throw new DownloadError(400, 'That is not a valid direct file URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new DownloadError(400, 'Only public HTTPS file URLs are supported.');
  if (isUnsafeDestination(parsed.hostname)) throw new DownloadError(400, 'Private or unsafe destinations are not supported.');
  if (!allowedOrigins.includes(parsed.origin.toLowerCase())) throw new DownloadError(403, 'This file host is not an approved direct-file origin.');
  return { url: parsed, filename: sanitizeFilename(parsed.pathname) };
}

function validatedLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }).then((addresses) => {
    if (!addresses.length || addresses.some(({ address }) => isUnsafeDestination(address))) return callback(new Error('Unsafe resolved destination.'));
    const selected = addresses[0]; callback(null, selected.address, selected.family);
  }).catch(() => callback(new Error('Could not safely resolve the file host.')));
}

export function requestHttps(url, timeoutMs = DIRECT_REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const request = https.request({ protocol: 'https:', hostname: url.hostname, port: url.port || 443, path: `${url.pathname}${url.search}`, method: 'GET', headers: { accept: '*/*' }, lookup: validatedLookup, servername: url.hostname, timeout: timeoutMs }, (response) => resolve({ statusCode: response.statusCode || 0, headers: response.headers, body: response }));
    request.on('timeout', () => request.destroy(new DownloadError(504, 'The file host timed out.')));
    request.on('error', reject); request.end();
  });
}

const mimeType = (headers) => String(headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
const looksLikeHtml = (chunk) => /^\s*(<!doctype\s+html|<html|<head|<body)/i.test(chunk.toString('utf8', 0, Math.min(chunk.length, 512)));
const closeBody = (response) => { if (response?.body?.destroy) response.body.destroy(); };

function boundedBody(body, maxBytes) {
  let total = 0;
  return body.pipe(new Transform({ transform(chunk, encoding, callback) { total += chunk.length; if (total > maxBytes) return callback(new DownloadError(413, 'The file exceeds the 25 MB limit.')); callback(null, chunk, encoding); }, flush(callback) { callback(total > 0 ? undefined : new DownloadError(502, 'The upstream response contained no file data.')); } }));
}

async function firstChunk(body) {
  return new Promise((resolve, reject) => {
    const onData = (chunk) => { cleanup(); body.pause(); body.unshift(chunk); resolve(chunk); };
    const onEnd = () => { cleanup(); reject(new DownloadError(502, 'The upstream response contained no file data.')); };
    const onError = (error) => { cleanup(); reject(error); };
    const cleanup = () => { body.off('data', onData); body.off('end', onEnd); body.off('error', onError); };
    body.once('data', onData); body.once('end', onEnd); body.once('error', onError);
  });
}

export async function downloadDirectFile({ rawUrl, allowedOrigins, requestImpl = requestHttps }) {
  const { url, filename } = validateDirectFileUrl(rawUrl, allowedOrigins); let upstream;
  try { upstream = await requestImpl(url); } catch (error) { throw error instanceof DownloadError ? error : new DownloadError(502, 'The file host could not be reached safely.'); }
  if (upstream.statusCode >= 300 && upstream.statusCode < 400) { closeBody(upstream); throw new DownloadError(502, 'Redirects are not supported for direct files.'); }
  if (upstream.statusCode !== 200) { closeBody(upstream); throw new DownloadError(502, 'The file host did not return a downloadable file.'); }
  const type = mimeType(upstream.headers || {}); const length = Number(upstream.headers?.['content-length']);
  if (!Number.isSafeInteger(length) || length < 1) { closeBody(upstream); throw new DownloadError(502, 'The file size could not be verified safely.'); }
  if (!ALLOWED_MIME_TYPES.has(type)) { closeBody(upstream); throw new DownloadError(415, 'This file type is not supported.'); }
  if (Number.isFinite(length) && length > MAX_DIRECT_FILE_BYTES) { closeBody(upstream); throw new DownloadError(413, 'The file exceeds the 25 MB limit.'); }
  if (!upstream.body || typeof upstream.body.pipe !== 'function') throw new DownloadError(502, 'The upstream response was malformed.');
  const first = await firstChunk(upstream.body); if (looksLikeHtml(first)) { closeBody(upstream); throw new DownloadError(502, 'The upstream response was not a file.'); }
  return { body: boundedBody(upstream.body, MAX_DIRECT_FILE_BYTES), contentType: type, filename, contentLength: length };
}

export async function readJsonRequest(request, maxBytes = MAX_REQUEST_BODY_BYTES) {
  try { return await readNodeJsonBody(request, maxBytes); }
  catch (error) { if (error instanceof JsonBodyError && error.code === 'REQUEST_BODY_TOO_LARGE') throw new DownloadError(413, error.message); throw new DownloadError(400, 'Send a valid JSON body containing a URL.'); }
}
