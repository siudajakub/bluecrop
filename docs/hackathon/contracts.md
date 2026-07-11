# Kontrakty UI–backend

Ten dokument zamraża tylko granice potrzebne do równoległej pracy. Źródłem prawdy po utworzeniu
kodu będą walidowane schematy w `packages/contracts`; przykłady fixture muszą przechodzić te same
walidatory co odpowiedzi API.

## Kształt systemu

```text
apps/web
  -> HTTP/SSE adapter
  -> apps/api (Node.js) + packages/domain
  -> replay fixtures / OpenAI / testowy checkout
```

## Niezmienniki

- AI interpretuje intencję, wykrywa niejednoznaczność i pomaga w matchingu.
- Deterministyczny kod liczy koszt, egzekwuje mandat i autoryzuje checkout.
- Wszystkie kwoty są integerami w minor units wraz z kodem waluty.
- Każda decyzja wskazuje `mandateVersion`, `offerVersion` i listę kodów powodów.
- UI nie wylicza decyzji biznesowej i nie traktuje wyjaśnienia tekstowego jako źródła prawdy.
- Każde polecenie mutujące przyjmuje `idempotencyKey`.

## Mapa własności

| Surface | Właściciel | Konsument | Stabilny punkt wejścia |
| --- | --- | --- | --- |
| Schematy i kody powodów | Jakub | UI, evale | `packages/contracts` |
| Brief i kompilacja mandatu | Jakub | UI | `POST /api/mandates/compile` |
| Monitoring i replay | Jakub | UI | `POST /api/runs`, `GET /api/runs/:id/events` |
| Decyzje i trust receipt | Jakub | UI | zdarzenia run oraz `GET /api/receipts/:id` |
| Widoki i stany interakcji | frontend owner | użytkownik | `apps/web` |
| Fixture adapter UI | frontend owner | UI | `apps/web/src/data` |

## `ui-api-v1`

- Właściciel: Jakub.
- Konsument: frontend owner/UI.
- Status: `v1 FROZEN` od **2026-07-11**; zmiany tylko według protokołu poniżej.
- Transport: JSON po HTTP; monitoring przez polling `GET /api/runs/:id/events?after=<sequence>`.
- Timeout UI: 10 s dla komend; po timeout UI pokazuje retry z tym samym `idempotencyKey`.
- Kompatybilność: wolno dodawać pola opcjonalne; nie wolno zmieniać znaczenia, usuwać pól ani kodów
  powodów bez uzgodnienia z konsumentem.

### Kompilacja mandatu

```json
POST /api/mandates/compile
{
  "brief": "Nike Dunk Low, rozmiar 43, nowe, maksymalnie 80 EUR z dostawą",
  "baseCurrency": "EUR",
  "destinationCountry": "PL"
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
    "sellerPolicy": { "allowResellers": false },
    "autonomy": "AUTO_BUY_IF_LOW_STOCK",
    "status": "DRAFT"
  },
  "ambiguities": [],
  "compiler": "fixture"
}
```

Błąd walidacji:

```json
422 Unprocessable Entity
{
  "mandate": { "id": "m_02", "version": 1, "status": "DRAFT" },
  "ambiguities": [
    { "field": "product.size", "code": "REQUIRED", "question": "Jaki rozmiar ma mieć produkt?" }
  ],
  "compiler": "openai",
  "error": {
    "code": "AMBIGUOUS_MANDATE",
    "message": "Uzupełnij brakujące warunki mandatu.",
    "fieldErrors": [{ "field": "product.size", "code": "REQUIRED" }]
  }
}
```

### Zatwierdzenie i uruchomienie

```json
POST /api/mandates/m_01/approve
{ "expectedVersion": 1, "idempotencyKey": "approve-demo-01" }
```

Cofnięcie zgody podbija wersję mandatu i blokuje późniejszy checkout:

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

Polling zwraca wyłącznie zdarzenia o sekwencji większej niż `after`:

```json
GET /api/runs/run_01/events?after=0
{
  "runId": "run_01",
  "status": "COMPLETED",
  "events": [],
  "nextCursor": "8"
}
```

### Zdarzenie decyzji

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
    "explanation": "Oferta spełnia wszystkie zatwierdzone warunki."
  }
}
```

Dozwolone akcje: `IGNORE`, `ALERT`, `ASK_USER`, `AUTO_BUY`. Nieznany `type` zdarzenia UI ignoruje
i zapisuje diagnostycznie; nieznana akcja decyzji jest błędem kontraktu i blokuje checkout UI.

### Testowy checkout

```json
POST /api/decisions/d_03/checkout
{ "mandateVersion": 1, "offerVersion": 2, "idempotencyKey": "checkout-d_03" }
```

Sukces:

```json
200 OK
{
  "status": "COMPLETED",
  "purchaseId": "p_01",
  "receiptId": "r_01",
  "idempotentReplay": false
}
```

Blokada po zmianie ceny lub zgody:

```json
409 Conflict
{
  "error": {
    "code": "REVALIDATION_FAILED",
    "message": "Oferta zmieniła się przed finalizacją.",
    "reasonCodes": ["PRICE_CHANGED", "TOTAL_CAP_EXCEEDED"]
  }
}
```

Retry z tym samym kluczem zwraca ten sam `purchaseId` i `idempotentReplay: true`.

### Kontrolowana mutacja demo

Mutacja jest lokalnym narzędziem demonstracyjnym, a nie produkcyjnym endpointem sklepu:

```json
POST /api/runs/run_01/mutations
{ "type": "PRICE_CHANGED", "offerId": "offer-nl-winner", "amountMinor": 7900 }
```

Odpowiedź zawiera ofertę z podbitą wersją oraz nowy kursor. Checkout utworzony na poprzedniej
wersji zwraca `409 REVALIDATION_FAILED` z `OFFER_VERSION_CHANGED`, `PRICE_CHANGED` i — jeśli pełny
koszt przekroczył limit — `TOTAL_CAP_EXCEEDED`.

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

## Dane współdzielone

| Nazwa | Źródło prawdy | Właściciel | Reset / seed |
| --- | --- | --- | --- |
| Golden path | `fixtures/scenarios/golden-path.json` | Jakub | docelowo `npm run demo:reset` |
| Pułapka walutowa | `fixtures/scenarios/uk-currency-trap.json` | Jakub | ten sam reset |
| Fałszywy rabat | `fixtures/scenarios/fake-discount.json` | Jakub | ten sam reset |
| UI offline fixture | wygenerowane z powyższych kontraktów | frontend owner | docelowo `npm run web:fixtures` |

## Zmiana kontraktu

1. Właściciel opisuje różnicę i wskazuje konsumentów.
2. Konsument potwierdza zmianę albo prosi o adapter kompatybilności.
3. Integration captain oznacza kontrakt `CHANGING` i dodaje broadcast.
4. Zmiana oraz adapter trafiają w jednej fali integracyjnej.
5. Po contract smoke status wraca do `FROZEN`.
