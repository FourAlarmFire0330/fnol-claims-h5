/* Vercel function: /api/async/callback
   Proxies the H5's submit callback to the agent platform. The platform issues
   the one-time token; this function only forwards it and never logs it. */

const DEFAULT_UPSTREAM = 'https://agentos.resultscloud.com/api/async/callback';

function upstreamUrl(token) {
  const base = process.env.AGENT_CALLBACK_URL || DEFAULT_UPSTREAM;
  const url = new URL(base);
  url.searchParams.set('token', token);
  return url;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ code: -1, message: 'Method not allowed' });
  }

  const rawToken = req.query && req.query.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  if (!token) return res.status(400).json({ code: -1, message: 'Missing token' });

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

  try {
    const upstream = await fetch(upstreamUrl(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(15000)
    });
    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    return res.status(upstream.status).send(text);
  } catch (err) {
    return res.status(502).json({ code: -1, message: 'Agent callback unreachable' });
  }
};