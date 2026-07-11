# UI-backend contracts

This document freezes only the boundaries needed for parallel work. Once the code exists, the
source of truth is the validated schemas in `packages/contracts`; fixture examples must pass the
same validators as API responses.

## System shape

```text
apps/web
  -> HTTP/SSE adapter
  -> apps/api (Node.js) + packages/domain
  -> replay fixtures / OpenAI / test checkout
```

## Invariants

- AI interprets intent, detects ambiguity, and helps with matching.
- Deterministic code computes cost, enforces the mandate, and authorizes checkout.
- All amounts are integers in minor units together with a currency code.
- Every decision references `mandateVersion`, `offerVersion`, and a list of reason codes.
- The UI does not derive business decisions and does not treat the textual explanation as a source
  of truth.
- Every mutating command accepts an `idempotencyKey`.

## Ownership map

| Surface | Owner | Consumer | Stable entry point |
| --- | --- | --- | --- |
| Schemas and reason codes | Jakub | UI, evals | `packages/contracts` |
| Brief and mandate compilation | Jakub | UI | `POST /api/mandates/compile` |
| Monitoring and replay | Jakub | UI | `POST /api/runs`, `GET /api/runs/:id/events` |
| Decisions and trust receipts | Jakub | UI | run events plus `GET /api/receipts/:id` |
| Views and interaction states | frontend owner | user | `apps/web` |
| UI fixture adapter | frontend owner | UI | `apps/web/src/data` |

## `ui-api-v1`

- Owner: Jakub.
- Consumer: frontend owner/UI.
- Status: `v1 FROZEN` since **2026-07-11**; changes only via the protocol below.
- Transport: JSON over HTTP; monitoring via polling `GET /api/runs/:id/events?after=<sequence>`.
- UI timeout: 10 s for commands; after a timeout the UI shows a retry with the same
  `idempotencyKey`.
- Compatibility: adding optional fields is allowed; changing meanings, removing fields, or removing
  reason codes requires consumer sign-off.

### Mandate compilation

The request accepts optional structural fields alongside the free-text brief. When present, the
structural values always win over anything parsed or extracted from the brief:

- `maxTotal` (Money: `{ amountMinor, currency }`) - the budget cap for the mandate.
- `purchaseBy` (ISO date string `YYYY-MM-DD`, or explicit `null` for "buy now") - the purchase
  deadline. Omit the field to let the compiler extract a deadline from the brief.

```json
POST /api/mandates/compile
{
  "brief": "Nike Dunk Low, size 43, new, maximum 80 EUR with delivery",
  "baseCurrency": "EUR",
  "destinationCountry": "PL",
  "maxTotal": { "amountMinor": 8000, "currency": "EUR" },
  "purchaseBy": "2026-07-18"
}
```

```json
200 OK
{
  "mandate": {
    "id": "m_01",
    "version": 1,
    "product": { "query": "Nike Dunk Low", "size": "EU 43", "condition": "NEW" },
    "maxTotal": { "amountMinor": 8000, "currency": "EUR" },
    "purchaseBy": "2026-07-18",
    "sellerPolicy": { "allowResellers": false },
    "autonomy": "AUTO_BUY_IF_LOW_STOCK",
    "status": "DRAFT"
  },
  "ambiguities": [],
  "compiler": "fixture"
}
```

`Mandate.purchaseBy` is an ISO date or `null`. A `null` means the mandate has no deadline and
autonomous purchases stay allowed indefinitely.

Validation error:

```json
422 Unprocessable Entity
{
  "mandate": { "id": "m_02", "version": 1, "status": "DRAFT" },
  "ambiguities": [
    { "field": "product.size", "code": "REQUIRED", "question": "What size should the product be?" }
  ],
  "compiler": "openai",
  "error": {
    "code": "AMBIGUOUS_MANDATE",
    "message": "Provide the missing mandate constraints.",
    "fieldErrors": [{ "field": "product.size", "code": "REQUIRED" }]
  }
}
```

A structural `maxTotal` in the request resolves the `maxTotal` ambiguity even when the brief does
not mention a budget.

### Approval and run start

```json
POST /api/mandates/m_01/approve
{ "expectedVersion": 1, "idempotencyKey": "approve-demo-01" }
```

Revoking consent bumps the mandate version and blocks any later checkout:

```json
POST /api/mandates/m_01/revoke
{ "expectedVersion": 1, "idempotencyKey": "revoke-demo-01" }
```

```json
POST /api/runs
{ "mandateId": "m_01", "scenarioId": "golden-path", "seed": 20260711,
  "idempotencyKey": "run-demo-01" }
```

```json
201 Created
{ "runId": "run_01", "status": "COMPLETED", "eventCursor": "0" }
```

Polling returns only events with a sequence greater than `after`:

```json
GET /api/runs/run_01/events?after=0
{
  "runId": "run_01",
  "status": "COMPLETED",
  "events": [],
  "nextCursor": "8"
}
```

### Decision event

```json
{
  "eventId": "evt_03",
  "sequence": 3,
  "type": "DECISION_MADE",
  "occurredAt": "2026-07-11T10:00:20Z",
  "data": {
    "decisionId": "d_03",
    "action": "AUTO_BUY",
    "mandateVersion": 1,
    "offerVersion": 2,
    "total": { "amountMinor": 7860, "currency": "EUR" },
    "reasonCodes": ["EXACT_VARIANT", "WITHIN_TOTAL_CAP", "LOW_STOCK"],
    "explanation": "The offer satisfies all approved constraints."
  }
}
```

Allowed actions: `IGNORE`, `ALERT`, `ASK_USER`, `AUTO_BUY`. The UI ignores unknown event `type`s
and logs them diagnostically; an unknown decision action is a contract error and blocks the UI
checkout.

#### Purchase deadline enforcement

When a decision is evaluated after the mandate's `purchaseBy` date has passed (the deadline day
itself still counts, end of day UTC), the decision engine downgrades `AUTO_BUY` to `ALERT` and adds
the `DEADLINE_PASSED` reason code. The offer is still surfaced to the user, but autonomous
purchasing is disabled, and checkout revalidation rejects the non-`AUTO_BUY` decision.

### Test checkout

```json
POST /api/decisions/d_03/checkout
{ "mandateVersion": 1, "offerVersion": 2, "idempotencyKey": "checkout-d_03" }
```

Success:

```json
200 OK
{
  "status": "COMPLETED",
  "purchaseId": "p_01",
  "receiptId": "r_01",
  "idempotentReplay": false
}
```

Blocked after a price or consent change:

```json
409 Conflict
{
  "error": {
    "code": "REVALIDATION_FAILED",
    "message": "The offer changed before finalization.",
    "reasonCodes": ["PRICE_CHANGED", "TOTAL_CAP_EXCEEDED"]
  }
}
```

A retry with the same key returns the same `purchaseId` and `idempotentReplay: true`.

### Receipts list

`GET /api/receipts` returns every trust receipt in the store, newest first
(`ListReceiptsResponse` in `packages/contracts`). The UI uses it to restore purchase history after
a page reload:

```json
GET /api/receipts
{
  "receipts": [
    {
      "id": "r_01",
      "purchaseId": "p_01",
      "decisionId": "d_03",
      "mandateId": "m_01",
      "mandateVersion": 1,
      "offerId": "offer-nl-winner",
      "offerVersion": 2,
      "cost": { "total": { "amountMinor": 7650, "currency": "EUR" } },
      "reasonCodes": ["EXACT_VARIANT", "WITHIN_TOTAL_CAP", "LOW_STOCK"],
      "idempotencyKey": "checkout-d_03",
      "completedAt": "2026-07-11T10:05:00Z"
    }
  ]
}
```

Individual receipts remain available at `GET /api/receipts/:receiptId`.

### Controlled demo mutation

The mutation is a local demo tool, not a production shop endpoint:

```json
POST /api/runs/run_01/mutations
{ "type": "PRICE_CHANGED", "offerId": "offer-nl-winner", "amountMinor": 7900 }
```

The response contains the offer with a bumped version plus a new cursor. A checkout created on the
previous version returns `409 REVALIDATION_FAILED` with `OFFER_VERSION_CHANGED`, `PRICE_CHANGED`
and - when the full cost exceeded the cap - `TOTAL_CAP_EXCEEDED`.

### Reason codes

The full enum lives in `packages/contracts` (`ReasonCodeSchema`): `EXACT_VARIANT`,
`VARIANT_MISMATCH`, `WITHIN_TOTAL_CAP`, `TOTAL_CAP_EXCEEDED`, `LOW_STOCK`, `RESELLER_BLOCKED`,
`FAKE_DISCOUNT`, `INVALID_COUPON`, `INSUFFICIENT_TRUST`, `APPROVAL_REQUIRED`, `DEADLINE_PASSED`.

- `DEADLINE_PASSED` - the mandate's `purchaseBy` date has passed; the decision was downgraded from
  `AUTO_BUY` to `ALERT`.

### Safety counters

```json
GET /api/evals/summary
{
  "runs": 1,
  "decisions": 3,
  "purchases": 1,
  "hardCapViolations": 0,
  "duplicateBuys": 0,
  "falseBuyRate": 0,
  "decisionCounts": { "IGNORE": 2, "ALERT": 0, "ASK_USER": 0, "AUTO_BUY": 1 }
}
```

## Shared data

| Name | Source of truth | Owner | Reset / seed |
| --- | --- | --- | --- |
| Golden path | `fixtures/scenarios/golden-path.json` | Jakub | eventually `npm run demo:reset` |
| Currency trap | `fixtures/scenarios/uk-currency-trap.json` | Jakub | same reset |
| Fake discount | `fixtures/scenarios/fake-discount.json` | Jakub | same reset |
| UI offline fixture | generated from the contracts above | frontend owner | eventually `npm run web:fixtures` |

## Changing a contract

1. The owner describes the difference and identifies the consumers.
2. The consumer confirms the change or asks for a compatibility adapter.
3. The integration captain marks the contract `CHANGING` and adds a broadcast.
4. The change and the adapter land in a single integration wave.
5. After the contract smoke test the status returns to `FROZEN`.
