# Deal Hunter MVP — Product Requirements Document

## Requirements description

### Context

- **Problem:** the price shown in a store does not account for the full cost, variant, risk, consent,
  or the offer's freshness.
- **User:** someone looking for an exact product, who defines a cap and an acceptable level of
  autonomy.
- **Value:** the agent watches offer events and can act on its own, but deterministic code never
  allows it to exceed the approved mandate.
- **Deadline:** 2026-07-11 18:00 CEST; local demo.

### Functional scope

1. A natural-language brief is compiled by the OpenAI Responses API into an explicit mandate.
2. The user approves the mandate before monitoring starts.
3. Deterministic replay emits three offer scenarios.
4. The engine computes the full cost and selects `IGNORE`, `ALERT`, `ASK_USER`, or `AUTO_BUY`.
5. The test checkout rechecks the mandate and offer, and is idempotent.
6. The system returns an audit trail and a trust receipt with reason codes.

### Out of scope

- scraping, real stores, and payments;
- a database, login, and multiple users;
- SSE/WebSocket — the frontend polls the events endpoint;
- global taxes, returns, and a second product category;
- public deployment as a completion condition.

## User flow

1. The user types a brief and clicks "Create mandate".
2. The system returns a `DRAFT` or explicit ambiguities.
3. The user approves the mandate version.
4. The system runs the `golden-path` scenario with a fixed seed.
5. The UI polls events and presents the cost, decision, and evidence.
6. For a valid offer, the system attempts checkout.
7. A price change blocks the first variant; after a reset, a retry creates exactly one purchase.
8. The user sees the trust receipt.

## Technical decisions

### Architecture

- npm workspaces: `apps/api`, `apps/web`, `packages/contracts`, `packages/domain`,
  `packages/checkout`, `fixtures`, `tests`;
- Node.js + TypeScript; a single API process, Fastify recommended;
- Next.js belongs to a separate frontend owner;
- process state, mandates, runs, events, and purchases stored in memory;
- fixtures in versioned JSON files;
- a single Zod schema is the source of types, validation, and Structured Outputs.

### OpenAI

- the official `openai` SDK only in `apps/api`;
- Responses API with Structured Outputs for `MandateDraft`;
- `OPENAI_API_KEY` added only at integration time, exclusively via a local `.env`;
- `OPENAI_MODEL` is configurable and tested against a model available to the account;
- `MANDATE_COMPILER_MODE=fixture` returns the same contract without the network;
- refusal, timeout, SDK error, and a semantically incomplete result map to an explicit domain error;
- the model does not compute cost and does not authorize checkout.

### Data and safety

- money as `amountMinor` + a three-letter currency code;
- all mutations accept an `idempotencyKey`;
- checkout requires the expected mandate and offer version;
- the secret must not reach Next.js, logs, fixtures, or the repository;
- replay with the same seed produces the same sequence of decisions.

## Error handling

| Situation | Response | Client behavior |
| --- | --- | --- |
| Incomplete brief | 422 `AMBIGUOUS_MANDATE` | shows the fields to complete |
| OpenAI unavailable | 503 `MANDATE_COMPILER_UNAVAILABLE` | retry or fixture mode |
| Stale version | 409 `VERSION_CONFLICT` | fetches the current state |
| Price/consent changed | 409 `REVALIDATION_FAILED` | blocks the purchase and shows reasons |
| Repeated key | 200 with the previous result | does not create a second operation |
| Unknown run | 404 `RUN_NOT_FOUND` | returns to the initial state |

## Acceptance criteria

### Functional

- [ ] The real Responses API returns a mandate that conforms to the schema.
- [ ] Fixture mode returns an identical contract without a key or network.
- [ ] The three scenarios yield the expected decisions with seed `20260711`.
- [ ] The full cost is computed exclusively by domain code.
- [ ] A price change or revoked consent blocks checkout.
- [ ] Two requests with the same key create one `purchaseId`.
- [ ] The receipt contains versions, cost, reason codes, and the idempotency key.

### Quality

- [ ] `npm run check`, `npm run test`, and `npm run build` pass.
- [ ] 10–15 cases cover cap, variant, resellers, fake discount, consent, and duplicates.
- [ ] `hard_cap_violations = 0` and `duplicate_buys = 0`.
- [ ] Resetting and starting the local demo take less than a minute.
- [ ] The repository and logs contain no API key.

## Risks and cuts

| Risk | Mitigation | Cut if time runs out |
| --- | --- | --- |
| No key/model | fixture adapter, model via env | demo on a saved mandate |
| UI integration is delayed | frozen payloads and polling | backend demo via curl/HTTP client |
| AUTO_BUY fails tests | revalidation and invariant tests | end on `ASK_USER` |
| Too much matching logic | exact SKU/size + simple semantic score | exact variant only |
| No time for the evals panel | metrics in receipt/JSON | results shown in the terminal |

## Execution phases

1. **Contracts and scaffold — 30 min:** workspace, Zod, error envelope, healthcheck.
2. **Thin vertical — 60 min:** fixture compiler, approve, run, polling, one decision.
3. **Domain — 60 min:** money, full cost, matching, policy engine, three scenarios.
4. **Checkout — 30 min:** revalidation, idempotency, receipt.
5. **OpenAI — 30 min:** Responses API, Structured Outputs, refusal/timeout, env.
6. **Tests and demo — 60 min:** evals, reset, full smoke, two runs.
7. **Submission buffer — 30 min:** documentation, backup, and only blocking fixes.

---

**Version:** 1.0  
**Created:** 2026-07-11  
**Refinement rounds:** 2  
**Requirements quality score:** 93/100
