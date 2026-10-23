'use strict';
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const path = require('node:path'); const { execFile } = require('node:child_process');
const BIN = path.join(__dirname, '..', 'bin', 'cors-doctor.js'); const ORIGIN = 'https://app.example.com';
const run = (args, input) => new Promise(res => { const p = execFile(process.execPath, [BIN, ...args], (e, out, err) => res({ code: e ? e.code : 0, out, err })); if (input !== undefined) { p.stdin.end(input); } });
const GOOD = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
const routes = {
  '/good': (q, s) => { s.writeHead(q.method === 'OPTIONS' ? 204 : 200, GOOD); s.end('ok'); },
  '/none': (q, s) => { s.writeHead(200); s.end('ok'); },
  '/wild-creds': (q, s) => { s.writeHead(q.method === 'OPTIONS' ? 204 : 200, { ...GOOD, 'Access-Control-Allow-Origin': '*' }); s.end(); },
  '/redirect': (q, s) => { s.writeHead(301, { Location: '/good' }); s.end(); },
  '/pf401': (q, s) => { s.writeHead(q.method === 'OPTIONS' ? 401 : 200, GOOD); s.end(); },
  '/methods': (q, s) => { s.writeHead(q.method === 'OPTIONS' ? 204 : 200, { ...GOOD, 'Access-Control-Allow-Methods': 'GET, POST' }); s.end(); },
  '/hdrs': (q, s) => { s.writeHead(q.method === 'OPTIONS' ? 204 : 200, { ...GOOD, 'Access-Control-Allow-Headers': 'content-type' }); s.end(); },
  '/novary': (q, s) => { const h = { ...GOOD }; delete h.Vary; s.writeHead(q.method === 'OPTIONS' ? 204 : 200, h); s.end(); },
  '/slow': () => {},
};
let server, base;
test.before(() => new Promise(r => { server = http.createServer((q, s) => (routes[q.url] || routes['/none'])(q, s)); server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.closeAllConnections(); server.close(); });

test('passes a correct credentialed PUT', async () => { const r = await run([base + '/good', '--origin', ORIGIN, '--method', 'PUT', '--header', 'Authorization: Bearer x', '--credentials']); assert.strictEqual(r.code, 0, r.out); assert.match(r.out, /OK: a browser would allow/); });
test('simple GET passes without preflight', async () => { const r = await run([base + '/good', '--origin', ORIGIN]); assert.strictEqual(r.code, 0); assert.match(r.out, /simple/); });
test('missing ACAO fails', async () => { const r = await run([base + '/none', '--origin', ORIGIN]); assert.strictEqual(r.code, 1); assert.match(r.out, /No Access-Control-Allow-Origin/); });
test('wildcard origin with credentials fails', async () => { const r = await run([base + '/wild-creds', '--origin', ORIGIN, '--credentials']); assert.strictEqual(r.code, 1); assert.match(r.out, /"\*" but the request uses credentials/); });
test('redirect on preflight fails', async () => { const r = await run([base + '/redirect', '--origin', ORIGIN, '--method', 'DELETE']); assert.strictEqual(r.code, 1); assert.match(r.out, /301 redirect to \/good/); });
test('non-2xx preflight fails', async () => { const r = await run([base + '/pf401', '--origin', ORIGIN, '--method', 'PUT']); assert.strictEqual(r.code, 1); assert.match(r.out, /Preflight returned HTTP 401/); });
test('missing method fails with fix', async () => { const r = await run([base + '/methods', '--origin', ORIGIN, '--method', 'PATCH']); assert.strictEqual(r.code, 1); assert.match(r.out, /Access-Control-Allow-Methods: GET, POST, PATCH/); });
test('missing header fails', async () => { const r = await run([base + '/hdrs', '--origin', ORIGIN, '--method', 'POST', '--header', 'X-Api-Key: k']); assert.strictEqual(r.code, 1); assert.match(r.out, /x-api-key not in Access-Control-Allow-Headers/); });
test('missing Vary: Origin is a warning, not a failure', async () => { const r = await run([base + '/novary', '--origin', ORIGIN]); assert.strictEqual(r.code, 0); assert.match(r.out, /\[WARN\].*Vary: Origin/); });
test('origin mismatch fails', async () => { const r = await run([base + '/good', '--origin', 'https://evil.example']); assert.strictEqual(r.code, 1); assert.match(r.out, /request Origin is "https:\/\/evil.example"/); });
test('preflight timeout fails', async () => { const r = await run([base + '/slow', '--origin', ORIGIN, '--method', 'PUT', '--timeout', '300']); assert.strictEqual(r.code, 1); assert.match(r.out, /Preflight OPTIONS request failed: no response within 300 ms/); });
test('usage error exits 2', async () => { const r = await run(['--origin', ORIGIN]); assert.strictEqual(r.code, 2); });

test('offline flags are rejected with exit 2', async () => { const r = await run(['--no-network', '--origin', ORIGIN]); assert.strictEqual(r.code, 2); assert.match(r.err, /paid CORS Fix Kit/); });
test('--json output on live check', async () => { const r = await run([base + '/wild-creds', '--origin', ORIGIN, '--credentials', '--json']); assert.strictEqual(r.code, 1); const j = JSON.parse(r.out); assert.strictEqual(j.ok, false); assert.ok(j.findings.some(x => x.code === 'wildcard-with-credentials')); });
