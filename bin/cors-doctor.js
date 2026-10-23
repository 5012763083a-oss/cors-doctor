#!/usr/bin/env node
'use strict';
const { analyze } = require('../lib/analyze'); const { probe } = require('../lib/probe');
const USAGE = `Usage: cors-doctor <url> --origin <origin> [--method M] [--header "Name: value"]... [--credentials] [--timeout ms] [--json]
Exit codes: 0 = OK, 1 = CORS problems found, 2 = usage error.`;
function parse(argv) {
  const o = { headers: [], method: 'GET', timeout: 10000 };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; const v = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--origin') o.origin = v(); else if (a === '--method' || a === '-X') o.method = v().toUpperCase(); else if (a === '--header' || a === '-H') o.headers.push(v());
    else if (a === '--credentials') o.credentials = true; else if (a === '--timeout') o.timeout = +v(); else if (a === '--json') o.json = true;
    else if (a === '--no-network' || a === '--headers-file') throw new Error(`${a} (offline mode) is part of the paid CORS Fix Kit; the lite CLI runs live checks only`); else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`); else o.url = a; }
  return o;
}
async function main() {
  let o; try { o = parse(process.argv.slice(2)); } catch (e) { console.error(`cors-doctor: ${e.message}\n${USAGE}`); return 2; }
  if (o.help) { console.log(USAGE); return 0; }
  if (!o.origin || !o.url || !(o.timeout > 0)) { console.error(USAGE); return 2; }
  try { new URL(o.origin); new URL(o.url); } catch { console.error('cors-doctor: url and origin must be absolute, e.g. https://app.example.com'); return 2; }
  const obs = await probe(o.url, o, o.timeout);
  const r = analyze({ request: o, preflight: obs.preflight, actual: obs.actual });
  if (!r.findings.some(f => f.where === 'actual') && !obs.actual) r.ok = false;
  if (o.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`cors-doctor: ${o.method} ${o.url} from ${o.origin}${o.credentials ? ' with credentials' : ''}`);
    if (obs.preflight && !obs.preflight.error) console.log(`  preflight: HTTP ${obs.preflight.status}`);
    if (obs.actual && !obs.actual.error) console.log(`  actual:    HTTP ${obs.actual.status}`);
    for (const f of r.findings) { console.log(`\n[${f.level.toUpperCase()}] (${f.where}) ${f.msg}`); if (f.fix) console.log(`  FIX: ${f.fix}`); }
    console.log(r.ok ? '\nOK: a browser would allow this request.' : '\nPROBLEMS FOUND: a browser would block this request.');
  }
  return r.ok ? 0 : 1;
}
main().then(c => { process.exitCode = c; });
