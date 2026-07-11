# ADR-001: Choosing the Solidgate path and a modular monolith

- Status: tentatively accepted
- Date: 2026-07-11
- Scope: OpenAI weekend hackathon

## Context

The team is choosing between the narrow Solidgate deal-hunting agent and the broad Boski transactional
workflow. The goal is a working, measurable demo that shows agency, user consent, and safe action.

## Decision

We choose the Solidgate path and position the solution as a **Delegated Purchase Policy Engine** with
deal hunting as the vertical use case.

We implement a modular TypeScript monolith with a separate simulator process/worker only when a
background flow requires it. We base the model runtime on the Responses API, function calling, and
validated structured outputs.

## Architectural principles

1. The LLM interprets, matches semantically, and explains.
2. Deterministic code computes, enforces hard caps, and authorizes.
3. No model tool call bypasses the policy engine.
4. Every consent and decision is versioned and reproducible.
5. Checkout is idempotent and preceded by revalidation.
6. The simulator has a seed, replay, and explicit fixtures.
7. Evals are part of the demo product, not an add-on after implementation.

## Positive consequences

- One coherent demo story.
- Low risk of depending on external stores and payments.
- A clear safety boundary.
- The ability to show results on an eval set.
- Modularity enables later merchant adapters and a broader lifecycle.

## Negative consequences

- The demo does not prove operation on the open internet.
- Generalization must be shown through schemas and adapters, not data scale.
- Simplified duties, FX, and risk must be explicitly labeled as fixtures.
- We do not implement Boski's full post-purchase lifecycle.

## Rejected options

### Full Boski lifecycle

Rejected for a weekend MVP because of the number of domains and failure modes. It may become a
direction after the hackathon.

### Live scraping and browser checkout

Rejected as brittle, unpredictable, and distracting from decision quality.

### Microservices and a multi-agent runtime

Rejected as an operational cost without proportional value for a single vertical flow.
