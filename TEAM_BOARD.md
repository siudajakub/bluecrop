# Deal Hunter — team board

The integration owner maintains this view on `hack/integration`. Lanes have non-overlapping file
areas; only the backend owner changes the shared contract, after agreeing it with UI.

## Available Work

| Slug | Outcome / acceptance | Claim | Contract / dependency | Priority | State |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

Owner of `domain-contracts`, `decision-engine`, `demo-fixtures`, and `safe-checkout`: Jakub.
Owner of `web-golden-path`: a separate frontend owner. `demo-hardening` is a shared integration led by
the integration captain. Planning states: `AVAILABLE`, `PAUSED`, `CUT`.

## Active Lanes

| Lane | Owner | Branch / PR | Contract boundary | State | Next integration action |
| --- | --- | --- | --- | --- | --- |
| backend-golden-path | Jakub | local working tree / no PR | `ui-api-v1 FROZEN` | READY | add key and run live OpenAI smoke |
| web-golden-path | frontend | local working tree / no PR | `ui-api-v1 FROZEN` | READY | connect to the target UI or use as demo |
| demo-hardening | team | local working tree / no PR | build + browser smoke | READY | run a presentation rehearsal with OpenAI |

Delivery states: `ACTIVE`, `BLOCKED`, `READY`, `INTEGRATED`, `CUT`.

## Merge train

| Order | Lane | Reviewer | Checks | Conflict owner |
| --- | --- | --- | --- | --- |
| 1 | domain-contracts | frontend owner | schema examples + validator | Jakub |
| 2 | web-golden-path + decision-engine | mutual review | contract smoke | change owner |
| 3 | demo-fixtures + safe-checkout | frontend owner | evals + idempotency | Jakub |
| 4 | demo-hardening | fresh-context review | full golden path | integration captain |

## Broadcasts

- 2026-07-11 — scraping and real payments are out of MVP scope; we use deterministic replay.
- 2026-07-11 — the UI does not implement or duplicate domain rules; it displays evidence from the API.
- 2026-07-11 — the `ui-api-v1` contract must be frozen before parallel implementation.
- 2026-07-11 — deadline is 18:00 CEST; feature freeze 16:30, demo freeze 17:20.
- 2026-07-11 — stack: Next.js frontend, a separate Node.js backend, TypeScript, and npm workspaces.
- 2026-07-11 — backend fixture golden path READY: 12 tests, build, and smoke pass; live OpenAI awaits a key.
- 2026-07-11 — test UI READY: production build and happy/failure browser smoke pass.
