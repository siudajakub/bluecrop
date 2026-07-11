# Deal Hunter MVP — Product Requirements Document

## Opis wymagań

### Kontekst

- **Problem:** cena widoczna w sklepie nie uwzględnia pełnego kosztu, wariantu, ryzyka, zgody ani
  aktualności oferty.
- **Użytkownik:** osoba szukająca dokładnego produktu, która definiuje limit i dopuszczalny poziom
  autonomii.
- **Wartość:** agent obserwuje zdarzenia ofertowe i może działać samodzielnie, ale deterministyczny
  kod nigdy nie pozwala przekroczyć zatwierdzonego mandatu.
- **Deadline:** 2026-07-11 18:00 CEST; demo lokalne.

### Zakres funkcjonalny

1. Brief w języku naturalnym jest kompilowany przez OpenAI Responses API do jawnego mandatu.
2. Użytkownik zatwierdza mandat przed uruchomieniem monitoringu.
3. Deterministyczny replay emituje trzy scenariusze ofertowe.
4. Silnik oblicza pełny koszt i wybiera `IGNORE`, `ALERT`, `ASK_USER` albo `AUTO_BUY`.
5. Testowy checkout ponownie sprawdza mandat i ofertę oraz jest idempotentny.
6. System zwraca audit trail i trust receipt z kodami powodów.

### Poza zakresem

- scraping, prawdziwe sklepy i płatności;
- baza danych, logowanie i wielu użytkowników;
- SSE/WebSocket — frontend odpytuje endpoint zdarzeń;
- globalne podatki, zwroty i druga kategoria produktu;
- publiczny deployment jako warunek ukończenia.

## Przepływ użytkownika

1. Użytkownik wpisuje brief i klika „Utwórz mandat”.
2. System zwraca `DRAFT` albo jawne niejednoznaczności.
3. Użytkownik zatwierdza wersję mandatu.
4. System uruchamia scenariusz `golden-path` z ustalonym seedem.
5. UI odpytuje zdarzenia i prezentuje koszt, decyzję oraz dowody.
6. Dla poprawnej oferty system próbuje checkoutu.
7. Zmiana ceny blokuje pierwszy wariant; po resecie retry tworzy dokładnie jeden zakup.
8. Użytkownik widzi trust receipt.

## Decyzje techniczne

### Architektura

- npm workspaces: `apps/api`, `apps/web`, `packages/contracts`, `packages/domain`,
  `packages/checkout`, `fixtures`, `tests`;
- Node.js + TypeScript; pojedynczy proces API, rekomendowany Fastify;
- Next.js należy do osobnego frontend ownera;
- stan procesu, mandaty, runy, zdarzenia i zakupy przechowywane w pamięci;
- fixtures w wersjonowanych plikach JSON;
- jeden schemat Zod jest źródłem typów, walidacji i Structured Outputs.

### OpenAI

- oficjalny SDK `openai` wyłącznie w `apps/api`;
- Responses API z Structured Outputs do `MandateDraft`;
- `OPENAI_API_KEY` dodawany dopiero przy integracji, wyłącznie przez lokalny `.env`;
- `OPENAI_MODEL` jest konfigurowalny i testowany na modelu dostępnym dla konta;
- `MANDATE_COMPILER_MODE=fixture` zwraca ten sam kontrakt bez sieci;
- refusal, timeout, błąd SDK i wynik semantycznie niepełny mapują się na jawny błąd domenowy;
- model nie liczy kosztu i nie autoryzuje checkoutu.

### Dane i bezpieczeństwo

- pieniądze jako `amountMinor` + trzyliterowy kod waluty;
- wszystkie mutacje przyjmują `idempotencyKey`;
- checkout wymaga oczekiwanej wersji mandatu i oferty;
- sekret nie może trafić do Next.js, logów, fixtures ani repozytorium;
- replay z tym samym seedem tworzy tę samą sekwencję decyzji.

## Obsługa błędów

| Sytuacja | Odpowiedź | Zachowanie klienta |
| --- | --- | --- |
| Brief niekompletny | 422 `AMBIGUOUS_MANDATE` | pokazuje pola do uzupełnienia |
| OpenAI niedostępne | 503 `MANDATE_COMPILER_UNAVAILABLE` | retry albo tryb fixture |
| Nieaktualna wersja | 409 `VERSION_CONFLICT` | pobiera aktualny stan |
| Cena/zgoda zmieniona | 409 `REVALIDATION_FAILED` | blokuje zakup i pokazuje powody |
| Powtórzony klucz | 200 z poprzednim wynikiem | nie tworzy drugiej operacji |
| Nieznany run | 404 `RUN_NOT_FOUND` | wraca do stanu początkowego |

## Kryteria akceptacji

### Funkcjonalne

- [ ] Prawdziwy Responses API zwraca mandat zgodny ze schematem.
- [ ] Tryb fixture zwraca identyczny kontrakt bez klucza i sieci.
- [ ] Trzy scenariusze dają oczekiwane decyzje przy seedzie `20260711`.
- [ ] Pełny koszt jest liczony wyłącznie przez kod domenowy.
- [ ] Zmiana ceny lub cofnięta zgoda blokuje checkout.
- [ ] Dwa requesty z tym samym kluczem tworzą jeden `purchaseId`.
- [ ] Receipt zawiera wersje, koszt, kody powodów i klucz idempotencji.

### Jakościowe

- [ ] `npm run check`, `npm run test` i `npm run build` przechodzą.
- [ ] 10–15 przypadków obejmuje limit, wariant, resellerów, fałszywy rabat, zgodę i duplikaty.
- [ ] `hard_cap_violations = 0` oraz `duplicate_buys = 0`.
- [ ] Reset i start lokalnego demo zajmują mniej niż minutę.
- [ ] Repozytorium i logi nie zawierają klucza API.

## Ryzyka i cięcia

| Ryzyko | Ograniczenie | Cięcie po przekroczeniu czasu |
| --- | --- | --- |
| Brak klucza/modelu | adapter fixture, model przez env | demo na zapisanym mandacie |
| Integracja UI się opóźnia | frozen payloads i polling | backend demo przez curl/HTTP client |
| AUTO_BUY nie przechodzi testów | rewalidacja i testy niezmienników | zakończyć na `ASK_USER` |
| Za dużo logiki matchingu | exact SKU/size + prosty semantic score | tylko exact variant |
| Brak czasu na panel evali | metryki w receipt/JSON | wyniki pokazane w terminalu |

## Fazy wykonania

1. **Kontrakty i szkielet — 30 min:** workspace, Zod, error envelope, healthcheck.
2. **Cienki pion — 60 min:** fixture compiler, approve, run, polling, jedna decyzja.
3. **Domena — 60 min:** pieniądze, pełny koszt, matching, policy engine, trzy scenariusze.
4. **Checkout — 30 min:** rewalidacja, idempotencja, receipt.
5. **OpenAI — 30 min:** Responses API, Structured Outputs, refusal/timeout, env.
6. **Testy i demo — 60 min:** evale, reset, pełny smoke, dwa przebiegi.
7. **Bufor submission — 30 min:** dokumentacja, backup i wyłącznie poprawki blokujące.

---

**Wersja:** 1.0  
**Utworzono:** 2026-07-11  
**Rundy doprecyzowania:** 2  
**Wynik jakości wymagań:** 93/100
