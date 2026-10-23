'use strict';
// Pure analysis: takes observed preflight/actual responses and the request intent, returns findings.
const SIMPLE_METHODS = new Set(['GET', 'HEAD', 'POST']);
const SAFELISTED_HEADERS = new Set(['accept', 'accept-language', 'content-language', 'content-type']);
const SIMPLE_CT = new Set(['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']);

function lower(h) { const o = {}; for (const [k, v] of Object.entries(h || {})) o[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v); return o; }
function list(v) { return (v || '').split(',').map(s => s.trim()).filter(Boolean); }

function needsPreflight(req) {
  if (!SIMPLE_METHODS.has(req.method)) return true;
  for (const h of req.headers) {
    const [name, ...rest] = h.split(':'); const n = name.trim().toLowerCase();
    if (!SAFELISTED_HEADERS.has(n)) return true;
    if (n === 'content-type' && rest.length && !SIMPLE_CT.has(rest.join(':').trim().split(';')[0].toLowerCase())) return true;
  }
  return false;
}

function checkOrigin(where, h, req, out) {
  const acao = h['access-control-allow-origin'];
  const acac = h['access-control-allow-credentials'];
  if (acao === undefined) {
    out.push({ level: 'error', where, code: 'missing-acao', msg: `No Access-Control-Allow-Origin header on the ${where} response.`,
      fix: `Return "Access-Control-Allow-Origin: ${req.origin}" (echo the request Origin if it is on your allowlist) on the ${where} response${where === 'actual' ? ', including error responses (4xx/5xx)' : ''}.` });
    return;
  }
  if (acao.includes(',')) out.push({ level: 'error', where, code: 'multiple-acao', msg: `Access-Control-Allow-Origin contains multiple values ("${acao}"). Browsers accept exactly one origin or "*".`,
    fix: 'Send a single origin. If CORS headers are added in two places (e.g. app and proxy), remove one.' });
  else if (acao === '*') {
    if (req.credentials) out.push({ level: 'error', where, code: 'wildcard-with-credentials', msg: 'Access-Control-Allow-Origin is "*" but the request uses credentials. Browsers reject this.',
      fix: `Echo the specific origin instead: "Access-Control-Allow-Origin: ${req.origin}" plus "Vary: Origin" and "Access-Control-Allow-Credentials: true".` });
  } else if (acao !== req.origin) out.push({ level: 'error', where, code: 'origin-mismatch', msg: `Access-Control-Allow-Origin is "${acao}" but the request Origin is "${req.origin}" (scheme, host and port must match exactly, no trailing slash).`,
    fix: `Add "${req.origin}" to your allowed origins list.` });
  if (req.credentials && acac !== 'true') out.push({ level: 'error', where, code: 'missing-credentials', msg: `Request uses credentials but Access-Control-Allow-Credentials is ${acac === undefined ? 'missing' : `"${acac}"`}.`,
    fix: `Return "Access-Control-Allow-Credentials: true" on the ${where} response (the value must be exactly lowercase "true").` });
  if (acao !== '*' && acao !== undefined && !list(h['vary']).map(s => s.toLowerCase()).some(v => v === 'origin' || v === '*'))
    out.push({ level: 'warn', where, code: 'missing-vary-origin', msg: `Access-Control-Allow-Origin is a specific origin but the ${where} response has no "Vary: Origin".`,
      fix: 'Add "Vary: Origin" so CDNs and browser caches do not serve one origin\'s CORS headers to another origin.' });
}

function analyze({ request, preflight, actual }) {
  const req = { method: (request.method || 'GET').toUpperCase(), origin: request.origin, headers: request.headers || [], credentials: !!request.credentials };
  const out = [];
  const pf = needsPreflight(req);
  if (preflight && pf) {
    if (preflight.error) out.push({ level: 'error', where: 'preflight', code: preflight.error === 'timeout' ? 'preflight-timeout' : 'preflight-network', msg: `Preflight OPTIONS request failed: ${preflight.message || preflight.error}.`,
      fix: preflight.error === 'timeout' ? 'The server did not answer OPTIONS in time. Make sure OPTIONS is routed and answered immediately (before auth, body parsing or slow middleware).' : 'Check that the host is reachable and that TLS is valid.' });
    else {
      const h = lower(preflight.headers); const s = preflight.status;
      if (s >= 300 && s < 400) out.push({ level: 'error', where: 'preflight', code: 'preflight-redirect', msg: `Preflight got a ${s} redirect${h.location ? ` to ${h.location}` : ''}. Browsers do not follow redirects on preflight ("Redirect is not allowed for a preflight request").`,
        fix: `Call the final URL directly${h.location ? ` (${h.location})` : ''}: fix http->https, trailing slash or www redirects in the client URL, or exempt OPTIONS from the redirect.` });
      else if (s < 200 || s >= 300) out.push({ level: 'error', where: 'preflight', code: 'preflight-status', msg: `Preflight returned HTTP ${s}. It must return 2xx ("Response to preflight request doesn't pass access control check: It does not have HTTP ok status").`,
        fix: 'Answer OPTIONS with 204 (or 200) before authentication, CSRF or routing checks; preflights never carry cookies or Authorization headers.' });
      if (!(s >= 300 && s < 400)) {
        checkOrigin('preflight', h, req, out);
        const am = list(h['access-control-allow-methods']).map(m => m.toUpperCase());
        const wildM = am.includes('*') && !req.credentials;
        if (!SIMPLE_METHODS.has(req.method) && !am.includes(req.method) && !wildM)
          out.push({ level: 'error', where: 'preflight', code: 'method-not-allowed', msg: `Method ${req.method} is not in Access-Control-Allow-Methods (${am.join(', ') || 'missing'}).`,
            fix: `Return "Access-Control-Allow-Methods: ${[...new Set([...am.filter(m => m !== '*'), req.method])].join(', ')}" on the preflight.` });
        const ah = list(h['access-control-allow-headers']).map(x => x.toLowerCase());
        const wildH = ah.includes('*') && !req.credentials;
        const needed = req.headers.map(x => x.split(':')[0].trim().toLowerCase()).filter(n => n && !(SAFELISTED_HEADERS.has(n) && n !== 'content-type'));
        const missing = needed.filter(n => !ah.includes(n) && !(wildH && n !== 'authorization'));
        if (missing.length) out.push({ level: 'error', where: 'preflight', code: 'header-not-allowed', msg: `Request header(s) ${missing.join(', ')} not in Access-Control-Allow-Headers (${ah.join(', ') || 'missing'}).${ah.includes('*') && req.credentials ? ' "*" is literal when credentials are used.' : ''}${missing.includes('authorization') && ah.includes('*') ? ' "*" never covers Authorization.' : ''}`,
          fix: `Return "Access-Control-Allow-Headers: ${[...new Set([...ah.filter(x => x !== '*'), ...missing])].join(', ')}".` });
        const ma = h['access-control-max-age'];
        if (ma === undefined) out.push({ level: 'info', where: 'preflight', code: 'no-max-age', msg: 'No Access-Control-Max-Age; browsers re-send the preflight often (Chromium caches for 5s by default).', fix: 'Add "Access-Control-Max-Age: 600" (Chromium caps at 7200, Firefox at 86400).' });
        else if (!/^\d+$/.test(ma.trim())) out.push({ level: 'warn', where: 'preflight', code: 'bad-max-age', msg: `Access-Control-Max-Age "${ma}" is not a non-negative integer.`, fix: 'Use an integer number of seconds, e.g. 600.' });
        else if (+ma > 7200) out.push({ level: 'info', where: 'preflight', code: 'max-age-capped', msg: `Access-Control-Max-Age ${ma} exceeds Chromium's 7200s cap; the browser will use 7200.`, fix: 'Harmless, but 600-7200 is a realistic value.' });
      }
    }
  } else if (!pf) out.push({ level: 'info', where: 'preflight', code: 'no-preflight-needed', msg: 'This is a "simple" request; browsers skip the preflight.', fix: '' });

  if (actual) {
    if (actual.error) out.push({ level: 'error', where: 'actual', code: actual.error === 'timeout' ? 'actual-timeout' : 'actual-network', msg: `Actual ${req.method} request failed: ${actual.message || actual.error}.`, fix: 'Check that the endpoint is reachable and responds in time.' });
    else {
      const h = lower(actual.headers);
      if (actual.status >= 300 && actual.status < 400) out.push({ level: 'warn', where: 'actual', code: 'actual-redirect', msg: `Actual request got a ${actual.status} redirect${h.location ? ` to ${h.location}` : ''}. A cross-origin redirect sets Origin to "null" and every hop needs CORS headers.`, fix: 'Call the final URL directly.' });
      checkOrigin('actual', h, req, out);
      if (actual.status >= 400) out.push({ level: 'info', where: 'actual', code: 'actual-error-status', msg: `Actual request returned HTTP ${actual.status}. If CORS headers are missing only on errors, the browser hides the real error behind a CORS message.`, fix: 'Add CORS headers in middleware that also runs for error responses.' });
    }
  }
  const ok = !out.some(f => f.level === 'error');
  return { ok, needsPreflight: pf, findings: out };
}
module.exports = { analyze, needsPreflight };
