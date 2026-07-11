# Hackathon backlog: Deal Hunter

## Goal

Deliver a demo MVP of a delegated-purchase engine. The system interprets a mandate, processes
simulated offers, computes the final cost, enforces deterministic caps, and executes an auditable
test purchase.

## P0: full flow

- [x] Define the `MandateVersion`, `CanonicalOffer`, `Decision`, and `AuditReceipt` schemas.
- [x] Implement the brief form and the explicit mandate review in the test UI.
- [x] Integrate the OpenAI Responses API with validated structured data (adapter ready; live test after adding a key).
- [x] Build a deterministic simulator with a seed and the ability to replay a run.
- [x] Implement product and variant normalization and matching for the MVP.
- [x] Build a final-cost calculator with test FX, shipping, and fee data.
- [x] Detect MVP risks: fake discount, reseller, invalid coupon, trust, and out-of-stock at checkout.
- [x] Implement a deterministic policy engine.
- [x] Add pre-purchase revalidation and idempotency.
- [x] Record an in-memory event log and generate a trust receipt.
- [x] Show the full timeline in the interface.

## P0: quality and safety

- [x] Prepare 12 test cases with expected decisions; covering cap, variant, merchant, coupon, trust,
  price change, and duplicate.
- [x] Test the spending cap, price change, and duplicate checkout; the revoked-consent test remains.
- [x] Guarantee `hard_cap_violations = 0` and `duplicate_buys = 0` in the current test set.
- [x] Compute the current safety counters: false-buy rate, hard-cap violations, and duplicate buys.
- [ ] Enable replaying of failed cases.

## P1: demonstration quality

- [x] Prepare the currency-trap scenario with a UK offer.
- [x] Prepare the fake-discount scenario.
- [x] Prepare a valid Netherlands offer with low stock.
- [x] Add a controlled price change during the demonstration.
- [ ] After the hackathon: show a second merchant adapter or a second product category.
- [x] Prepare a 2–3 minute presentation scenario and a variant that runs fully locally.

## Out of scope

- live scraping;
- real payments;
- global tax and duty calculation;
- a full marketplace;
- multi-user support;
- returns and after-sales support;
- a microservice architecture.
