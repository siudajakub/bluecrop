import { describe, expect, it } from "vitest";
import type { Mandate } from "../packages/contracts/src/index.js";
import { calculateTotalCost, evaluateOffer } from "../packages/domain/src/index.js";
import { loadScenario } from "../apps/api/src/scenarios.js";
import { extractExplicitBudget, unresolvedBlockingAmbiguities } from "../apps/api/src/services/mandate-compiler.js";
import { extractOpenGraphImage, isDirectProductUrl } from "../apps/api/src/services/product-searcher.js";
import { extractPageImage, SafeHtmlOfferPageEnricher } from "../apps/api/src/services/offer-page-enricher.js";

const mandate: Mandate = {
  id: "mandate-test",
  version: 1,
  status: "APPROVED",
  destinationCountry: "PL",
  product: { query: "Nike Dunk Low", size: "EU 43", condition: "NEW" },
  maxTotal: { amountMinor: 8000, currency: "EUR" },
  purchaseBy: null,
  sellerPolicy: { allowResellers: false },
  autonomy: "AUTO_BUY_IF_LOW_STOCK",
};

describe("decision engine", () => {
  it("includes FX, shipping and fees in the UK total", () => {
    const offer = loadScenario("uk-currency-trap").offers[0]!;
    const cost = calculateTotalCost(offer, "EUR");
    expect(cost.total).toEqual({ amountMinor: 9009, currency: "EUR" });
    const decision = evaluateOffer(offer, mandate, "d-uk");
    expect(decision.action).toBe("IGNORE");
    expect(decision.reasonCodes).toContain("TOTAL_CAP_EXCEEDED");
  });

  it("rejects the fake discount based on price history", () => {
    const offer = loadScenario("fake-discount").offers[0]!;
    const decision = evaluateOffer(offer, mandate, "d-fake");
    expect(decision.action).toBe("IGNORE");
    expect(decision.reasonCodes).toContain("FAKE_DISCOUNT");
  });

  it("authorizes the exact low-stock offer within the cap", () => {
    const offer = loadScenario("golden-path").offers[2]!;
    const decision = evaluateOffer(offer, mandate, "d-good");
    expect(decision.action).toBe("AUTO_BUY");
    expect(decision.cost.total.amountMinor).toBe(7650);
    expect(decision.reasonCodes).toEqual(expect.arrayContaining(["EXACT_VARIANT", "WITHIN_TOTAL_CAP", "LOW_STOCK"]));
  });

  it("rejects a different size", () => {
    const offer = structuredClone(loadScenario("golden-path").offers[2]!);
    offer.product.size = "EU 42";
    const decision = evaluateOffer(offer, mandate, "d-size");
    expect(decision.action).toBe("IGNORE");
    expect(decision.reasonCodes).toContain("VARIANT_MISMATCH");
  });

  it("does not require a size for products without a sized variant", () => {
    const offer = structuredClone(loadScenario("golden-path").offers[2]!);
    const unsizedMandate = {
      ...mandate,
      product: { query: "Nike Dunk Low", size: null, condition: "NEW" as const },
      autonomy: "ASK_BEFORE_BUY" as const,
    };
    expect(evaluateOffer(offer, unsizedMandate, "d-unsized").action).toBe("ASK_USER");
  });

  it("rejects a reseller when the mandate forbids resellers", () => {
    const offer = structuredClone(loadScenario("golden-path").offers[2]!);
    offer.seller.type = "RESELLER";
    const decision = evaluateOffer(offer, mandate, "d-reseller");
    expect(decision.action).toBe("IGNORE");
    expect(decision.reasonCodes).toContain("RESELLER_BLOCKED");
  });

  it("rejects an invalid coupon", () => {
    const offer = structuredClone(loadScenario("golden-path").offers[2]!);
    offer.couponValid = false;
    const decision = evaluateOffer(offer, mandate, "d-coupon");
    expect(decision.action).toBe("IGNORE");
    expect(decision.reasonCodes).toContain("INVALID_COUPON");
  });

  it("asks the user when seller trust is too low", () => {
    const offer = structuredClone(loadScenario("golden-path").offers[2]!);
    offer.seller.trustScore = 0.5;
    const decision = evaluateOffer(offer, mandate, "d-trust");
    expect(decision.action).toBe("ASK_USER");
    expect(decision.reasonCodes).toContain("INSUFFICIENT_TRUST");
  });

  it("asks before buying when the mandate requires approval", () => {
    const offer = structuredClone(loadScenario("golden-path").offers[2]!);
    const decision = evaluateOffer(offer, { ...mandate, autonomy: "ASK_BEFORE_BUY" }, "d-ask");
    expect(decision.action).toBe("ASK_USER");
    expect(decision.reasonCodes).toContain("APPROVAL_REQUIRED");
  });

  it("emits an alert for a matching offer without purchase autonomy", () => {
    const offer = structuredClone(loadScenario("golden-path").offers[2]!);
    const decision = evaluateOffer(offer, { ...mandate, autonomy: "ALERT_ONLY" }, "d-alert");
    expect(decision.action).toBe("ALERT");
  });

  it("downgrades AUTO_BUY to ALERT once the purchase deadline has passed", () => {
    const offer = structuredClone(loadScenario("golden-path").offers[2]!);
    const decision = evaluateOffer(
      offer,
      { ...mandate, purchaseBy: "2026-07-01" },
      "d-deadline",
      new Date("2026-07-11T10:00:00.000Z"),
    );
    expect(decision.action).toBe("ALERT");
    expect(decision.reasonCodes).toContain("DEADLINE_PASSED");
    expect(decision.explanation).toContain("deadline");
  });

  it("keeps AUTO_BUY while the purchase deadline is still ahead", () => {
    const offer = structuredClone(loadScenario("golden-path").offers[2]!);
    const decision = evaluateOffer(
      offer,
      { ...mandate, purchaseBy: "2026-07-20" },
      "d-deadline-ok",
      new Date("2026-07-11T10:00:00.000Z"),
    );
    expect(decision.action).toBe("AUTO_BUY");
    expect(decision.reasonCodes).not.toContain("DEADLINE_PASSED");
  });

  it("treats the deadline day itself as still valid", () => {
    const offer = structuredClone(loadScenario("golden-path").offers[2]!);
    const decision = evaluateOffer(
      offer,
      { ...mandate, purchaseBy: "2026-07-11" },
      "d-deadline-day",
      new Date("2026-07-11T18:00:00.000Z"),
    );
    expect(decision.action).toBe("AUTO_BUY");
    expect(decision.reasonCodes).not.toContain("DEADLINE_PASSED");
  });
});

describe("AI purchase flow safeguards", () => {
  it("does not block a complete plan with optional follow-up questions", () => {
    expect(unresolvedBlockingAmbiguities({
      product: { query: "zestaw gitarowy", size: null, condition: "USED" },
      maxTotal: { amountMinor: 250000, currency: "PLN" },
      purchaseBy: null,
      sellerPolicy: { allowResellers: true },
      autonomy: "ASK_BEFORE_BUY",
      ambiguities: [
        { field: "sellerPolicy.allowResellers", code: "AMBIGUOUS", question: "Czy resellerzy są dozwoleni?" },
        { field: "autonomy", code: "AMBIGUOUS", question: "Jaki tryb działania wybrać?" },
      ],
    })).toEqual([]);
  });

  it("accepts direct OLX listings and rejects OLX search pages", () => {
    expect(isDirectProductUrl("https://www.olx.pl/d/oferta/gitara-elektryczna-CID751-ID123.html")).toBe(true);
    expect(isDirectProductUrl("https://www.olx.pl/oferty/q-gitara-elektryczna/")).toBe(false);
    expect(isDirectProductUrl("https://www.olx.pl/?q=gitara")).toBe(false);
    expect(isDirectProductUrl("https://allegrolokalnie.pl/oferta/gitara-ibanez")).toBe(true);
    expect(isDirectProductUrl("https://allegrolokalnie.pl/oferty/gitary-i-akcesoria/elektryczne-260310")).toBe(false);
  });

  it("extracts the offer image from Open Graph metadata", () => {
    expect(extractOpenGraphImage(
      '<html><head><meta property="og:image" content="/photos/guitar.jpg"></head></html>',
      "https://shop.example.com/products/guitar",
    )).toBe("https://shop.example.com/photos/guitar.jpg");
    expect(extractOpenGraphImage(
      '<meta property="og:image" content=https://cdn.example.com/guitar.webp>',
      "https://shop.example.com/products/guitar",
    )).toBe("https://cdn.example.com/guitar.webp");
  });

  it("extracts a public page image regardless of metadata attribute order", () => {
    expect(extractPageImage(
      '<meta content="/photos/guitar.jpg?size=large&amp;crop=1" property="og:image">',
      "https://shop.example.com/products/guitar",
    )).toBe("https://shop.example.com/photos/guitar.jpg?size=large&crop=1");
    expect(extractPageImage('<meta property="og:image" content="http://127.0.0.1/private.jpg">', "https://shop.example.com")).toBeNull();
  });

  it("blocks private destinations and validates redirects before fetching them", async () => {
    const requested: string[] = [];
    const enricher = new SafeHtmlOfferPageEnricher({
      allowedHosts: ["shop.example.com"],
      resolveHost: (async (hostname: string) => [{ address: hostname === "private.shop.example.com" ? "127.0.0.1" : "203.0.113.10", family: 4 }]) as never,
      fetcher: (async (url: string | URL | Request) => {
        requested.push(String(url));
        return new Response(null, { status: 302, headers: { location: "https://private.shop.example.com/admin" } });
      }) as typeof fetch,
    });
    await expect(enricher.enrich("https://shop.example.com/product/1")).rejects.toThrow("private or invalid");
    expect(requested).toEqual(["https://shop.example.com/product/1"]);
  });

  it("converts an explicit PLN budget to minor units without model arithmetic", () => {
    expect(extractExplicitBudget("maksymalny pełny koszt całości z dostawą: 2500 PLN")).toEqual({
      amountMinor: 250000,
      currency: "PLN",
    });
  });
});
