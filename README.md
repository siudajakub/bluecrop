# Bluecrop — Deal Hunter

Deal Hunter is a demo shopping agent that interviews the user, compiles an explicit purchase
mandate, searches for products, evaluates changing offers, and executes a test purchase strictly
within the limits of the approved consent.

The repo contains a local hackathon vertical with a test Next.js UI and a Fastify API. Merchants and
payment are simulated, but the full cost calculation, policy engine, revalidation, idempotency, and
audit receipt all run in deterministic code.

## Quick start

Node.js 22 or newer is required.

```bash
npm install
cp .env.example .env
npm run dev
```

- UI: `http://127.0.0.1:3000`
- API: `http://127.0.0.1:3001`

Check that the API is ready:

```bash
curl http://127.0.0.1:3001/health
```

`MANDATE_COMPILER_MODE=fixture` runs by default, so no OpenAI key is needed. Once
`OPENAI_API_KEY` is set the app defaults to the real AI model.

## Test UI

A single screen walks through the whole flow:

1. run the adaptive interview by text or voice;
2. review the summary and compile the brief;
3. approve the mandate;
4. start monitoring;
5. run a valid checkout, or first raise the price;
6. inspect the timeline, trust receipt, and safety counters.

The "Revoke consent" button lets you exercise the second revalidation lock. "Reset demo" clears the
backend and interface state.

## Demo

The full golden path can be checked without starting the server:

```bash
npm run demo:smoke
```

The expected result is three decisions:

```text
IGNORE → IGNORE → AUTO_BUY
```

The first offer exceeds the cap after FX, delivery, and fees. The second has a fake discount. The
third satisfies the mandate, fits within 80 EUR, and has low stock.

Reset the state of a running server:

```bash
npm run demo:reset
```

## OpenAI

The key stays exclusively in the backend. Do not commit `.env` to the repository.

```bash
MANDATE_COMPILER_MODE=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OFFER_ENRICHMENT_MODE=html
```

The adapter uses the Responses API and Structured Outputs with the same Zod schema that validates
the application contract. The model runs the interview, generates the search parameters and
categories, and then uses the `web_search` tool to find current product pages with clickable
sources. It never computes the deterministic safety limits and never authorizes the purchase.
If a search result has no matching image, the backend fetches a bounded fragment of the offer page
and reads `og:image` or `twitter:image`. The fetch enforces HTTPS, redirect checks, public DNS,
response type, and a byte limit; its failure never aborts the whole search.
`OFFER_ENRICHMENT_ALLOWED_HOSTS` can optionally restrict this fallback to a comma-separated host
list, and `OFFER_ENRICHMENT_MODE=disabled` turns it off entirely.
Every question ships with ready-made answer options and the interview has a hard limit of four
rounds. Once the limit is reached the model must produce the best possible plan and start the
search.
The voice conversation uses WebRTC and a short-lived session secret issued by the backend. The
standard `OPENAI_API_KEY` is never returned to the browser. The microphone requires user consent
and is stopped when the conversation ends, the connection resets, or the view is left.

### Scraping shop offers

The backend can optionally fetch public shop pages and use OpenAI Structured Outputs to extract
offers. The key stays exclusively on the API side. The scraper is disabled by default and accepts
only explicitly allowed HTTPS hosts:

```bash
OFFER_SCRAPER_MODE=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6
SCRAPER_ALLOWED_HOSTS=www.morele.net,allegro.pl,www.olx.pl
SCRAPER_MAX_HTML_BYTES=1000000
```

Example call:

```bash
curl -X POST http://127.0.0.1:3001/api/offers/scrape \
  -H "content-type: application/json" \
  -d '{"urls":["https://www.morele.net/wyszukiwarka/?q=laptop"]}'
```

The response contains `offers` matching the shared Zod schema plus per-page failures in `errors`.
OpenAI only extracts fields visible on the page. HTML fetching, the host allowlist, SSRF
protection, the size limit, and response validation stay deterministic in the backend. Fields not
visible on the page are `null`; the model does not derive `riskScore` and does not authorize any
purchase.

A deployment should respect shop terms, `robots.txt`, rate limits, and applicable law. Pages that
require JavaScript, login, or CAPTCHA may fail and need a separate authorized browser adapter or an
official merchant feed/API.

## Commands

```bash
npm run check       # TypeScript + agent document validation
npm test            # domain and API tests
npm run build       # production builds of the API and Next.js
npm start           # run both production apps
npm run demo:smoke  # full local golden path
```

## Architecture

```text
Next.js UI
    ↓ HTTP + WebRTC
Fastify API
    ├── adaptive text/voice interview
    ├── fixture/OpenAI purchase-plan compiler
    ├── OpenAI web search + product recommendations
    ├── deterministic replay + policy engine
    ├── revalidation + idempotent checkout
    └── in-memory audit receipts
```

Key directories:

| Path | Responsibility |
| --- | --- |
| `apps/api` | Fastify, endpoints, configuration, and adapters |
| `apps/web` | test Next.js interface and HTTP client |
| `packages/contracts` | Zod schemas and UI–backend types |
| `packages/domain` | cost, matching, risk, and decisions |
| `packages/checkout` | revalidation, idempotency, and receipt |
| `fixtures/scenarios` | reproducible demo data |
| `tests` | domain tests and the full API flow |

Detailed request/response examples are in the
[UI–backend contract](docs/hackathon/contracts.md). The presentation scenario is in the
[demo runbook](docs/hackathon/demo.md).

## MVP limitations

- state is lost when the process restarts;
- no real scraping or payment;
- a single local demo, without login or multiple users;
- controlled offer mutations exist only for the presentation.

Last reviewed: 2026-07-11.
