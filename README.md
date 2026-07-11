# Bluecrop — Deal Hunter

Deal Hunter to demonstracyjny agent zakupowy, który kompiluje brief do jawnego mandatu, ocenia
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

Domyślnie działa `MANDATE_COMPILER_MODE=fixture`, więc klucz OpenAI nie jest potrzebny.

## Testowe UI

Pojedynczy ekran prowadzi przez cały przepływ:

1. skompiluj brief;
2. zatwierdź mandat;
3. uruchom monitoring;
4. wykonaj poprawny checkout albo najpierw podnieś cenę;
5. sprawdź timeline, trust receipt i safety counters.

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
spełnia mandat, mieści się w 80 EUR i ma niski stan magazynowy.

Stan działającego serwera resetuje:

```bash
npm run demo:reset
```

## OpenAI

Klucz pozostaje wyłącznie w backendzie. Nie dodawaj `.env` do repozytorium.

```bash
MANDATE_COMPILER_MODE=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6
```

Adapter używa Responses API i Structured Outputs z tym samym schematem Zod, który waliduje
kontrakt aplikacji. Model interpretuje brief, ale nie liczy kosztu ani nie autoryzuje zakupu.

### Pobieranie ofert ze sklepów

Backend może opcjonalnie pobrać publiczne strony sklepów i użyć OpenAI Structured Outputs do
wyodrębnienia ofert. Klucz pozostaje wyłącznie po stronie API. Scraper jest domyślnie wyłączony i
akceptuje tylko jawnie dozwolone hosty HTTPS:

```bash
OFFER_SCRAPER_MODE=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6
SCRAPER_ALLOWED_HOSTS=www.morele.net,allegro.pl,www.olx.pl
SCRAPER_MAX_HTML_BYTES=1000000
```

Przykładowe wywołanie:

```bash
curl -X POST http://127.0.0.1:3001/api/offers/scrape \
  -H "content-type: application/json" \
  -d '{"urls":["https://www.morele.net/wyszukiwarka/?q=laptop"]}'
```

Odpowiedź zawiera `offers` zgodne ze wspólnym schematem Zod oraz błędy poszczególnych stron w
`errors`. OpenAI jedynie ekstrahuje pola widoczne na stronie. Pobieranie HTML, allowlista hostów,
ochrona przed SSRF, limit rozmiaru i walidacja odpowiedzi pozostają deterministyczne w backendzie.
Pola niewidoczne na stronie mają wartość `null`; model nie wylicza `riskScore` i nie autoryzuje zakupu.

Wdrożenie powinno respektować regulaminy sklepów, `robots.txt`, limity zapytań i obowiązujące prawo.
Strony wymagające JavaScriptu, logowania lub CAPTCHA mogą zwrócić błąd i wymagają osobnego,
autoryzowanego adaptera przeglądarkowego lub oficjalnego feedu/API sprzedawcy.

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
    ↓ HTTP polling
Fastify API
    ├── fixture/OpenAI mandate compiler
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
