# cors-doctor (lite)

Free, MIT-licensed, zero-dependency Node.js (18+) CLI that diagnoses browser CORS errors. It sends a real `OPTIONS` preflight and then the actual request to your API, the same way a browser would, and prints each problem with the exact header to add.

It checks for: missing or mismatched `Access-Control-Allow-Origin`, `*` with credentials, missing `Access-Control-Allow-Credentials`, methods or headers missing from the allow lists, missing `Vary: Origin`, redirects on preflight, non-2xx preflight, timeouts and `Max-Age`.

The lite CLI runs the same analysis as the paid version, so live-check results are identical.

## Usage

```
node bin/cors-doctor.js <url> --origin <origin> [--method M] [--header "Name: value"]... [--credentials] [--timeout ms] [--json]
```

Or install from a clone: `npm install -g .` and run `cors-doctor ...`.

Exit codes: `0` = a browser would allow the request, `1` = CORS problems found, `2` = usage error. Use it in CI.

## Example

```
(abridged)
$ cors-doctor https://api.example.com/items --origin https://app.example.com --method PUT --header "Authorization: Bearer x" --credentials
cors-doctor: PUT https://api.example.com/items from https://app.example.com with credentials
  preflight: HTTP 204
  actual:    HTTP 200

[ERROR] (preflight) Access-Control-Allow-Origin is "*" but the request uses credentials. Browsers reject this.
  FIX: Echo the specific origin instead: "Access-Control-Allow-Origin: https://app.example.com" plus "Vary: Origin" and "Access-Control-Allow-Credentials: true".

PROBLEMS FOUND: a browser would block this request.
```

Add `--json` for machine-readable output (`{ ok, findings: [...] }`).

## Tests

```
npm test
```

Uses `node:test` against a real local HTTP server. See `test-output.txt`.

## Free guides

Step-by-step fixes for common CORS errors: https://5012763083a-oss.github.io/webhook-fixes/cors/

## What the paid CORS Fix Kit adds

- **Offline mode**: `--no-network` with `--headers-file <path>` (or stdin) analyzes response headers you already captured, without sending any request.
- **13 stack configs**: copy-paste CORS snippets with an origin allowlist for Express, Fastify, Next.js App Router, Next.js Pages Router, Cloudflare Workers, Django, Flask, FastAPI, AWS S3, Cloudflare R2, nginx, Apache and Spring Boot.
- **The guide**: a written walkthrough for diagnosing and fixing CORS errors.

CORS Fix Kit ($9): https://6907000850732.gumroad.com/l/vhkbla?ref=github

## License

MIT. See `LICENSE`.

Independent project, not affiliated with or endorsed by any vendor whose stack is covered.
