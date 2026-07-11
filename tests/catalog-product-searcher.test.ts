import { describe, expect, it } from "vitest";
import { CatalogAndWebProductSearcher, extractBudget, parsePrice } from "../apps/api/src/services/catalog-product-searcher.js";
import type { ProductSearcher } from "../apps/api/src/services/product-searcher.js";

describe("catalog and web product search", () => {
  it("combines scraper catalog matches with GPT web results and filters catalog noise", async () => {
    const webSearcher: ProductSearcher = {
      kind: "openai",
      async search(input) {
        return {
          searchedCategories: input.plan.categories.map((item) => item.name),
          recommendations: [{
            name: "Web guitar offer",
            category: "Gitara elektryczna",
            price: "1 299,00 zł",
            seller: "Allegro",
            url: "https://allegro.pl/oferta/web-guitar-offer",
            imageUrl: "https://example.com/guitar.jpg",
            whyItFits: "Wynik OpenAI web search",
            tradeoffs: [],
          }],
        };
      },
    };
    const searcher = new CatalogAndWebProductSearcher(webSearcher);
    const result = await searcher.search({
      destinationCountry: "PL",
      baseCurrency: "PLN",
      plan: {
        goal: "Kupić gitarę elektryczną do nauki",
        summary: "Gitara elektryczna dla początkującego z podstawowymi akcesoriami",
        parameters: [{ name: "Typ", value: "gitara elektryczna", priority: "REQUIRED" }],
        categories: [{ name: "Gitara elektryczna", purpose: "Instrument główny", required: true, query: "gitara elektryczna dla początkującego" }],
      },
    });

    expect(result.searchActivity).toMatchObject({
      catalogOffersScanned: 366,
      webMatches: 1,
      recordsChecked: 367,
      webSourcesChecked: 1,
      sourceCount: 3,
    });
    expect(result.recommendations.some((item) => item.name === "Web guitar offer")).toBe(true);
    expect(result.recommendations.some((item) => /guitar/i.test(item.name))).toBe(true);
    expect(result.recommendations.every((item) => !/t-shirt|jumper|toy|charm/i.test(item.name))).toBe(true);
  });

  it("converts catalog prices to the selected currency and reports when nothing fits the budget", async () => {
    const webSearcher: ProductSearcher = { kind: "openai", async search() { return { searchedCategories: ["Guitar"], recommendations: [] }; } };
    const searcher = new CatalogAndWebProductSearcher(webSearcher);
    const usd = await searcher.search({
      destinationCountry: "PL", baseCurrency: "USD",
      plan: { goal: "Buy an acoustic guitar", summary: "Acoustic guitar up to USD 1000, buy now", parameters: [{ name: "Budget", value: "USD 1000", priority: "REQUIRED" }], categories: [{ name: "Acoustic guitar", purpose: "Main instrument", required: true, query: "acoustic guitar" }] },
    });
    expect(usd.recommendations.some((item) => item.price.includes("$"))).toBe(true);

    const noMatch = await searcher.search({
      destinationCountry: "PL", baseCurrency: "PLN",
      plan: { goal: "Buy an electric guitar", summary: "Electric guitar up to PLN 10, wait for the right price", parameters: [{ name: "Budget", value: "PLN 10", priority: "REQUIRED" }], categories: [{ name: "Electric guitar", purpose: "Main instrument", required: true, query: "electric guitar" }] },
    });
    expect(noMatch.recommendations).toHaveLength(0);
    expect(noMatch.searchActivity?.withinBudgetMatches).toBe(0);
  });

  it("never returns a 3000 PLN offer for a 1000 PLN all-in cap", async () => {
    const input = {
      destinationCountry: "PL" as const, baseCurrency: "PLN" as const,
      plan: {
        goal: "Buy an acoustic guitar",
        summary: "New acoustic guitar, maximum 1000 PLN delivered total, BUY_NOW",
        parameters: [{ name: "Maximum total cost", value: "1000 PLN including delivery", priority: "REQUIRED" as const }],
        categories: [{ name: "Acoustic guitar", purpose: "Main instrument", required: true, query: "acoustic guitar under 1000 PLN" }],
      },
    };
    expect(extractBudget(input)).toBe(1000);
    const webSearcher: ProductSearcher = { kind: "openai", async search() { return { searchedCategories: ["Acoustic guitar"], recommendations: [
      { name: "Over budget acoustic guitar", category: "Acoustic guitar", price: "PLN 3,000", seller: "Test", url: "https://example.com/over", imageUrl: "https://example.com/over.jpg", whyItFits: "Too expensive.", tradeoffs: [] },
      { name: "Within budget acoustic guitar", category: "Acoustic guitar", price: "999 PLN", seller: "Test", url: "https://example.com/within", imageUrl: "https://example.com/within.jpg", whyItFits: "Fits the approved budget.", tradeoffs: [] },
    ] }; } };
    const result = await new CatalogAndWebProductSearcher(webSearcher).search(input);
    expect(result.recommendations.map(item => item.name)).toContain("Within budget acoustic guitar");
    expect(result.recommendations.map(item => item.name)).not.toContain("Over budget acoustic guitar");
    expect(result.recommendations.every(item => !/PLN\s*[3-9][,.]?\d{3}/i.test(item.price))).toBe(true);
  });

  it("retries live search when raw results are real but none survive the approved budget", async () => {
    let calls = 0;
    const webSearcher: ProductSearcher = {
      kind: "openai",
      async search() {
        calls += 1;
        const recommendations = calls === 1
          ? [{ name: "Expensive acoustic guitar", category: "Acoustic guitar", price: "3000 PLN", seller: "Shop A", url: "https://shop-a.example/guitar", imageUrl: null, whyItFits: "Correct product.", tradeoffs: [] }]
          : [
              { name: "Budget acoustic guitar one", category: "Acoustic guitar", price: "600 PLN", seller: "Shop B", url: "https://shop-b.example/guitar-one", imageUrl: null, whyItFits: "Correct product.", tradeoffs: [] },
              { name: "Budget acoustic guitar two", category: "Acoustic guitar", price: "700 PLN", seller: "Shop C", url: "https://shop-c.example/guitar-two", imageUrl: null, whyItFits: "Correct product.", tradeoffs: [] },
              { name: "Budget acoustic guitar three", category: "Acoustic guitar", price: "800 PLN", seller: "Shop D", url: "https://shop-d.example/guitar-three", imageUrl: null, whyItFits: "Correct product.", tradeoffs: [] },
            ];
        return {
          searchedCategories: ["Acoustic guitar"],
          recommendations,
          searchActivity: {
            catalogOffersScanned: 0,
            catalogMatches: 0,
            webMatches: recommendations.length,
            sources: [`shop-${calls}.example`],
            rejectedAsIrrelevant: 0,
            webSourcesChecked: recommendations.length,
          },
        };
      },
    };

    const result = await new CatalogAndWebProductSearcher(webSearcher).search({
      destinationCountry: "PL",
      baseCurrency: "PLN",
      maxTotal: { amountMinor: 100000, currency: "PLN" },
      plan: {
        goal: "Buy an acoustic guitar",
        summary: "New acoustic guitar only",
        parameters: [{ name: "Condition", value: "new", priority: "REQUIRED" }],
        categories: [{ name: "Acoustic guitar", purpose: "Main product", required: true, query: "acoustic guitar" }],
      },
    });

    expect(calls).toBe(2);
    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations.every(item => parsePrice(item.price)!.amount <= 1000)).toBe(true);
    expect(result.searchActivity?.webSourcesChecked).toBe(4);
  });

  it("uses the approved structural cap instead of stale amounts in plan text", () => {
    expect(extractBudget({
      destinationCountry: "PL",
      baseCurrency: "PLN",
      maxTotal: { amountMinor: 190000, currency: "PLN" },
      plan: {
        goal: "Buy an acoustic guitar",
        summary: "Old budget was 1000 PLN",
        parameters: [{ name: "Budget", value: "1000 PLN", priority: "REQUIRED" }],
        categories: [{ name: "Acoustic guitar", purpose: "Main product", required: true, query: "acoustic guitar" }],
      },
    })).toBe(1900);
  });

  it("normalizes currencies and rejects ambiguous or unpriced web results", async () => {
    expect(parsePrice("1 299,00 zł")).toEqual({ amount: 1299, currency: "PLN" });
    expect(parsePrice("from 699 PLN")).toBeNull();
    expect(parsePrice("699–899 PLN")).toBeNull();
    expect(parsePrice("price on request")).toBeNull();

    const webSearcher: ProductSearcher = { kind: "openai", async search() { return {
      searchedCategories: ["Acoustic guitar"],
      recommendations: [
        { name: "USD over cap guitar", category: "Acoustic guitar", price: "$300", seller: "US Shop", url: "https://example.com/us", imageUrl: "https://example.com/us.jpg", whyItFits: "Correct product.", tradeoffs: [] },
        { name: "Ambiguous guitar", category: "Acoustic guitar", price: "from 700 PLN", seller: "Shop", url: "https://example.com/from", imageUrl: "https://example.com/from.jpg", whyItFits: "Correct product.", tradeoffs: [] },
        { name: "Valid guitar", category: "Acoustic guitar", price: "€200", seller: "EU Shop", url: "https://example.com/eu", imageUrl: "https://example.com/eu.jpg", whyItFits: "Correct product.", tradeoffs: [] },
      ],
    }; } };
    const result = await new CatalogAndWebProductSearcher(webSearcher).search({
      destinationCountry: "PL",
      baseCurrency: "PLN",
      maxTotal: { amountMinor: 100000, currency: "PLN" },
      plan: {
        goal: "Buy an acoustic guitar",
        summary: "Acoustic guitar",
        parameters: [{ name: "Condition", value: "new", priority: "REQUIRED" }],
        categories: [{ name: "Acoustic guitar", purpose: "Main product", required: true, query: "acoustic guitar" }],
      },
    });
    expect(result.recommendations.map(item => item.name)).toContain("Valid guitar");
    expect(result.recommendations.map(item => item.name)).not.toContain("USD over cap guitar");
    expect(result.recommendations.map(item => item.name)).not.toContain("Ambiguous guitar");
    expect(result.recommendations.find(item => item.name === "Valid guitar")?.price).toContain("PLN");
  });

});
