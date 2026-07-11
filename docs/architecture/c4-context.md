# C4 Level 1: Kontekst systemu

Diagram pokazuje użytkownika, system Deal Hunter oraz zewnętrzne zależności. Mockowani sprzedawcy są czarnymi skrzynkami; nie modelujemy ich wnętrza.

```mermaid
C4Context
  title Kontekst systemu - Delegated Purchase Policy Engine

  Person(user, "Kupujący", "Definiuje zamiar, limit i zakres zgody")
  Person(team, "Zespół lub juror", "Uruchamia replay i sprawdza metryki")

  System(dealHunter, "Deal Hunter", "Monitoruje oferty i bezpiecznie realizuje mandat")

  System_Ext(openai, "OpenAI API", "Interpretuje intencję i używa narzędzi")
  System_Ext(merchants, "Mockowani sprzedawcy", "Publikują oferty i przyjmują checkout")

  Rel(user, dealHunter, "Tworzy mandat i zatwierdza decyzje", "HTTPS")
  Rel(team, dealHunter, "Uruchamia scenariusze i evale", "HTTPS")
  Rel(dealHunter, openai, "Kompiluje intencję i dopasowuje oferty", "Responses API/HTTPS")
  Rel(dealHunter, merchants, "Odczytuje oferty i wykonuje mock checkout", "JSON/HTTPS")

  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

## Legenda

- System centralny: zakres kontrolowany przez zespół.
- Systemy zewnętrzne: API lub mockowane adaptery poza rdzeniem.
- Strzałka wskazuje inicjatora operacji i opisuje przesyłaną intencję.
