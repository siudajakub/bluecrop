# Plan implementacji: Deal Hunter

> **Aktualizacja 2026-07-11:** deadline wynosi 18:00 CEST, a dostępny czas to około pięć godzin.
> Nadrzędny harmonogram, podział Next.js/Node.js oraz godziny freeze znajdują się w
> [PLAN_ZESPOLU_HACKATHON.md](PLAN_ZESPOLU_HACKATHON.md). Poniższy dokument pozostaje opisem
> kolejności technicznej, ale jego pierwotny harmonogram 36-godzinny nie obowiązuje.

## Zalecenie techniczne

Zbudować modularny monolit w TypeScript. Model interpretuje intencję i proponuje działania za pomocą typowanych narzędzi. Kod deterministyczny oblicza koszty, egzekwuje ograniczenia i zatwierdza działania. Sprzedawcy, ceny, kursy walut i checkout korzystają z odtwarzalnych danych testowych.

## Zalecany podział zespołu

- Product/UX i frontend: brief, mandat, oś czasu, trust receipt i scenariusz prezentacji.
- Agent i backend: Responses API, narzędzia oraz orkiestracja.
- Domena i bezpieczeństwo: koszt końcowy, polityki, maszyna stanów i idempotencja.
- Evale i demonstracja: symulator, dane testowe, scenariusze red-team i metryki.

W trzyosobowym zespole połączcie role agent/backend oraz domena/bezpieczeństwo. Za evale powinien odpowiadać cały zespół.

## Etap 1: kontrakty i szkielet

1. Ustalić schematy domenowe i niezmienniki bezpieczeństwa.
2. Zbudować minimalny przepływ UI: brief → przegląd mandatu → monitoring.
3. Zaimplementować zapis stanu i osi czasu zdarzeń.
4. Połączyć kompilację mandatu ze Structured Outputs.

Kryterium ukończenia: dowolny brief tworzy poprawny, widoczny i wersjonowany mandat.

## Etap 2: silnik decyzji

1. Zaimplementować symulator z seedem i możliwością odtworzenia przebiegu.
2. Normalizować oferty i sprawdzać dokładny wariant.
3. Obliczać koszt końcowy za pomocą deterministycznego źródła referencyjnego.
4. Oceniać ryzyko i uruchamiać silnik polityk.
5. Zapisywać każdy etap jako ustrukturyzowany dowód.

Kryterium ukończenia: każde zdarzenie kończy się powtarzalną decyzją `IGNORE`, `ALERT`, `ASK_USER` albo `AUTO_BUY`.

## Etap 3: bezpieczny checkout

1. Zbudować testowy checkout z kluczem idempotencji.
2. Ponownie sprawdzać cenę, dostępność, wariant i zgodę.
3. Blokować istotne zmiany i prosić o ponowne zatwierdzenie.
4. Generować niezmienny trust receipt.

Kryterium ukończenia: ponowienia nie dublują zakupów, a cofnięcie zgody lub przekroczenie limitu blokuje transakcję.

## Etap 4: evale i demonstracja

1. Przygotować 10–15 oznaczonych przypadków skupionych na limicie, wariancie, zgodzie i duplikatach.
2. Uruchomić testy niezmienników oraz metryki użyteczności i bezpieczeństwa.
3. Dodać panel wyników i możliwość odtwarzania błędów.
4. Przećwiczyć prezentację trwającą 2–3 minuty.
5. Zamrozić stabilny build i lokalny zestaw danych awaryjnych.

Kryterium ukończenia: demonstracja działa powtarzalnie bez kruchych zależności, pokazuje metryki i nie narusza limitów ani idempotencji.

## Archiwalny harmonogram pełnego wariantu

Ten wariant nie obowiązuje w pięciogodzinnym sprincie; zachowujemy go wyłącznie jako plan
rozwinięcia projektu po hackathonie.

- 0–3 h: kontrakty danych, UX i szkielet.
- 3–10 h: symulator, koszt końcowy i silnik polityk.
- 10–16 h: integracja OpenAI, matching i wyjaśnienia.
- 16–22 h: checkout, ponowna walidacja, audyt i idempotencja.
- 22–30 h: zestaw ewaluacyjny, testy, red-team i panel wyników.
- 30–36 h: dopracowanie interfejsu, próba prezentacji, wariant awaryjny i poprawki.

## Kryteria kontynuacji

- Dodawajcie integracje opcjonalne dopiero wtedy, gdy działa pełny przepływ na danych testowych.
- Wstrzymajcie dodatki, dopóki nie działają testy limitu, zgody i idempotencji.
- Pomińcie scraping i prawdziwe płatności, jeśli zagrażają powtarzalności demonstracji.
- Dodajcie drugą kategorię dopiero po zamknięciu evali i głównego scenariusza.
