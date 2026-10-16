export const MAX_JSON_BODY_BYTES = 4_096;

export class JsonBodyError extends Error {
  constructor(message, code = 'INVALID_JSON') {
    super(message);
    this.code = code;
  }
}

function validateObjectBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new JsonBodyError('Send a valid JSON body containing a URL.');
  if (typeof value.url !== 'string' || !value.url.trim()) throw new JsonBodyError('Send a valid JSON body containing a URL.');
  return value;
}

function parseJsonText(text, maxBytes) {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > maxBytes) throw new JsonBodyError('Request body is too large.', 'REQUEST_BODY_TOO_LARGE');
  try { return validateObjectBody(JSON.parse(text)); } catch (error) {
    if (error instanceof JsonBodyError) throw error;
    throw new JsonBodyError('Send a valid JSON body containing a URL.');
  }
}

export function serializeParsedBody(body) {
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return Buffer.from(body);
  try { return JSON.stringify(body); } catch { throw new JsonBodyError('Send a valid JSON body containing a URL.'); }
}

export function isBodyStream(body) {
  return Boolean(body && (typeof body.pipe === 'function' || typeof body.getReader === 'function' || typeof body[Symbol.asyncIterator] === 'function'));
}

export async function readJsonStream(stream, maxBytes = MAX_JSON_BODY_BYTES) {
  if (!stream) throw new JsonBodyError('Send a valid JSON body containing a URL.');
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.length;
    if (total > maxBytes) throw new JsonBodyError('Request body is too large.', 'REQUEST_BODY_TOO_LARGE');
    chunks.push(value);
  }
  return parseJsonText(Buffer.concat(chunks).toString('utf8'), maxBytes);
}

export function hasParsedBody(request) {
  return Object.prototype.hasOwnProperty.call(request, 'body') && request.body !== undefined && !isBodyStream(request.body) && typeof request.body !== 'function';
}

export async function readNodeJsonBody(request, maxBytes = MAX_JSON_BODY_BYTES) {
  if (hasParsedBody(request)) {
    const serialized = serializeParsedBody(request.body);
    return parseJsonText(Buffer.isBuffer(serialized) ? serialized.toString('utf8') : serialized, maxBytes);
  }
  return readJsonStream(isBodyStream(request.body) ? request.body : request, maxBytes);
}

export async function readFetchJsonBody(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new JsonBodyError('Request body is too large.', 'REQUEST_BODY_TOO_LARGE');
  return readJsonStream(request.body, maxBytes);
}
