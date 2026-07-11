# Bluecrop — Deal Hunter

Deal Hunter to demonstracyjny agent zakupowy, który prowadzi wywiad, tworzy jawny plan zakupu, wyszukuje produkty, ocenia
zmieniające się oferty i wykonuje testowy zakup wyłącznie w granicach zatwierdzonej zgody.

Repo zawiera lokalny pion hackathonowy z testowym UI Next.js i API Fastify. Sprzedawcy i płatność
są symulowane, ale pełny koszt, policy engine, rewalidacja, idempotencja i audit receipt działają
w kodzie deterministycznym.

## Szybki start

Wymagany jest Node.js 22 lub nowszy.

```bash
npm install
cp .env.example .env
npm run dev
```

- UI: `http://127.0.0.1:3000`
- API: `http://127.0.0.1:3001`

Sprawdzenie gotowości API:

```bash
curl http://127.0.0.1:3001/health
```

Bez klucza dostępny jest tryb `fixture`. Po ustawieniu `OPENAI_API_KEY` aplikacja domyślnie używa prawdziwego modelu AI.

## Testowe UI

Pojedynczy ekran prowadzi przez cały przepływ:

1. przejdź adaptacyjny wywiad tekstowy albo głosowy;
2. sprawdź podsumowanie i skompiluj brief;
3. zatwierdź plan zakupu;
4. uruchom monitoring;
5. wykonaj poprawny checkout albo najpierw podnieś cenę;
6. sprawdź timeline, trust receipt i safety counters.

Przycisk „Cofnij zgodę” pozwala sprawdzić drugą blokadę rewalidacji. „Reset demo” czyści stan
backendu i interfejsu.

## Demo

Pełny golden path można sprawdzić bez uruchamiania serwera:

```bash
npm run demo:smoke
```

Oczekiwany wynik to trzy decyzje:

```text
IGNORE → IGNORE → AUTO_BUY
```

Pierwsza oferta przekracza limit po FX, dostawie i opłatach. Druga ma fałszywy rabat. Trzecia
spełnia plan zakupu, mieści się w 80 EUR i ma niski stan magazynowy.

Stan działającego serwera resetuje:

```bash
npm run demo:reset
```

## OpenAI

Klucz pozostaje wyłącznie w backendzie. Nie dodawaj `.env` do repozytorium.

```bash
MANDATE_COMPILER_MODE=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OFFER_ENRICHMENT_MODE=html
```

Adapter używa Responses API i Structured Outputs z tym samym schematem Zod, który waliduje
kontrakt aplikacji. Model prowadzi wywiad, generuje parametry i kategorie wyszukiwania, a następnie
używa narzędzia `web_search` do znalezienia aktualnych propozycji z klikalnymi źródłami. Nie liczy
deterministycznych granic bezpieczeństwa ani nie autoryzuje zakupu.
Jeżeli wynik wyszukiwania nie zawiera dopasowanego obrazu, backend pobiera ograniczony fragment
bezpośredniej strony oferty i odczytuje `og:image` lub `twitter:image`. Pobieranie sprawdza HTTPS,
przekierowania, publiczny adres DNS, typ odpowiedzi i limit bajtów; jego awaria nie przerywa całego
wyszukiwania. `OFFER_ENRICHMENT_ALLOWED_HOSTS` może opcjonalnie ograniczyć ten fallback do listy
hostów rozdzielonych przecinkami, a `OFFER_ENRICHMENT_MODE=disabled` wyłącza go całkowicie.
Każde pytanie zawiera gotowe opcje odpowiedzi, a wywiad ma twardy limit czterech rund. Po
osiągnięciu limitu model musi utworzyć najlepszy możliwy plan i rozpocząć wyszukiwanie.
Rozmowa głosowa używa WebRTC i krótkotrwałego sekretu sesji wydawanego przez backend. Standardowy
`OPENAI_API_KEY` nigdy nie jest zwracany do przeglądarki. Mikrofon wymaga zgody użytkownika i jest
zatrzymywany po zakończeniu rozmowy, resecie połączenia albo opuszczeniu widoku.

## Komendy

```bash
npm run check       # TypeScript + walidacja dokumentów agentowych
npm test            # testy domeny i API
npm run build       # produkcyjne buildy API i Next.js
npm start           # uruchomienie obu produkcyjnych aplikacji
npm run demo:smoke  # pełny lokalny golden path
```

## Architektura

```text
Next.js UI
    ↓ HTTP + WebRTC
Fastify API
    ├── adaptive text/voice interview
    ├── fixture/OpenAI purchase-plan compiler
    ├── OpenAI web search + product recommendations
    ├── deterministic replay + policy engine
    ├── revalidation + idempotent checkout
    └── in-memory audit receipts
```

Najważniejsze katalogi:

| Ścieżka | Odpowiedzialność |
| --- | --- |
| `apps/api` | Fastify, endpointy, konfiguracja i adaptery |
| `apps/web` | testowy interfejs Next.js i klient HTTP |
| `packages/contracts` | schematy Zod oraz typy UI–backend |
| `packages/domain` | koszt, matching, ryzyko i decyzje |
| `packages/checkout` | rewalidacja, idempotencja i receipt |
| `fixtures/scenarios` | odtwarzalne dane demo |
| `tests` | testy domenowe i pełny przepływ API |

Szczegółowe przykłady request/response są w
[kontrakcie UI–backend](docs/hackathon/contracts.md). Scenariusz prezentacji znajduje się w
[runbooku demo](docs/hackathon/demo.md).

## Ograniczenia MVP

- stan znika po restarcie procesu;
- brak prawdziwego scrapingu i płatności;
- jedno lokalne demo, bez logowania i wielu użytkowników;
- kontrolowane mutacje ofert istnieją wyłącznie na potrzeby prezentacji.

Ostatni przegląd: 2026-07-11.
