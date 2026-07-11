# Backlog hackathonu: Deal Hunter

## Cel

Dostarczyć demonstracyjne MVP silnika delegowanego zakupu. System interpretuje mandat, przetwarza symulowane oferty, oblicza koszt końcowy, egzekwuje deterministyczne limity i wykonuje audytowalny zakup testowy.

## P0: pełny przepływ

- [x] Zdefiniować schematy `MandateVersion`, `CanonicalOffer`, `Decision` i `AuditReceipt`.
- [x] Zaimplementować formularz briefu i jawny przegląd mandatu w testowym UI.
- [x] Zintegrować OpenAI Responses API z walidowanymi danymi strukturalnymi (adapter gotowy; live test po dodaniu klucza).
- [x] Zbudować deterministyczny symulator z seedem i możliwością odtworzenia przebiegu.
- [x] Zaimplementować normalizację i dopasowanie produktu oraz wariantu dla MVP.
- [x] Zbudować kalkulator kosztu końcowego z danymi testowymi FX, wysyłki i opłat.
- [x] Wykrywać ryzyka MVP: fałszywy rabat, reseller, nieważny kupon, trust i brak towaru przy checkout.
- [x] Zaimplementować deterministyczny silnik polityk.
- [x] Dodać ponowną walidację przed zakupem i idempotencję.
- [x] Zapisywać dziennik zdarzeń w pamięci i generować trust receipt.
- [x] Pokazać pełną oś czasu w interfejsie.

## P0: jakość i bezpieczeństwo

- [x] Przygotować 12 przypadków testowych z oczekiwanymi decyzjami; obejmują limit, wariant,
  sprzedawcę, kupon, trust, zmianę ceny i duplikat.
- [x] Przetestować limit wydatku, zmianę ceny i zduplikowany checkout; test cofniętej zgody pozostaje.
- [x] Zagwarantować w obecnym zestawie testowym `hard_cap_violations = 0` i `duplicate_buys = 0`.
- [x] Obliczać bieżące safety counters: false-buy rate, hard-cap violations i duplicate buys.
- [ ] Umożliwić odtworzenie nieudanych przypadków.

## P1: jakość demonstracji

- [x] Przygotować scenariusz pułapki walutowej z ofertą z Wielkiej Brytanii.
- [x] Przygotować scenariusz fałszywego rabatu.
- [x] Przygotować prawidłową ofertę z Holandii i niskim stanem magazynowym.
- [x] Dodać kontrolowaną zmianę ceny podczas demonstracji.
- [ ] Po hackathonie: pokazać drugi adapter sprzedawcy albo drugą kategorię produktu.
- [x] Przygotować scenariusz prezentacji na 2–3 minuty i wariant działający całkowicie lokalnie.

## Poza zakresem

- scraping na żywo;
- prawdziwe płatności;
- globalne obliczanie podatków i ceł;
- pełny marketplace;
- obsługa wielu użytkowników;
- zwroty i wsparcie posprzedażowe;
- architektura mikroserwisowa.
