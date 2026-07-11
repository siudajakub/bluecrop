# Deal Hunter — team work plan

## Sprint parameters

- Deadline: **2026-07-11 18:00 CEST**.
- Time available: about 5 hours.
- Frontend: Next.js + TypeScript.
- Backend: Node.js + TypeScript; Fastify recommended for a small, explicit API.
- Organization: npm workspaces with `apps/web`, `apps/api`, and `packages/contracts`.
- Priority: a working golden path and a reliable presentation, not product breadth.

## Responsibility split

### Jakub — everything outside the UI

- stack choice and workspace scaffold;
- domain contracts and data validation;
- API, persistence, and OpenAI orchestration;
- replay engine and realistic fixtures;
- matching, final cost, risk, and policy engine;
- revalidation, test checkout, and idempotency;
- audit log, trust receipt, evals, and reset commands;
- API deployment and offline mode.

### Separate frontend owner — the UI

- visual direction and component system;
- brief and the editable mandate review;
- monitoring, timeline, and decision views;
- final cost, reason codes, and risk presented without hiding evidence;
- loading, empty, error, retry, and offline-fixture states;
- revalidation screen, blocks, and trust receipt;
- responsiveness, accessibility, and tests of the main UI flow;
- integration only through `ui-api-v1`, without copying domain rules.

### Shared

- freezing the contract and example payloads;
- the first end-to-end vertical;
- contract smoke and error handling;
- demo rehearsals, scope cuts, and the final build.

## 13:00–13:30 — contract and scaffold

Jakub creates the npm workspace, `apps/api`, and `packages/contracts`. The frontend owner creates
`apps/web` in Next.js. We approve the state names, request/response, error codes, and the three
fixtures. We move `ui-api-v1` from `PROPOSED` to `FROZEN`. Then we work in parallel.

Exit condition: the example payloads validate, the UI can run on the fixture adapter, and the backend
can implement the same contract independently.

## 13:30–15:00 — thin end-to-end vertical

- Jakub: one saved mandate, one scenario, one decision, and a simple receipt through the API.
- Frontend owner: brief → mandate → run → one decision card on the fixture adapter.
- Together: switch the UI adapter from fixture to API without changing components.

Exit condition: one complete path works end-to-end. We do not add more screens or rules until this
vertical passes contract smoke.

## 15:00–16:00 — three scenarios and full cost

- Jakub: replay, full cost, matching, risk signals, and the four decisions.
- Frontend owner: timeline, three scenarios, reason codes, error states, and clear explanations.
- Integration at 15:30 and 16:00 at the latest, on `hack/integration`, one lane at a time.

Exit condition: the currency trap, the fake discount, and the valid NL offer produce the expected
decisions both in tests and in the UI.

## 16:00–16:30 — checkout and safety

- Jakub: revalidation, revoked consent, price change, idempotency key, audit receipt, and evals.
- Frontend owner: a readable block, retry with the same key, receipt, and a panel of the key metrics.
- Together: test a double click, a timeout, and a retry after a refresh.

Exit condition: the cap and idempotency tests pass, and every rejection has a reason code and
evidence visible in the UI. At 16:30 comes the absolute feature freeze.

## 16:30–17:20 — integration and demo hardening

- freeze features and cut everything outside the golden path;
- run the full tests on the exact demo candidate;
- run two rehearsals with a reset from scratch;
- check the no-OpenAI and no-hosting mode;
- tag the commit, record a backup, and do not update dependencies after the freeze.

## 17:20–18:00 — submission buffer

- do not change features or dependencies;
- fix only bugs that block startup or the presentation;
- prepare the description, links, screenshots/recording, and the final submission;
- at 17:45 stop code changes, unless the app does not start at all.

## Integration order

1. Contracts and fixtures.
2. Thin API + thin UI.
3. Replay and the three decisions.
4. Checkout, revalidation, and receipt.
5. Evals, polish, and the demo fallback.

## Collaboration rules

- Jakub does not edit `apps/web/**`; the frontend owner does not edit the domain, policy engine, or
  checkout.
- `packages/contracts/**` has a single owner: Jakub. The frontend owner proposes changes via an
  example and a description of the consumer's behavior.
- The UI always has a fixture adapter compatible with the contract, so neither side waits for a
  finished backend.
- A contract change requires a compatibility adapter or a shared integration wave.
- After 15 minutes of being blocked, the owner records a fallback and reports it to the integration
  captain.
- The scraper, real payments, and a second category do not enter the MVP.
- An elaborate evals panel is dropped from the main UI; 3–5 key results in the receipt or the final
  view are enough.

## First concrete steps

1. Jakub picks the stack and creates the workspace manifest and `packages/contracts`.
2. Jakub moves the examples from `docs/hackathon/contracts.md` into validated schemas.
3. The frontend owner prepares the frontend adapter and UI on those examples.
4. Jakub implements `golden-path.json` and the compile/run/events/checkout endpoints.
5. We connect the thin vertical, freeze the contract, and only then expand the mechanics.
