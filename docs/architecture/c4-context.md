# C4 Level 1: System context

The diagram shows the user, the Deal Hunter system, and the external dependencies. Mocked merchants
are black boxes; we do not model their internals.

```mermaid
C4Context
  title System context - Delegated Purchase Policy Engine

  Person(user, "Buyer", "Defines intent, cap, and consent scope")
  Person(team, "Team or juror", "Runs replay and checks metrics")

  System(dealHunter, "Deal Hunter", "Monitors offers and safely fulfills the mandate")

  System_Ext(openai, "OpenAI API", "Interprets intent and uses tools")
  System_Ext(merchants, "Mocked merchants", "Publish offers and accept checkout")

  Rel(user, dealHunter, "Creates the mandate and approves decisions", "HTTPS")
  Rel(team, dealHunter, "Runs scenarios and evals", "HTTPS")
  Rel(dealHunter, openai, "Compiles intent and matches offers", "Responses API/HTTPS")
  Rel(dealHunter, merchants, "Reads offers and runs a mock checkout", "JSON/HTTPS")

  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

## Legend

- Central system: the scope controlled by the team.
- External systems: APIs or mocked adapters outside the core.
- The arrow points to the operation's initiator and describes the intent being transmitted.
