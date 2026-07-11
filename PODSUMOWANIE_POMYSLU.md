# Deal Hunter — idea summary for a decision

## Status

**Working concept. We do not begin implementation before a shared review and approval of the scope.**

## The idea in one sentence

Deal Hunter is a shopping agent that takes a product, conditions, and a spending cap from the user,
watches offer changes, computes the full cost, and buys or asks for consent only once all conditions
are met.

## Problem

Current comparison sites and price alerts mostly watch the price shown on the page. They do not
reliably account for:

- delivery cost;
- currency exchange rate;
- duties and additional fees;
- coupon validity;
- the correct product variant;
- availability and merchant trustworthiness;
- whether the declared discount is genuine.

The user gets many alerts, but still has to check the offer and make the purchase in time by
themselves. Deal Hunter is meant to do this work in the background, staying within the agreed limits.

## Who it is for

We target the first scenario at someone who:

- is looking for a specific product or variant;
- knows the maximum cost including delivery;
- can wait for a good offer;
- wants to reduce the number of notifications;
- allows an automatic purchase only under clearly defined conditions.

## Example

The user types:

> Nike Dunk Low, size 43, new, no resellers, maximum 80 EUR delivered. If stock is low and all
> conditions are met, you may buy automatically.

The system turns this message into an explicit mandate:

- product: Nike Dunk Low;
- size: 43;
- condition: new;
- resellers: not allowed;
- maximum final cost: 80 EUR;
- automatic purchase: allowed when stock is low;
- uncertainty or missing data: ask the user.

The user reviews and approves the interpretation before monitoring starts.

## Core value

The product is not just meant to find the lowest price. It is meant to make a correct and auditable
decision within the user's limits.

The key promise is:

> The agent may act on its own, but it may not exceed the mandate.

## How it works

1. The user describes the product, conditions, cap, and autonomy scope.
2. The model turns the description into a structured mandate and flags ambiguities.
3. The user approves or corrects the mandate.
4. The simulator delivers changing offers from different merchants.
5. The system matches the product and the exact variant.
6. Code computes the full final cost.
7. The system checks risk, availability, discount, and mandate constraints.
8. The policy engine selects one decision:
   - `IGNORE` — the offer does not meet the conditions;
   - `ALERT` — worth informing the user;
   - `ASK_USER` — a decision or additional consent is needed;
   - `AUTO_BUY` — the system may execute a test purchase.
9. Before buying, the system rechecks the price, product, stock, and consent validity.
10. The system records the decision, the calculations, and the mandate used in a trust receipt.

## What is agentic here

- The agent carries out a task over a longer time, instead of responding to a single prompt.
- It reacts to new events without the user being present in an active tab.
- It uses tools to fetch, normalize, and evaluate offers.
- It recognizes ambiguity and escalates it to a human.
- It takes action only within the allowed scope.
- It can explain why it accepted or rejected an offer.

## The role of AI and plain code

### The AI model

- interprets natural language;
- detects ambiguous conditions;
- normalizes different names of the same product;
- evaluates the semantic match of offers;
- produces an understandable explanation of the decision.

### Deterministic code

- computes price, delivery, exchange rates, and fees;
- enforces the hard spending cap;
- enforces the consent scope;
- rechecks the offer before purchase;
- prevents a double purchase;
- records the audit trail and computes metrics.

**Safety principle: the model proposes, and the code authorizes.**

## MVP scope

### In scope

- one main product category;
- one delivery country and base currency;
- 3–5 simulated merchants;
- a natural-language brief and an editable mandate;
- simulated price events;
- product and variant matching;
- a final-cost calculator;
- detection of several risk types;
- four kinds of decisions;
- a test checkout;
- revalidation and idempotency;
- a trust receipt;
- a results panel over prepared test cases.

### Out of scope

- scraping real stores;
- real money and payments;
- full handling of taxes and duties worldwide;
- multiple users;
- an elaborate marketplace;
- returns and after-sales support;
- a mobile app;
- a microservice architecture.

## Proposed demonstration

The demo should last 2–3 minutes and show three offers:

1. A UK offer looks cheap, but after adding the exchange rate, shipping, and fees it exceeds the cap.
   The system rejects it.
2. The second offer declares a large discount, but the price history reveals an artificial reduction.
   The system does not send an alert.
3. A Netherlands offer meets the conditions, fits within the cap, and has low stock. The system
   prepares the purchase.

Before finalizing, we inject a price change or revoke consent. The system blocks the transaction. We
then replay the variant without the change and show a single purchase despite the request being
retried.

At the end, the juror sees:

- the full cost;
- the conditions met and rejected;
- the mandate version;
- the decision reason;
- the idempotency key;
- the safety test results.

## How we measure success

Key metrics:

- `false_buy_rate = 0`;
- `hard_cap_violations = 0`;
- `duplicate_buys = 0`;
- variant match correctness;
- precision of the selected deals;
- the number of good offers missed;
- correctness of escalating ambiguity;
- decision repeatability after replaying the events;
- trust receipt completeness.

## Preliminary architecture

We recommend a modular monolith in TypeScript:

```text
Web UI
  → API and orchestrator
      → mandate compiler
      → event simulator
      → offer normalizer and matcher
      → final-cost calculator
      → risk verifier
      → consent and policy engine
      → test checkout
      → audit and evals
  → SQLite or PostgreSQL
  → OpenAI Responses API
```

We do not plan microservices or a multi-agent runtime in a weekend MVP.

## Biggest risks

| Risk | Impact | Mitigation |
|---|---|---|
| The project looks like yet another shopping chatbot | Low originality | Show action over time, policy, and audit, not a conversation |
| The simulator looks like an animation | Low credibility | Seed, replay, explicit inputs, and evals |
| The model plays too small a role | The "why OpenAI?" question | Use AI for intent, ambiguity, and matching |
| The model decides about money | Lack of trust | Leave authorization to deterministic code |
| A single product limits generalization | The demo looks like a sneaker tracker | Show a second adapter or a second product type |
| Scope too broad | An unfinished flow | Close the full vertical before adding features |

## Decisions requiring shared approval

1. Do we choose this concept over the Boski path?
2. Does the main demo stay with sneakers?
3. Is `AUTO_BUY` a key part of the demo, or do we mainly show `ASK_USER`?
4. Is the mandate approved once, or does every transaction require confirmation?
5. How broadly do we show generalization: a second merchant or a second category?
6. Do we present a consent revocation, a price change, or both cases?
7. Is the evals panel part of the main demo, or material for juror questions?
8. What is the actual team composition, stack, and time until the presentation?

## Principle for evaluating proposed changes

We analyze every team proposal before including it in the approved concept. A suggestion alone does
not change the scope.

We evaluate every change against six criteria:

1. **User value** — what problem does it solve?
2. **Impact on juror evaluation** — does it strengthen agency, trust, the demo, or measurability?
3. **Cost and time** — how much work does it require and what will it delay?
4. **Technical risk** — what dependencies and new failure modes does it introduce?
5. **Impact on coherence** — does it strengthen the main story, or dilute it?
6. **Opportunity to simplify** — can we achieve the same effect with a smaller scope?

The analysis result takes one of four forms:

- **Accept** — the value outweighs the cost and risk.
- **Accept with changes** — the idea is good, but needs narrowing.
- **Defer** — the value is real, but does not fit the MVP.
- **Reject** — the idea weakens the product or does not justify the cost.

The change evaluation will have a fixed format:

```text
Proposal:
Problem solved:
Benefit:
Cost:
Risks:
Impact on demo and architecture:
Simpler variant:
Recommendation:
Team decision:
```

## Next step

The team should now review the sections: "The idea in one sentence", "MVP scope", "Proposed
demonstration", and "Decisions requiring shared approval". After gathering feedback, we evaluate each
change separately and only then freeze the concept version for implementation.
