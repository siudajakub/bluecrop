# Bluecrop — Deal Hunter

Deal Hunter is a demo shopping agent that compiles a brief into an explicit mandate, evaluates
changing offers, and executes a test purchase strictly within the limits of the approved consent.

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

`MANDATE_COMPILER_MODE=fixture` runs by default, so no OpenAI key is needed.

## Test UI

A single screen walks through the whole flow:

1. compile the brief;
2. approve the mandate;
3. start monitoring;
4. run a valid checkout, or first raise the price;
5. inspect the timeline, trust receipt, and safety counters.

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
OPENAI_MODEL=gpt-5.6
```

The adapter uses the Responses API and Structured Outputs with the same Zod schema that validates the
application contract. The model interprets the brief, but it does not compute the cost or authorize
the purchase.

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
    ↓ HTTP polling
Fastify API
    ├── fixture/OpenAI mandate compiler
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
