'use strict';
const http = require('node:http'); const https = require('node:https');
function send(url, method, headers, timeout) {
  return new Promise(resolve => {
    const u = new URL(url); const mod = u.protocol === 'https:' ? https : http;
    const r = mod.request(u, { method, headers }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers })); });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ error: 'timeout', message: `no response within ${timeout} ms` }); });
    r.on('error', e => { if (!r.destroyed || e.code !== 'ECONNRESET') resolve({ error: 'network', message: e.message }); });
    r.end();
  });
}
async function probe(url, req, timeout = 10000) {
  const method = (req.method || 'GET').toUpperCase();
  const names = req.headers.map(h => h.split(':')[0].trim().toLowerCase()).filter(Boolean);
  const pfh = { Origin: req.origin, 'Access-Control-Request-Method': method };
  if (names.length) pfh['Access-Control-Request-Headers'] = names.join(',');
  const preflight = await send(url, 'OPTIONS', pfh, timeout);
  const ah = { Origin: req.origin };
  for (const h of req.headers) { const i = h.indexOf(':'); if (i > 0) ah[h.slice(0, i).trim()] = h.slice(i + 1).trim(); else ah[h.trim()] = 'x'; }
  const actual = await send(url, method === 'POST' || method === 'PUT' || method === 'PATCH' ? method : method, ah, timeout);
  return { preflight, actual };
}
module.exports = { probe, send };
