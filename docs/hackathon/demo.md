# Deal Hunter — demo runbook

Fill in the exact commit, addresses, and commands by **2026-07-11 17:20 CEST**. The demo must run on
the same seed locally, even if hosting or OpenAI are unavailable.

## Exact artifact

- Commit / tag: will be recorded as `demo-v1` after two successful rehearsals.
- Hosted URL: to be determined.
- Local checkout: the repository root directory.
- Environment owner: Jakub.
- Presenter / backup: to be determined.

## Clean start and reset

Current commands:

```bash
npm install
npm run dev
```

In a second terminal:

```bash
npm run demo:reset
npm run demo:smoke
```

- Required variables in OpenAI mode: `MANDATE_COMPILER_MODE=openai`, `OPENAI_API_KEY`, and optionally
  `OPENAI_MODEL`; fixture mode requires no secrets.
- Health signal: `GET /health` returns 200, and the UI shows the "Demo ready" state.
- Reset: under 10 seconds and re-sets seed `20260711`.

## 2–3 minute scenario

| Time | Presenter action | What the audience sees | Point |
| --- | --- | --- | --- |
| 0:00 | Types the brief Nike Dunk Low, EU 43, up to 80 EUR | The AI creates an explicit mandate | The agent understands intent, but the user approves the limits |
| 0:30 | Approves the mandate and starts monitoring | Offer timeline and full costs | This is a process that runs over time, not a chatbot |
| 0:55 | Replays the UK offer | Cost after FX and delivery exceeds the cap; `IGNORE` | The listed price is not the real cost |
| 1:20 | Replays the fake discount | Price history and risk code; no alert | The engine rejects an apparent deal |
| 1:45 | Replays the NL offer, low stock | `AUTO_BUY` or readiness for checkout | All mandate conditions are checked |
| 2:05 | Injects a price change and retries checkout | Revalidation blocks the purchase | The agent does not exceed the mandate |
| 2:25 | Resets the change and retries twice | One purchase ID and the trust receipt | Idempotency and audit are measurable |
| 2:45 | Shows the evals | Zero cap violations and duplicates | Safety is tested, not declared |

## Fallbacks

| Failure | Detection | Recovery | Maximum pause |
| --- | --- | --- | --- |
| OpenAI timeout/quota | mandate compilation message | `DEMO_FIXTURE_MODE=1`, loaded mandate | 10 s |
| API/hosting unavailable | healthcheck red | local server or UI fixture adapter | 20 s |
| Demo state polluted | different ID or sequence | `npm run demo:reset` | 10 s |
| AUTO_BUY fails evals | false-buy or cap violation | end on `ASK_USER` | no pause |

## Honest limitations

- Merchants, prices, FX, delivery, risk, and payment are deterministic demo data.
- There is no scraping or real money; production requires store adapters, data protection,
  observability, regional policies, and fraud controls.
- The MVP supports one delivery country, one base currency, and one main product category.

## Submission checklist

- The README points to a single start path.
- The hosted link points to the demo-safe commit/tag.
- Local fixture mode has been run on the presentation machine.
- A video or golden-path screenshots are available offline.
- The repo and artifacts contain no secrets or private data.
