# ADR-001: Wybór ścieżki Solidgate i modularnego monolitu

- Status: zaakceptowany roboczo
- Data: 2026-07-11
- Zakres: weekendowy hackathon OpenAI

## Kontekst

Zespół wybiera między wąskim agentem deal-huntingowym Solidgate a szerokim workflow transakcyjnym Boski. Celem jest działające, mierzalne demo, które pokazuje agentowość, zgodę użytkownika i bezpieczną akcję.

## Decyzja

Wybieramy ścieżkę Solidgate i pozycjonujemy rozwiązanie jako **Delegated Purchase Policy Engine** z pionowym use case’em deal hunting.

Implementujemy modularny monolit TypeScript z osobnym procesem symulatora/workerem tylko wtedy, gdy wymaga tego background flow. Runtime modelowy opieramy na Responses API, function calling i walidowanych wyjściach strukturalnych.

## Zasady architektoniczne

1. LLM interpretuje, dopasowuje semantycznie i wyjaśnia.
2. Kod deterministyczny liczy, egzekwuje hard caps i autoryzuje.
3. Żaden tool call modelu nie omija policy engine.
4. Każda zgoda i decyzja są wersjonowane oraz odtwarzalne.
5. Checkout jest idempotentny i poprzedzony rewalidacją.
6. Symulator ma seed, replay i jawne fixture’y.
7. Evale są częścią produktu demonstracyjnego, nie dodatkiem po implementacji.

## Konsekwencje pozytywne

- Jedna spójna historia demo.
- Niskie ryzyko zależności od zewnętrznych sklepów i płatności.
- Jasna granica bezpieczeństwa.
- Możliwość pokazania wyników na eval set.
- Modularność umożliwia późniejsze adaptery merchantów i szerszy lifecycle.

## Konsekwencje negatywne

- Demo nie dowodzi działania na otwartym internecie.
- Generalizacja musi zostać pokazana przez schematy i adaptery, nie skalę danych.
- Uproszczone cła, FX i ryzyko muszą być jawnie opisane jako fixture’y.
- Nie realizujemy pełnego post-purchase lifecycle z Boski.

## Odrzucone warianty

### Pełny Boski lifecycle

Odrzucony dla weekendowego MVP ze względu na liczbę domen i failure modes. Może stać się kierunkiem po hackathonie.

### Live scraping i browser checkout

Odrzucone jako kruche, nieprzewidywalne i odciągające uwagę od jakości decyzji.

### Mikroserwisy i multi-agent runtime

Odrzucone jako koszt operacyjny bez proporcjonalnej wartości dla jednego pionowego flow.
