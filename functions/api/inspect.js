const PROVIDERS = [
  { id: 'tiktok', label: 'TikTok', hosts: ['tiktok.com', 'www.tiktok.com'] },
  { id: 'instagram', label: 'Instagram', hosts: ['instagram.com', 'www.instagram.com'] },
  { id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'www.facebook.com', 'fb.watch'] },
  { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'www.youtube.com', 'youtu.be'] },
  { id: 'x', label: 'X', hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'] },
  { id: 'pinterest', label: 'Pinterest', hosts: ['pinterest.com', 'www.pinterest.com', 'pin.it'] }
];
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const MAX_RATE_KEYS = 10_000;
const MAX_BODY_BYTES = 4_096;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export function createRateLimiter({ limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS, maxKeys = MAX_RATE_KEYS } = {}) {
  const buckets = new Map();
  const prune = (now) => {
    for (const [key, timestamps] of buckets) {
      const active = timestamps.filter((time) => now - time < windowMs);
      if (active.length) buckets.set(key, active); else buckets.delete(key);
    }
    while (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value);
  };
  return {
    allow(rawKey, now = Date.now()) {
      const key = String(rawKey || 'unknown').slice(0, 128);
      const timestamps = (buckets.get(key) || []).filter((time) => now - time < windowMs);
      if (timestamps.length >= limit) { buckets.set(key, timestamps); return false; }
      timestamps.push(now); buckets.set(key, timestamps);
      if (buckets.size > maxKeys) prune(now);
      return true;
    },
    size: () => buckets.size
  };
}

const rateLimiter = createRateLimiter();

function parseIpv4(hostname) {
  if (!/^\d+(?:\.\d+){3}$/.test(hostname)) return null;
  const parts = hostname.split('.').map(Number);
  return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function parseIpv6(hostname) {
  const value = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!value.includes(':') || value.includes('%')) return null;
  const pieces = value.split('::');
  if (pieces.length > 2) return null;
  const expand = (part) => {
    if (!part) return [];
    const output = [];
    for (const token of part.split(':')) {
      if (token.includes('.')) {
        const ipv4 = parseIpv4(token);
        if (!ipv4) return null;
        output.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(token)) output.push(parseInt(token, 16));
      else return null;
    }
    return output;
  };
  const left = expand(pieces[0]); const right = pieces.length === 2 ? expand(pieces[1]) : [];
  if (!left || !right || (pieces.length === 1 && left.length !== 8) || (pieces.length === 2 && left.length + right.length >= 8)) return null;
  return pieces.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right] : left;
}

function isUnsafeDestination(hostname) {
  const lower = hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(lower) || lower.endsWith('.localhost') || lower.endsWith('.local') || lower.endsWith('.internal') || lower.endsWith('.home.arpa')) return true;
  const ipv4 = parseIpv4(lower);
  if (ipv4) {
    const [a, b, c] = ipv4;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || c === 51)) || (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  const ipv6 = parseIpv6(lower);
  if (!ipv6) return false;
  const first = ipv6[0];
  const isV4Mapped = ipv6.slice(0, 5).every((part) => part === 0) && ipv6[5] === 0xffff;
  if (isV4Mapped) return isUnsafeDestination(`${ipv6[6] >> 8}.${ipv6[6] & 255}.${ipv6[7] >> 8}.${ipv6[7] & 255}`);
  return ipv6.every((part) => part === 0) || (ipv6.slice(0, 7).every((part) => part === 0) && ipv6[7] === 1) || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0 || (first & 0xff00) === 0xff00 || (first === 0x2001 && ipv6[1] === 0x0db8);
}

async function readJsonBody(request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new Error('REQUEST_BODY_TOO_LARGE');
  if (!request.body) return {};
  const reader = request.body.getReader(); const chunks = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('REQUEST_BODY_TOO_LARGE'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

const isPublicHostname = (hostname) => !isUnsafeDestination(hostname);
export function recognizeProvider(raw) {
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 2048) return { error: 'Enter a valid URL under 2,048 characters.' };
  let parsed; try { parsed = new URL(raw); } catch { return { error: 'That does not look like a valid URL.' }; }
  if (!['https:', 'http:'].includes(parsed.protocol) || !isPublicHostname(parsed.hostname)) return { error: 'Only public web URLs are accepted.' };
  const provider = PROVIDERS.find((item) => item.hosts.includes(parsed.hostname.toLowerCase()) || item.hosts.some((host) => parsed.hostname.toLowerCase().endsWith(`.${host}`)));
  if (!provider) return { error: 'This platform is not supported yet.' };
  return { provider, url: parsed };
}
export async function onRequestPost(context) {
  const address = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!rateLimiter.allow(address)) return json({ error: 'Too many requests. Please wait a minute and try again.' }, 429);
  let body; try { body = await readJsonBody(context.request); } catch (error) { return json({ error: error.message === 'REQUEST_BODY_TOO_LARGE' ? 'Request body is too large.' : 'Send a valid JSON body containing a URL.' }, error.message === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400); }
  const result = recognizeProvider(body?.url);
  if (result.error) return json({error: result.error}, 400);
  // No provider credential is shipped in this project. This is intentionally honest until an authorized API is configured.
  return json({ platform: result.provider.label, provider: result.provider.id, supported: true, integration: { status: 'unavailable', download: false }, message: `${result.provider.label} link recognized. Direct ${result.provider.label} downloads are not currently supported.` });
}
