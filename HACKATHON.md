# Deal Hunter — hackathon card

This file is a short source of truth about the demo scope. The integration owner keeps it updated on
`hack/integration`; feature lanes only consume it.

## Mission

- Problem: comparison sites show the listed price, but do not make a safe decision based on the full
  cost, variant, risk, and user consent.
- User: someone looking for a specific product, who knows the maximum cost and can wait for the right
  offer.
- Promise: the agent watches offer changes and acts on its own, but never exceeds an explicit,
  approved mandate.
- Judging bias: auditable agency and decision safety, not the number of integrations.
- Deadline: **2026-07-11 18:00 CEST**; a five-hour sprint starting around 13:00 CEST.

## Golden path

1. The user describes the product, variant, cost cap, and autonomy scope.
2. The AI creates an editable mandate; the user approves it.
3. The replay engine emits three realistic offer events.
4. The engine rejects the currency trap and the fake discount, and qualifies the valid offer for
   purchase.
5. Revalidation blocks the changed offer, or executes exactly one purchase and shows the trust receipt.

## Acceptance threshold

- Must work: brief → mandate → replay → decisions → test checkout → trust receipt.
- May be mocked: merchants, exchange rates, delivery, duties, coupons, stock, and payment.
- Must be real: AI mandate parsing, cost calculation, policy engine, revalidation, idempotency,
  audit log, and reproducible evals.
- Cut: live scraping, real payments, multi-user, global taxes, returns, a mobile app, and
  microservices.

## Roles and ownership

- App/backend owner: Jakub — domain, API, AI, replay, data, evals, and checkout.
- UI owner: a separate team member — frontend, interface states, and integration through the frozen
  contract; name to be added to the board.
- Integration captain: Jakub, unless the team designates someone else.
- Demo-safe branch: `main`.
- Integration branch: `hack/integration`.
- Presenter and backup: to be decided before the first demo rehearsal.

## Gate order

| Gate | Moment | Exit condition |
| --- | --- | --- |
| Contract freeze | 2026-07-11 13:30 CEST | Schemas and example responses accepted |
| First integration | 2026-07-11 15:00 CEST | UI shows one fixture decision through the same adapter as the API |
| Feature freeze | 2026-07-11 16:30 CEST | Full golden path works; only fixes and demo copy after this |
| Demo freeze | 2026-07-11 17:20 CEST | Two rehearsals, exact commit, seed, reset, and backup recorded |
| Submission | 2026-07-11 18:00 CEST | Repo, link, description, and materials submitted |

## Failure budget and cuts

| Risk | Signal | Fallback / owner |
| --- | --- | --- |
| OpenAI unavailable | timeout or quota | saved fixture mandate; Jakub |
| API unavailable in UI | healthcheck does not respond | local fixture adapter with an identical contract; frontend owner |
| Uncertain AUTO_BUY | false-buy test fails | end on `ASK_USER`; Jakub |
| Lane not ready at freeze | no READY state | disable via flag or remove from the demo route; lane owner |
| Online demo fails | hosting error | local build and golden-path recording; integration captain |

## Project sources

- [Idea summary](PODSUMOWANIE_POMYSLU.md)
- [Implementation plan](plan_implementacji.md)
- [Domain backlog](zadania.md)
- [MVP PRD](docs/prds/deal-hunter-mvp-v1.0-prd.md)
- [Backend implementation plan](IMPLEMENTATION_PLAN_BACKEND.md)
- [UI–backend contracts](docs/hackathon/contracts.md)
- [Team board](TEAM_BOARD.md)
