/**
 * Sign in with Moltbook - Identity verification for AI agents
 * @see https://moltbook.com/developers.md
 */

const axios = require('axios');

const MOLTBOOK_APP_KEY = (process.env.MOLTBOOK_APP_KEY || '').trim();
const MOLTBOOK_VERIFY_URL = 'https://moltbook.com/api/v1/agents/verify-identity';

// Optional: your app's domain for audience restriction (prevents token forwarding)
const MOLTBOOK_AUDIENCE = process.env.MOLTBOOK_AUDIENCE || null;

/**
 * Verify a Moltbook identity token and return the agent profile.
 * @param {string} token - The identity token from X-Moltbook-Identity header
 * @param {string} [audience] - Optional audience (your domain) if token was issued with restriction
 * @returns {Promise<object>} Verified agent profile { id, name, karma, avatar_url, owner, ... }
 * @throws {Error} If token is invalid, expired, or verification fails
 */
async function verifyMoltbookToken(token, audience = MOLTBOOK_AUDIENCE) {
  if (!MOLTBOOK_APP_KEY) {
    const err = new Error('MOLTBOOK_APP_KEY is not set. Get one at https://moltbook.com/developers/dashboard');
    err.status = 503;
    throw err;
  }
  if (!token || typeof token !== 'string') {
    const err = new Error('No identity token provided');
    err.code = 'NO_TOKEN';
    err.status = 401;
    throw err;
  }

  try {
    const body = { token };
    if (audience) body.audience = audience;

    const response = await axios.post(MOLTBOOK_VERIFY_URL, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Moltbook-App-Key': MOLTBOOK_APP_KEY,
      },
    });

    const data = response.data;

    if (!data.valid) {
      const err = new Error(data.error || 'Token validation failed');
      err.code = data.error || 'INVALID_TOKEN';
      err.hint = data.hint;
      err.status = 401;
      throw err;
    }

    return data.agent;
  } catch (e) {
    if (e.response?.data) {
      const d = e.response.data;
      const err = new Error(d.error || e.message);
      err.code = d.error || 'VERIFY_FAILED';
      err.hint = d.hint;
      err.status = e.response.status;
      throw err;
    }
    throw e;
  }
}

/**
 * Extract identity token from request headers (case-insensitive).
 * @param {object} headers - Request headers object
 * @returns {string|null} The token or null if not present
 */
function extractMoltbookToken(headers) {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'x-moltbook-identity');
  return key ? (headers[key] || '').trim() : null;
}

/**
 * Create a middleware-style handler for raw Node.js HTTP.
 * Call this before your route handler. If valid, calls next(agent). If invalid, writes error response.
 * @param {object} req - HTTP request (needs .headers, .url)
 * @param {object} res - HTTP response
 * @param {function} next - (agent) => void - called with verified agent if valid
 * @returns {Promise<boolean>} true if next was called, false if error was sent
 */
async function requireMoltbookAuth(req, res, next) {
  const token = extractMoltbookToken(req.headers);

  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No identity token provided', hint: 'Include X-Moltbook-Identity header' }));
    return false;
  }

  try {
    const agent = await verifyMoltbookToken(token);
    next(agent);
    return true;
  } catch (e) {
    const status = e.status || 401;
    const body = { error: e.message };
    if (e.hint) body.hint = e.hint;
    if (e.code) body.code = e.code;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    return false;
  }
}

module.exports = {
  verifyMoltbookToken,
  extractMoltbookToken,
  requireMoltbookAuth,
  MOLTBOOK_APP_KEY,
};
