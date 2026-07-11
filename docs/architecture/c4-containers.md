# C4 Level 2: Containers

The hackathon architecture is a single Node.js process with domain modules. State lives in memory,
and merchants are reproducible JSON fixtures.

```mermaid
C4Container
  title Containers - Bluecrop / Deal Hunter MVP

  Person(user, "Buyer", "Defines the mandate and reviews decisions")
  Person(team, "Team or juror", "Runs replay and inspects the receipt")

  System_Ext(openai, "OpenAI API", "Compiles the brief via Structured Outputs")

  Container_Boundary(platform, "Bluecrop") {
    Container(web, "Web App", "Next.js, React", "Brief, mandate, timeline, and receipt")
    Container(api, "Application API", "Fastify, TypeScript, Node.js", "HTTP API, orchestration, and demo state")
    Container(domain, "Domain Modules", "TypeScript", "Cost, matching, risk, and policy engine")
    Container(checkout, "Checkout Module", "TypeScript", "Revalidation, idempotency, and trust receipt")
    ContainerDb(fixtures, "Fixture Store", "JSON + in-memory state", "Seeded offers, runs, and decisions")
  }

  Rel(user, web, "Creates and approves the mandate", "HTTPS")
  Rel(team, web, "Watches the demo run", "HTTPS")
  Rel(web, api, "Commands and event polling", "JSON/HTTP")
  Rel(api, openai, "Interprets the brief", "Responses API/HTTPS")
  Rel(api, domain, "Evaluates the offer", "module call")
  Rel(api, checkout, "Finalizes the test purchase", "module call")
  Rel(api, fixtures, "Loads scenarios and stores state", "file/memory")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## Responsibility boundaries

- Mandate Compiler: brief → validated mandate draft via fixture or OpenAI.
- Replay: seeded offers and controlled mutations for the demo.
- Domain: full cost, exact variant, risk flags, and decision.
- Checkout: revalidation of version, price, cap, stock, and consent.
- Audit: event timeline and trust receipt stored in the process memory.

## Deliberate simplifications

There is no separate worker, database, SSE, or real checkout. These elements are not needed to prove
the main invariant: the model interprets, and deterministic code authorizes.
