# Deal Hunter — plan pracy zespołu

## Parametry sprintu

- Deadline: **2026-07-11 18:00 CEST**.
- Dostępny czas: około 5 godzin.
- Frontend: Next.js + TypeScript.
- Backend: Node.js + TypeScript; rekomendowany Fastify dla małego, jawnego API.
- Organizacja: npm workspaces z `apps/web`, `apps/api` i `packages/contracts`.
- Priorytet: działający golden path i niezawodna prezentacja, nie szerokość produktu.

## Podział odpowiedzialności

### Jakub — aplikacja poza UI

- wybór stacku i szkielet workspace;
- kontrakty domenowe i walidacja danych;
- API, persistence i orkiestracja OpenAI;
- replay engine oraz realistyczne fixtures;
- matching, koszt końcowy, ryzyko i policy engine;
- rewalidacja, testowy checkout i idempotencja;
- audit log, trust receipt, evale i komendy resetu;
- wdrożenie API oraz tryb offline.

### Osobny frontend owner — UI

- kierunek wizualny i system komponentów;
- brief oraz edytowalny przegląd mandatu;
- monitoring, oś czasu i widoki decyzji;
- koszt końcowy, reason codes i ryzyko przedstawione bez ukrywania dowodów;
- stany loading, empty, error, retry i offline fixture;
- ekran rewalidacji, blokady oraz trust receipt;
- responsywność, dostępność i testy głównego przepływu UI;
- integracja wyłącznie przez `ui-api-v1`, bez kopiowania reguł domenowych.

### Wspólne

- zamrożenie kontraktu i przykładowych payloadów;
- pierwszy pion end-to-end;
- contract smoke i obsługa błędów;
- próby demo, cięcia zakresu i ostateczny build.

## 13:00–13:30 — kontrakt i szkielet

Jakub tworzy npm workspace, `apps/api` i `packages/contracts`. Frontend owner tworzy `apps/web` w Next.js.
Zatwierdzamy nazwy stanów, request/response, kody błędów i trzy fixtures. Status `ui-api-v1`
zmieniamy z `PROPOSED` na `FROZEN`. Potem pracujemy równolegle.

Warunek wyjścia: przykładowe payloady walidują się, UI może działać na fixture adapterze, a backend
może implementować ten sam kontrakt niezależnie.

## 13:30–15:00 — cienki pion end-to-end

- Jakub: jeden zapisany mandat, jeden scenariusz, jedna decyzja i prosty receipt przez API.
- Frontend owner: brief → mandat → uruchomienie → jedna karta decyzji na fixture adapterze.
- Wspólnie: przełączenie adaptera UI z fixture na API bez zmiany komponentów.

Warunek wyjścia: jedna kompletna ścieżka działa end-to-end. Nie dokładamy kolejnych ekranów ani
reguł, dopóki ten pion nie przejdzie contract smoke.

## 15:00–16:00 — trzy scenariusze i pełny koszt

- Jakub: replay, pełny koszt, matching, risk signals i cztery decyzje.
- Frontend owner: oś czasu, trzy scenariusze, reason codes, stany błędów i przejrzyste wyjaśnienia.
- Integracja najpóźniej o 15:30 i 16:00 na `hack/integration`, po jednej lane naraz.

Warunek wyjścia: pułapka walutowa, fałszywy rabat i poprawna oferta z NL dają oczekiwane decyzje
zarówno w testach, jak i w UI.

## 16:00–16:30 — checkout i bezpieczeństwo

- Jakub: rewalidacja, cofnięta zgoda, zmiana ceny, klucz idempotencji, audit receipt i evale.
- Frontend owner: czytelna blokada, retry tym samym kluczem, receipt i panel najważniejszych metryk.
- Wspólnie: test podwójnego kliknięcia, timeoutu i ponowienia po odświeżeniu.

Warunek wyjścia: testy limitu i idempotencji przechodzą, a każde odrzucenie ma kod powodu i dowód
widoczny w UI. O 16:30 następuje bezwzględny feature freeze.

## 16:30–17:20 — integracja i demo hardening

- zamrozić funkcje i ciąć wszystko poza golden path;
- uruchomić pełne testy na dokładnym kandydacie demo;
- przeprowadzić dwie próby z resetem od zera;
- sprawdzić tryb bez OpenAI i bez hostingu;
- oznaczyć commit/tag, nagrać backup i nie aktualizować zależności po freeze.

## 17:20–18:00 — submission buffer

- nie zmieniać funkcji ani zależności;
- poprawiać wyłącznie błędy blokujące uruchomienie lub prezentację;
- przygotować opis, linki, screenshoty/nagranie i finalny submission;
- o 17:45 zakończyć zmiany w kodzie, chyba że aplikacja w ogóle się nie uruchamia.

## Kolejność integracji

1. Kontrakty i fixtures.
2. Cienki API + cienki UI.
3. Replay i trzy decyzje.
4. Checkout, rewalidacja i receipt.
5. Evale, polish i demo fallback.

## Zasady współpracy

- Jakub nie edytuje `apps/web/**`; frontend owner nie edytuje domeny, policy engine ani checkoutu.
- `packages/contracts/**` ma jednego właściciela: Jakuba. Frontend owner proponuje zmiany przez przykład i
  opis zachowania konsumenta.
- UI zawsze ma fixture adapter zgodny z kontraktem, więc żadna strona nie czeka na gotowy backend.
- Zmiana kontraktu wymaga adaptera kompatybilności albo wspólnej fali integracyjnej.
- Po 15 minutach blokady właściciel zapisuje fallback i zgłasza ją integration captainowi.
- Scraper, prawdziwe płatności i druga kategoria nie wchodzą do MVP.
- Rozbudowany panel evali wypada z głównego UI; wystarczą 3–5 kluczowych wyników w receipt albo
  widoku końcowym.

## Pierwsze konkretne kroki

1. Jakub wybiera stack i tworzy manifest workspace oraz `packages/contracts`.
2. Jakub przenosi przykłady z `docs/hackathon/contracts.md` do walidowanych schematów.
3. Frontend owner przygotowuje frontendowy adapter i UI na tych przykładach.
4. Jakub implementuje `golden-path.json` oraz endpointy compile/run/events/checkout.
5. Łączymy cienki pion, zamrażamy kontrakt i dopiero potem poszerzamy mechanikę.
