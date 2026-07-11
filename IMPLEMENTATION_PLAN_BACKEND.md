# Deal Hunter — backend implementation plan

## Target structure

```text
apps/api/src/
  server.ts
  app.ts
  config.ts
  routes/{health,mandates,runs,checkout,receipts}.ts
  services/mandate-compiler/{openai,fixture}.ts
  stores/in-memory-store.ts
packages/contracts/src/
  money.ts mandate.ts offer.ts decision.ts events.ts errors.ts receipt.ts index.ts
packages/domain/src/
  money.ts normalize-offer.ts match-offer.ts total-cost.ts risk.ts policy.ts replay.ts
packages/checkout/src/
  checkout-service.ts revalidate.ts idempotency.ts receipt.ts
fixtures/scenarios/
  golden-path.json uk-currency-trap.json fake-discount.json
tests/
  contracts/ domain/ checkout/ evals/ api/
```

## Wave 1 — runnable contract

1. Create the root `package.json`, workspaces, a shared `tsconfig`, and `dev/check/test/build` scripts.
2. Create the Zod schemas: `Money`, `Mandate`, `OfferEvent`, `Decision`, `ErrorEnvelope`, `Receipt`.
3. Add Fastify, CORS for the local Next.js, and `GET /health`.
4. Implement `FixtureMandateCompiler` and the compile/approve endpoint.
5. Add an in-memory store and a fixed clock/scenario seed.

**Done:** curl creates and approves a mandate without OpenAI, and the contract can be handed to the
frontend.

## Wave 2 — decision vertical

1. Implement pure functions: currency conversion, shipping/fees, full cost.
2. Implement exact-variant matching and minimal risk flags.
3. Implement the policy engine, prioritizing hard blocks before alert/autonomy.
4. Load the three scenarios and emit events according to `sequence`.
5. Add `POST /api/runs` and polling via `GET /api/runs/:id/events?after=`.

**Done:** seed `20260711` always yields a currency trap, a fake discount, and a valid offer.

## Wave 3 — safe action

1. Add revalidation of the mandate, offer, cost, stock, and consent.
2. Store the result of the first mutation under `idempotencyKey` before returning the response.
3. Add a controlled `PRICE_CHANGED` event to the blocking variant.
4. Generate an immutable receipt with inputs, versions, decision, and reasons.
5. Add the checkout endpoint and receipt retrieval.

**Done:** a change blocks the purchase, and two retries return the same purchase and receipt.

## Wave 4 — real OpenAI

1. Add the `openai` SDK and `OpenAIMandateCompiler` behind a shared interface.
2. Use the Responses API and Structured Outputs with the same Zod schema as the contracts.
3. Limit the prompt to intent extraction and ambiguity; no calculation or decisions.
4. Handle refusal, timeout, and service error as a domain error envelope.
5. Add `.env.example`; introduce the real key locally only during integration.

**Done:** the same brief passes through both the OpenAI and fixture compilers, returning the same
response type.

## Wave 5 — verification and demo

1. Unit: money, total cost, matcher, policy precedence, and revalidation.
2. Contract: every fixture passes the Zod schema.
3. Integration: compile → approve → run → poll → checkout → receipt.
4. Invariants: no cap violations and no double purchases.
5. Add `npm run demo:reset` and a single smoke script for the full golden path.

## Cut order

1. Remove replay time delays; keep the event order.
2. Show evals in the terminal instead of an endpoint/panel.
3. Limit semantic matching to exact SKU + size.
4. Limit the AI to a single demo brief.
5. Switch `AUTO_BUY` to `ASK_USER` if the checkout invariants do not pass.

Do not cut: full cost, the approved mandate version, revalidation, idempotency, or the receipt.
