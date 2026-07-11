# Deal Hunter — karta hackathonu

Ten plik jest krótkim źródłem prawdy o zakresie dema. Właściciel integracji aktualizuje go na
`hack/integration`; lane'y funkcjonalne tylko go konsumują.

## Misja

- Problem: porównywarki pokazują cenę ofertową, ale nie podejmują bezpiecznej decyzji na podstawie
  pełnego kosztu, wariantu, ryzyka i zgody użytkownika.
- User: osoba szukająca konkretnego produktu, która zna maksymalny koszt i może poczekać na
  właściwą ofertę.
- Promise: agent obserwuje zmiany ofert i działa samodzielnie, ale nigdy nie przekracza jawnego,
  zatwierdzonego mandatu.
- Judging bias: audytowalna agentowość i bezpieczeństwo decyzji, nie liczba integracji.
- Termin: **2026-07-11 18:00 CEST**; pięciogodzinny sprint od około 13:00 CEST.

## Golden path

1. Użytkownik opisuje produkt, wariant, limit kosztu i zakres autonomii.
2. AI tworzy edytowalny mandat; użytkownik go zatwierdza.
3. Replay engine emituje trzy realistyczne zdarzenia ofertowe.
4. Silnik odrzuca pułapkę walutową i fałszywy rabat, a poprawną ofertę kwalifikuje do zakupu.
5. Rewalidacja blokuje zmienioną ofertę albo wykonuje dokładnie jeden zakup i pokazuje trust receipt.

## Próg akceptacji

- Musi działać: brief → mandat → replay → decyzje → testowy checkout → trust receipt.
- Może być mockowane: sprzedawcy, kursy walut, dostawa, cła, kupony, stan magazynowy i płatność.
- Musi być prawdziwe: parsowanie mandatu przez AI, kalkulacja kosztu, policy engine, rewalidacja,
  idempotencja, audit log i odtwarzalne evale.
- Wycięte: scraping na żywo, prawdziwe płatności, multi-user, globalne podatki, zwroty, aplikacja
  mobilna i mikroserwisy.

## Role i własność

- Właściciel aplikacji/backendu: Jakub — domena, API, AI, replay, dane, evale i checkout.
- Właściciel UI: osobny członek zespołu — frontend, stany interfejsu i integracja przez zamrożony
  kontrakt; imię do wpisania na boardzie.
- Integration captain: Jakub, chyba że zespół wskaże inną osobę.
- Gałąź demo-safe: `main`.
- Gałąź integracyjna: `hack/integration`.
- Prezenter i osoba zapasowa: do ustalenia przed pierwszą próbą demo.

## Kolejność bramek

| Bramka | Moment | Warunek wyjścia |
| --- | --- | --- |
| Zamrożenie kontraktów | 2026-07-11 13:30 CEST | Schematy i przykładowe odpowiedzi zaakceptowane |
| Pierwsza integracja | 2026-07-11 15:00 CEST | UI pokazuje jedną decyzję z fixture przez ten sam adapter co API |
| Feature freeze | 2026-07-11 16:30 CEST | Pełny golden path działa; dalej tylko naprawy i demo copy |
| Demo freeze | 2026-07-11 17:20 CEST | Dwie próby, dokładny commit, seed, reset i backup zapisane |
| Submission | 2026-07-11 18:00 CEST | Repo, link, opis i materiały wysłane |

## Budżet awarii i cięcia

| Ryzyko | Sygnał | Fallback / właściciel |
| --- | --- | --- |
| OpenAI niedostępne | timeout albo quota | zapisany mandat fixture; Jakub |
| API niedostępne w UI | healthcheck nie odpowiada | lokalny adapter fixture o identycznym kontrakcie; frontend owner |
| Niepewny AUTO_BUY | test false-buy nie przechodzi | zakończyć na `ASK_USER`; Jakub |
| Lane nie jest gotowy na freeze | brak stanu READY | wyłączyć flagą lub usunąć z trasy demo; właściciel lane'u |
| Demo online nie działa | błąd hostingu | lokalny build i nagranie golden path; integration captain |

## Źródła projektu

- [Podsumowanie pomysłu](PODSUMOWANIE_POMYSLU.md)
- [Plan implementacji](plan_implementacji.md)
- [Backlog domenowy](zadania.md)
- [PRD MVP](docs/prds/deal-hunter-mvp-v1.0-prd.md)
- [Plan implementacji backendu](IMPLEMENTATION_PLAN_BACKEND.md)
- [Kontrakty UI–backend](docs/hackathon/contracts.md)
- [Team board](TEAM_BOARD.md)
