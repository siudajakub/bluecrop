import { describe, expect, it } from "vitest";
import { CatalogAndWebProductSearcher } from "../apps/api/src/services/catalog-product-searcher.js";
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

    expect(result.searchActivity).toMatchObject({ catalogOffersScanned: 366, webMatches: 1 });
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
});
