# C4 Level 2: Kontenery

Architektura hackathonowa jest jednym procesem Node.js z modułami domenowymi. Stan istnieje w
pamięci, a sprzedawcy są odtwarzalnymi fixture'ami JSON.

```mermaid
C4Container
  title Kontenery - Bluecrop / Deal Hunter MVP

  Person(user, "Kupujący", "Definiuje mandat i ogląda decyzje")
  Person(team, "Zespół lub juror", "Uruchamia replay i sprawdza receipt")

  System_Ext(openai, "OpenAI API", "Kompiluje brief przez Structured Outputs")

  Container_Boundary(platform, "Bluecrop") {
    Container(web, "Web App", "Next.js, React", "Brief, mandat, timeline i receipt")
    Container(api, "Application API", "Fastify, TypeScript, Node.js", "HTTP API, orkiestracja i stan demo")
    Container(domain, "Domain Modules", "TypeScript", "Koszt, matching, ryzyko i policy engine")
    Container(checkout, "Checkout Module", "TypeScript", "Rewalidacja, idempotencja i trust receipt")
    ContainerDb(fixtures, "Fixture Store", "JSON + in-memory state", "Seedowane oferty, runy i decyzje")
  }

  Rel(user, web, "Tworzy i zatwierdza mandat", "HTTPS")
  Rel(team, web, "Ogląda przebieg demo", "HTTPS")
  Rel(web, api, "Komendy i polling zdarzeń", "JSON/HTTP")
  Rel(api, openai, "Interpretuje brief", "Responses API/HTTPS")
  Rel(api, domain, "Ocenia ofertę", "wywołanie modułu")
  Rel(api, checkout, "Finalizuje testowy zakup", "wywołanie modułu")
  Rel(api, fixtures, "Ładuje scenariusze i przechowuje stan", "plik/pamięć")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## Granice odpowiedzialności

- Mandate Compiler: brief → walidowany draft mandatu przez fixture albo OpenAI.
- Replay: seedowane oferty i kontrolowane mutacje na potrzeby demo.
- Domain: pełny koszt, exact variant, risk flags i decyzja.
- Checkout: rewalidacja wersji, ceny, limitu, stocku i zgody.
- Audit: timeline zdarzeń oraz trust receipt przechowywane w pamięci procesu.

## Świadome uproszczenia

Nie ma osobnego workera, bazy danych, SSE ani prawdziwego checkoutu. Te elementy nie są potrzebne,
żeby udowodnić główny niezmiennik: model interpretuje, a deterministyczny kod autoryzuje.
