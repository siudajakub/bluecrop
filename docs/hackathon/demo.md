# Deal Hunter — runbook demo

Uzupełnić dokładny commit, adresy i komendy do **2026-07-11 17:20 CEST**. Demo musi działać na tym
samym seedzie lokalnie, nawet jeśli hosting albo OpenAI są niedostępne.

## Dokładny artefakt

- Commit / tag: zostanie zapisany jako `demo-v1` po dwóch udanych próbach.
- Hosted URL: do ustalenia.
- Local checkout: katalog główny repozytorium.
- Environment owner: Jakub.
- Prezenter / backup: do ustalenia.

## Czysty start i reset

Aktualne komendy:

```bash
npm install
npm run dev
```

W drugim terminalu:

```bash
npm run demo:reset
npm run demo:smoke
```

- Wymagane zmienne w trybie OpenAI: `MANDATE_COMPILER_MODE=openai`, `OPENAI_API_KEY` i opcjonalnie
  `OPENAI_MODEL`; tryb fixture nie wymaga sekretów.
- Health signal: `GET /health` zwraca 200, a UI pokazuje stan „Demo ready”.
- Reset: poniżej 10 sekund i ponowne ustawienie seeda `20260711`.

## Scenariusz 2–3 minuty

| Czas | Akcja prezentera | Co widzi publiczność | Teza |
| --- | --- | --- | --- |
| 0:00 | Wpisuje brief Nike Dunk Low, EU 43, do 80 EUR | AI tworzy jawny mandat | Agent rozumie intencję, ale użytkownik zatwierdza granice |
| 0:30 | Zatwierdza mandat i uruchamia monitoring | Oś czasu ofert i pełne koszty | To proces działający w czasie, nie chatbot |
| 0:55 | Odtwarza ofertę z UK | Koszt po FX i dostawie przekracza limit; `IGNORE` | Cena na karcie nie jest prawdziwym kosztem |
| 1:20 | Odtwarza fałszywy rabat | Historia ceny i kod ryzyka; brak alertu | Silnik odrzuca pozorną okazję |
| 1:45 | Odtwarza ofertę z NL, niski stock | `AUTO_BUY` albo gotowość do checkoutu | Wszystkie warunki mandatu są sprawdzone |
| 2:05 | Wstrzykuje zmianę ceny i ponawia checkout | Rewalidacja blokuje zakup | Agent nie przekracza mandatu |
| 2:25 | Resetuje zmianę i ponawia dwa razy | Jeden purchase ID oraz trust receipt | Idempotencja i audyt są mierzalne |
| 2:45 | Pokazuje evale | Zero naruszeń limitu i duplikatów | Bezpieczeństwo jest testowane, nie deklarowane |

## Fallbacki

| Awaria | Wykrycie | Odzyskanie | Maksymalna pauza |
| --- | --- | --- | --- |
| OpenAI timeout/quota | komunikat kompilacji mandatu | `DEMO_FIXTURE_MODE=1`, załadowany mandat | 10 s |
| API/hosting niedostępne | healthcheck czerwony | lokalny serwer albo UI fixture adapter | 20 s |
| Stan demo zanieczyszczony | inne ID lub sekwencja | `npm run demo:reset` | 10 s |
| AUTO_BUY nie przechodzi evali | false-buy lub cap violation | zakończyć na `ASK_USER` | bez pauzy |

## Uczciwe ograniczenia

- Sprzedawcy, ceny, FX, dostawa, ryzyko i płatność są deterministycznymi danymi demo.
- Nie ma scrapingu ani prawdziwych pieniędzy; produkcja wymaga adapterów sklepów, ochrony danych,
  obserwowalności, polityk regionalnych i kontroli fraudowej.
- MVP obsługuje jeden kraj dostawy, jedną walutę bazową i jedną główną kategorię produktów.

## Checklista submission

- README wskazuje jedną ścieżkę startu.
- Hosted link wskazuje commit/tag demo-safe.
- Lokalny tryb fixture został uruchomiony na maszynie prezentacyjnej.
- Film albo zrzuty golden path są dostępne offline.
- Repo i artefakty nie zawierają sekretów ani prywatnych danych.
