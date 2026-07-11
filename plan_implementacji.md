# Implementation plan: Deal Hunter

> **Update 2026-07-11:** the deadline is 18:00 CEST, and the time available is about five hours. The
> overarching schedule, the Next.js/Node.js split, and the freeze times are in
> [PLAN_ZESPOLU_HACKATHON.md](PLAN_ZESPOLU_HACKATHON.md). This document remains a description of the
> technical ordering, but its original 36-hour schedule no longer applies.

## Technical recommendation

Build a modular monolith in TypeScript. The model interprets intent and proposes actions via typed
tools. Deterministic code computes costs, enforces constraints, and authorizes actions. Merchants,
prices, exchange rates, and checkout use reproducible test data.

## Recommended team split

- Product/UX and frontend: brief, mandate, timeline, trust receipt, and the presentation scenario.
- Agent and backend: Responses API, tools, and orchestration.
- Domain and safety: final cost, policies, state machine, and idempotency.
- Evals and demonstration: simulator, test data, red-team scenarios, and metrics.

On a three-person team, combine the agent/backend and domain/safety roles. Evals should be owned by
the whole team.

## Stage 1: contracts and scaffold

1. Define the domain schemas and safety invariants.
2. Build a minimal UI flow: brief → mandate review → monitoring.
3. Implement state and event-timeline persistence.
4. Connect mandate compilation with Structured Outputs.

Completion criterion: any brief creates a valid, visible, and versioned mandate.

## Stage 2: decision engine

1. Implement a simulator with a seed and the ability to replay a run.
2. Normalize offers and check the exact variant.
3. Compute the final cost via a deterministic reference source.
4. Assess risk and run the policy engine.
5. Record every stage as structured evidence.

Completion criterion: every event ends with a repeatable `IGNORE`, `ALERT`, `ASK_USER`, or `AUTO_BUY`
decision.

## Stage 3: safe checkout

1. Build a test checkout with an idempotency key.
2. Recheck price, availability, variant, and consent.
3. Block material changes and ask for re-approval.
4. Generate an immutable trust receipt.

Completion criterion: retries do not duplicate purchases, and revoking consent or exceeding the cap
blocks the transaction.

## Stage 4: evals and demonstration

1. Prepare 10–15 labeled cases focused on the cap, variant, consent, and duplicates.
2. Run invariant tests and usefulness/safety metrics.
3. Add a results panel and the ability to replay failures.
4. Rehearse a 2–3 minute presentation.
5. Freeze a stable build and a local fallback data set.

Completion criterion: the demonstration works repeatably without brittle dependencies, shows metrics,
and does not violate caps or idempotency.

## Archived full-variant schedule

This variant does not apply to the five-hour sprint; we keep it only as a plan for developing the
project after the hackathon.

- 0–3 h: data contracts, UX, and scaffold.
- 3–10 h: simulator, final cost, and policy engine.
- 10–16 h: OpenAI integration, matching, and explanations.
- 16–22 h: checkout, revalidation, audit, and idempotency.
- 22–30 h: evaluation set, tests, red-team, and results panel.
- 30–36 h: interface polish, presentation rehearsal, fallback variant, and fixes.

## Continuation criteria

- Add optional integrations only once the full flow works on test data.
- Hold off on additions until the cap, consent, and idempotency tests pass.
- Skip scraping and real payments if they threaten the demonstration's repeatability.
- Add a second category only after closing the evals and the main scenario.
