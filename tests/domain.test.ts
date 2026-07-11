import { describe, expect, it } from "vitest";
import type { Mandate } from "../packages/contracts/src/index.js";
import { calculateTotalCost, evaluateOffer } from "../packages/domain/src/index.js";
import { loadScenario } from "../apps/api/src/scenarios.js";

const mandate: Mandate = {
  id: "mandate-test",
  version: 1,
  status: "APPROVED",
  destinationCountry: "PL",
  product: { query: "Nike Dunk Low", size: "EU 43", condition: "NEW" },
  maxTotal: { amountMinor: 8000, currency: "EUR" },
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
});
