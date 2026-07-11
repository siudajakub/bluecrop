# Deal Hunter — team board

Właściciel integracji utrzymuje ten widok na `hack/integration`. Lane'y mają niepokrywające się
obszary plików; współdzielony kontrakt zmienia wyłącznie właściciel backendu po uzgodnieniu z UI.

## Available Work

| Slug | Outcome / acceptance | Claim | Contract / dependency | Priority | State |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

Właściciel `domain-contracts`, `decision-engine`, `demo-fixtures` i `safe-checkout`: Jakub.
Właściciel `web-golden-path`: osobny frontend owner. `demo-hardening` jest wspólną integracją prowadzoną przez
integration captain. Stany planowania: `AVAILABLE`, `PAUSED`, `CUT`.

## Active Lanes

| Lane | Owner | Branch / PR | Contract boundary | State | Next integration action |
| --- | --- | --- | --- | --- | --- |
| backend-golden-path | Jakub | lokalny working tree / brak PR | `ui-api-v1 FROZEN` | READY | dodać klucz i wykonać live OpenAI smoke |
| web-golden-path | frontend | lokalny working tree / brak PR | `ui-api-v1 FROZEN` | READY | połączyć z docelowym UI albo użyć jako demo |
| demo-hardening | zespół | lokalny working tree / brak PR | build + browser smoke | READY | wykonać próbę prezentacji z OpenAI |

Stany delivery: `ACTIVE`, `BLOCKED`, `READY`, `INTEGRATED`, `CUT`.

## Merge train

| Order | Lane | Reviewer | Checks | Conflict owner |
| --- | --- | --- | --- | --- |
| 1 | domain-contracts | frontend owner | schema examples + validator | Jakub |
| 2 | web-golden-path + decision-engine | wzajemny review | contract smoke | właściciel zmiany |
| 3 | demo-fixtures + safe-checkout | frontend owner | evale + idempotencja | Jakub |
| 4 | demo-hardening | fresh-context review | pełny golden path | integration captain |

## Broadcasts

- 2026-07-11 — scraping i prawdziwe płatności są poza MVP; używamy deterministycznego replay.
- 2026-07-11 — UI nie implementuje ani nie duplikuje reguł domenowych; wyświetla dowody z API.
- 2026-07-11 — kontrakt `ui-api-v1` musi zostać zamrożony przed równoległą implementacją.
- 2026-07-11 — deadline to 18:00 CEST; feature freeze 16:30, demo freeze 17:20.
- 2026-07-11 — stack: Next.js frontend, osobny backend Node.js, TypeScript i npm workspaces.
- 2026-07-11 — backend fixture golden path READY: 12 testów, build i smoke przechodzą; live OpenAI czeka na klucz.
- 2026-07-11 — testowe UI READY: build produkcyjny i browser smoke happy/failure przechodzą.
