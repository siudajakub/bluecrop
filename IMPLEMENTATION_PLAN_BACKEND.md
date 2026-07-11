# Deal Hunter — plan implementacji backendu

## Docelowa struktura

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

## Wave 1 — uruchamialny kontrakt

1. Utworzyć root `package.json`, workspaces, wspólny `tsconfig` i skrypty `dev/check/test/build`.
2. Utworzyć schematy Zod: `Money`, `Mandate`, `OfferEvent`, `Decision`, `ErrorEnvelope`, `Receipt`.
3. Dodać Fastify, CORS dla lokalnego Next.js i `GET /health`.
4. Zaimplementować `FixtureMandateCompiler` oraz endpoint compile/approve.
5. Dodać in-memory store i stały zegar/scenario seed.

**Done:** curl tworzy i zatwierdza mandat bez OpenAI, a kontrakt można przekazać frontendowi.

## Wave 2 — pion decyzyjny

1. Zaimplementować czyste funkcje: przeliczenie waluty, wysyłka/opłaty, pełny koszt.
2. Zaimplementować exact-variant matching i minimalne risk flags.
3. Zaimplementować policy engine z priorytetem twardych blokad przed alertem/autonomią.
4. Załadować trzy scenariusze i emitować zdarzenia według `sequence`.
5. Dodać `POST /api/runs` i polling `GET /api/runs/:id/events?after=`.

**Done:** seed `20260711` zawsze daje walutową pułapkę, fałszywy rabat i poprawną ofertę.

## Wave 3 — bezpieczna akcja

1. Dodać rewalidację mandatu, oferty, kosztu, stocku i zgody.
2. Zapisać wynik pierwszej mutacji pod `idempotencyKey` przed zwróceniem odpowiedzi.
3. Dodać kontrolowane zdarzenie `PRICE_CHANGED` do wariantu blokującego.
4. Generować immutable receipt z wejściami, wersjami, decyzją i powodami.
5. Dodać endpoint checkout oraz pobieranie receipt.

**Done:** zmiana blokuje zakup, a dwa retry zwracają ten sam purchase i receipt.

## Wave 4 — prawdziwy OpenAI

1. Dodać SDK `openai` i `OpenAIMandateCompiler` za wspólnym interfejsem.
2. Użyć Responses API oraz Structured Outputs z tym samym schematem Zod co kontrakty.
3. Prompt ograniczyć do ekstrakcji intencji i niejednoznaczności; bez kalkulacji ani decyzji.
4. Obsłużyć refusal, timeout i błąd usługi jako domenowy error envelope.
5. Dodać `.env.example`; prawdziwy klucz wprowadzić lokalnie dopiero podczas integracji.

**Done:** ten sam brief przechodzi zarówno przez OpenAI, jak i fixture compiler, zwracając ten sam
typ odpowiedzi.

## Wave 5 — weryfikacja i demo

1. Unit: money, total cost, matcher, policy precedence i revalidation.
2. Contract: każdy fixture przechodzi schemat Zod.
3. Integration: compile → approve → run → poll → checkout → receipt.
4. Invariants: brak przekroczeń limitu i brak podwójnych zakupów.
5. Dodać `npm run demo:reset` oraz jeden smoke script dla pełnego golden path.

## Kolejność cięć

1. Usunąć opóźnienia czasowe replay; zachować kolejność zdarzeń.
2. Pokazać evale w terminalu zamiast endpointu/panelu.
3. Ograniczyć semantic matching do exact SKU + rozmiaru.
4. Ograniczyć AI do jednego briefu demonstracyjnego.
5. Zmienić `AUTO_BUY` na `ASK_USER`, jeśli niezmienniki checkoutu nie przechodzą.

Nie wycinać: pełnego kosztu, zatwierdzonej wersji mandatu, rewalidacji, idempotencji ani receipt.
