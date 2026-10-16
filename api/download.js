import { onRequestPost } from '../functions/api/download.js';
import { adaptPagesFunction } from '../lib/vercel-function-adapter.js';

export default adaptPagesFunction(onRequestPost);
export const config = { api: { bodyParser: false } };
