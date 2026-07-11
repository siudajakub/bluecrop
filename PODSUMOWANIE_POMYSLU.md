# Deal Hunter — podsumowanie pomysłu do decyzji

## Status

**Koncepcja robocza. Nie rozpoczynamy implementacji przed wspólnym przeglądem i zatwierdzeniem zakresu.**

## Pomysł w jednym zdaniu

Deal Hunter to agent zakupowy, który przyjmuje od użytkownika produkt, warunki i limit wydatku, obserwuje zmiany ofert, oblicza pełny koszt i kupuje albo prosi o zgodę dopiero wtedy, gdy wszystkie warunki są spełnione.

## Problem

Obecne porównywarki i alerty cenowe obserwują głównie cenę widoczną na stronie. Nie uwzględniają wiarygodnie:

- kosztu dostawy;
- kursu waluty;
- ceł i dodatkowych opłat;
- ważności kuponu;
- właściwego wariantu produktu;
- dostępności i wiarygodności sprzedawcy;
- prawdziwości deklarowanej obniżki.

Użytkownik dostaje wiele alertów, ale nadal musi sam sprawdzić ofertę i zdążyć z zakupem. Deal Hunter ma wykonać tę pracę w tle, zachowując ustalone granice.

## Dla kogo

Pierwszy scenariusz kierujemy do osoby, która:

- szuka konkretnego produktu lub wariantu;
- zna maksymalny koszt z dostawą;
- może czekać na dobrą ofertę;
- chce ograniczyć liczbę powiadomień;
- dopuszcza automatyczny zakup tylko w jasno określonych warunkach.

## Przykład

Użytkownik wpisuje:

> Nike Dunk Low, rozmiar 43, nowe, bez resellerów, maksymalnie 80 EUR z dostawą. Jeśli stan magazynowy jest niski i wszystkie warunki są spełnione, możesz kupić automatycznie.

System zamienia tę wiadomość w jawny mandat:

- produkt: Nike Dunk Low;
- rozmiar: 43;
- stan: nowy;
- resellerzy: niedozwoleni;
- maksymalny koszt końcowy: 80 EUR;
- automatyczny zakup: dozwolony przy niskim stanie magazynowym;
- niepewność lub brak danych: zapytaj użytkownika.

Użytkownik sprawdza i zatwierdza interpretację przed rozpoczęciem monitorowania.

## Główna wartość

Produkt nie ma tylko znaleźć najniższej ceny. Ma podjąć poprawną i audytowalną decyzję w granicach użytkownika.

Najważniejsza obietnica brzmi:

> Agent może działać samodzielnie, ale nie może przekroczyć mandatu.

## Jak działa

1. Użytkownik opisuje produkt, warunki, limit i zakres autonomii.
2. Model zamienia opis w ustrukturyzowany mandat i wskazuje niejednoznaczności.
3. Użytkownik zatwierdza lub poprawia mandat.
4. Symulator dostarcza zmieniające się oferty różnych sprzedawców.
5. System dopasowuje produkt i dokładny wariant.
6. Kod oblicza pełny koszt końcowy.
7. System sprawdza ryzyko, dostępność, rabat i ograniczenia mandatu.
8. Silnik polityk wybiera jedną decyzję:
   - `IGNORE` — oferta nie spełnia warunków;
   - `ALERT` — warto poinformować użytkownika;
   - `ASK_USER` — potrzebna jest decyzja lub dodatkowa zgoda;
   - `AUTO_BUY` — system może wykonać zakup testowy.
9. Przed zakupem system ponownie sprawdza cenę, produkt, stan magazynowy i aktualność zgody.
10. System zapisuje decyzję, obliczenia i użyty mandat w trust receipt.

## Co jest tutaj agentowe

- Agent realizuje zadanie przez dłuższy czas, zamiast odpowiadać na pojedynczy prompt.
- Reaguje na nowe zdarzenia bez obecności użytkownika w aktywnej karcie.
- Korzysta z narzędzi do pobierania, normalizowania i oceniania ofert.
- Rozpoznaje niejednoznaczność i eskaluje ją do człowieka.
- Podejmuje akcję tylko w dozwolonym zakresie.
- Potrafi wyjaśnić, dlaczego ofertę przyjął albo odrzucił.

## Rola AI i zwykłego kodu

### Model AI

- interpretuje naturalny język;
- wykrywa niejednoznaczne warunki;
- normalizuje różne nazwy tego samego produktu;
- ocenia semantyczne dopasowanie ofert;
- tworzy zrozumiałe wyjaśnienie decyzji.

### Kod deterministyczny

- oblicza cenę, dostawę, kursy i opłaty;
- sprawdza twardy limit wydatku;
- egzekwuje zakres zgody;
- ponownie sprawdza ofertę przed zakupem;
- zapobiega podwójnemu zakupowi;
- zapisuje audyt i oblicza metryki.

**Zasada bezpieczeństwa: model proponuje, a kod autoryzuje.**

## Zakres MVP

### W zakresie

- jedna główna kategoria produktów;
- jeden kraj dostawy i waluta bazowa;
- 3–5 symulowanych sprzedawców;
- naturalny brief i edytowalny mandat;
- symulowane zdarzenia cenowe;
- dopasowanie produktu i wariantu;
- kalkulator kosztu końcowego;
- wykrywanie kilku typów ryzyka;
- cztery rodzaje decyzji;
- testowy checkout;
- ponowna walidacja i idempotencja;
- trust receipt;
- panel wyników na przygotowanych przypadkach testowych.

### Poza zakresem

- scraping prawdziwych sklepów;
- prawdziwe pieniądze i płatności;
- pełna obsługa podatków i ceł na świecie;
- wielu użytkowników;
- rozbudowany marketplace;
- zwroty i obsługa posprzedażowa;
- aplikacja mobilna;
- architektura mikroserwisowa.

## Proponowana demonstracja

Demonstracja powinna trwać 2–3 minuty i pokazać trzy oferty:

1. Oferta z Wielkiej Brytanii wygląda tanio, ale po doliczeniu kursu, wysyłki i opłat przekracza limit. System ją odrzuca.
2. Druga oferta deklaruje duży rabat, lecz historia ceny ujawnia sztuczną obniżkę. System nie wysyła alertu.
3. Oferta z Holandii spełnia warunki, mieści się w limicie i ma niski stan magazynowy. System przygotowuje zakup.

Przed finalizacją wstrzykujemy zmianę ceny albo cofamy zgodę. System blokuje transakcję. Następnie odtwarzamy wariant bez zmiany i pokazujemy jeden zakup mimo ponowienia żądania.

Na końcu juror widzi:

- pełny koszt;
- spełnione i odrzucone warunki;
- wersję mandatu;
- powód decyzji;
- klucz idempotencji;
- wyniki testów bezpieczeństwa.

## Jak mierzymy sukces

Najważniejsze metryki:

- `false_buy_rate = 0`;
- `hard_cap_violations = 0`;
- `duplicate_buys = 0`;
- poprawność dopasowania wariantu;
- precyzja wybranych okazji;
- liczba pominiętych dobrych ofert;
- poprawność eskalowania niejednoznaczności;
- powtarzalność decyzji po odtworzeniu zdarzeń;
- kompletność trust receipt.

## Wstępna architektura

Rekomendujemy modularny monolit w TypeScript:

```text
Web UI
  → API i orkiestrator
      → kompilator mandatu
      → symulator zdarzeń
      → normalizator i matcher ofert
      → kalkulator kosztu końcowego
      → weryfikator ryzyka
      → silnik zgody i polityk
      → testowy checkout
      → audyt i evale
  → SQLite lub PostgreSQL
  → OpenAI Responses API
```

Nie planujemy mikroserwisów ani runtime’u multi-agent w weekendowym MVP.

## Największe ryzyka

| Ryzyko | Skutek | Ograniczenie |
|---|---|---|
| Projekt wygląda jak kolejny chatbot zakupowy | Niska oryginalność | Pokazać działanie w czasie, politykę i audyt, nie rozmowę |
| Symulator wygląda jak animacja | Niska wiarygodność | Seed, replay, jawne dane wejściowe i evale |
| Model pełni zbyt małą rolę | Pytanie „po co OpenAI?” | Użyć AI do intencji, niejednoznaczności i matching’u |
| Model decyduje o pieniądzach | Brak zaufania | Autoryzację zostawić deterministycznemu kodowi |
| Jeden produkt ogranicza generalizację | Demo wygląda jak tracker sneakersów | Pokazać drugi adapter lub drugi typ produktu |
| Za szeroki zakres | Niedokończony przepływ | Zamknąć pełny pion przed dodawaniem funkcji |

## Decyzje wymagające wspólnego zatwierdzenia

1. Czy wybieramy tę koncepcję zamiast ścieżki Boski?
2. Czy główne demo pozostaje przy sneakersach?
3. Czy `AUTO_BUY` jest kluczową częścią dema, czy pokazujemy głównie `ASK_USER`?
4. Czy mandat zatwierdza się jednorazowo, czy każda transakcja wymaga potwierdzenia?
5. Jak szeroko pokazujemy generalizację: drugi sprzedawca czy druga kategoria?
6. Czy prezentujemy cofnięcie zgody, zmianę ceny, czy oba przypadki?
7. Czy panel evali jest częścią głównego demo, czy materiałem na pytania jurorów?
8. Jaki jest faktyczny skład zespołu, stack i czas do prezentacji?

## Zasada oceny proponowanych zmian

Każdą propozycję zespołu analizujemy przed włączeniem do zatwierdzonej koncepcji. Sama sugestia nie zmienia zakresu.

Każdą zmianę oceniamy według sześciu kryteriów:

1. **Wartość dla użytkownika** — jaki problem rozwiązuje?
2. **Wpływ na ocenę jurorów** — czy wzmacnia agentowość, zaufanie, demo lub mierzalność?
3. **Koszt i czas** — ile pracy wymaga oraz co opóźni?
4. **Ryzyko techniczne** — jakie zależności i nowe failure modes wprowadza?
5. **Wpływ na spójność** — czy wzmacnia główną historię, czy ją rozmywa?
6. **Możliwość uproszczenia** — czy ten sam efekt osiągniemy mniejszym zakresem?

Wynik analizy przyjmuje jedną z czterech form:

- **Przyjąć** — wartość przewyższa koszt i ryzyko.
- **Przyjąć po zmianie** — pomysł jest dobry, ale wymaga zawężenia.
- **Odłożyć** — wartość jest realna, lecz nie mieści się w MVP.
- **Odrzucić** — pomysł osłabia produkt lub nie uzasadnia kosztu.

Ocena zmiany będzie miała stały format:

```text
Propozycja:
Rozwiązywany problem:
Korzyść:
Koszt:
Ryzyka:
Wpływ na demo i architekturę:
Prostszy wariant:
Rekomendacja:
Decyzja zespołu:
```

## Następny krok

Zespół powinien teraz przejrzeć sekcje: „Pomysł w jednym zdaniu”, „Zakres MVP”, „Proponowana demonstracja” i „Decyzje wymagające wspólnego zatwierdzenia”. Po zebraniu uwag ocenimy każdą zmianę osobno i dopiero wtedy zamrozimy wersję koncepcji do implementacji.
