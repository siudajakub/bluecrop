import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/api/src/app.js";
import { loadConfig } from "../apps/api/src/config.js";
import { FixtureMandateCompiler } from "../apps/api/src/services/mandate-compiler.js";
import type { OfferScraper } from "../apps/api/src/services/offer-scraper.js";

const brief = "Nike Dunk Low, rozmiar 43, nowe, bez resellerów, maksymalnie 80 EUR z dostawą, kup automatycznie przy niskim stanie";

describe("Deal Hunter API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config: loadConfig({}), compiler: new FixtureMandateCompiler() });
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns explicit ambiguities instead of inventing missing constraints", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/mandates/compile",
      payload: { brief: "Nike Dunk Low nowe", baseCurrency: "EUR", destinationCountry: "PL" },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("AMBIGUOUS_MANDATE");
    expect(response.json().ambiguities.map((item: { field: string }) => item.field)).toEqual(["product.size", "maxTotal"]);
  });

  it("keeps live offer scraping disabled unless explicitly configured", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/offers/scrape",
      payload: { urls: ["https://shop.example/products"] },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("OFFER_SCRAPER_DISABLED");
  });

  it("returns validated offers and per-page errors from the scraper adapter", async () => {
    await app.close();
    const scraper: OfferScraper = {
      async scrape(url) {
        if (url.includes("broken")) throw new Error("Shop returned HTTP 403");
        return [{
          id: "scraped-1",
          productId: "yamaha-f310",
          merchantId: "merchant-example-shop",
          category: "guitars",
          productName: "Yamaha F310",
          store: "Example Shop",
          shippingFrom: "Poland",
          price: { amountMinor: 89900, currency: "PLN" },
          deliveryPrice: { amountMinor: 0, currency: "PLN" },
          stock: 3,
          deliveryDays: 2,
          couponCode: null,
          riskScore: null,
          url: "https://shop.example/yamaha-f310",
          imageUrl: "https://shop.example/images/yamaha-f310.jpg",
          scrapedAt: "2026-07-11T12:00:00.000Z",
        }];
      },
    };
    app = await buildApp({ config: loadConfig({}), compiler: new FixtureMandateCompiler(), offerScraper: scraper });
    const response = await app.inject({
      method: "POST",
      url: "/api/offers/scrape",
      payload: { urls: ["https://shop.example/products", "https://broken.example/products"] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      offers: [{ productName: "Yamaha F310", price: { amountMinor: 89900, currency: "PLN" } }],
      errors: [{ url: "https://broken.example/products", code: "SCRAPE_FAILED" }],
    });
  });

  it("executes the golden path and makes checkout idempotent", async () => {
    const flow = await startGoldenPath(app, "success");
    expect(flow.actions).toEqual(["IGNORE", "IGNORE", "AUTO_BUY"]);

    const payload = {
      mandateVersion: flow.winner.mandateVersion,
      offerVersion: flow.winner.offerVersion,
      idempotencyKey: "checkout-success",
    };
    const first = await app.inject({ method: "POST", url: `/api/decisions/${flow.winner.id}/checkout`, payload });
    const retry = await app.inject({ method: "POST", url: `/api/decisions/${flow.winner.id}/checkout`, payload });
    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().purchaseId).toBe(first.json().purchaseId);
    expect(retry.json().receiptId).toBe(first.json().receiptId);
    expect(retry.json().idempotentReplay).toBe(true);

    const receipt = await app.inject({ method: "GET", url: `/api/receipts/${first.json().receiptId}` });
    expect(receipt.statusCode).toBe(200);
    expect(receipt.json().cost.total.amountMinor).toBe(7650);

    const metrics = await app.inject({ method: "GET", url: "/api/evals/summary" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json()).toMatchObject({
      runs: 1,
      decisions: 3,
      purchases: 1,
      hardCapViolations: 0,
      duplicateBuys: 0,
      falseBuyRate: 0,
    });
  });

  it("blocks checkout when the price changes after the decision", async () => {
    const flow = await startGoldenPath(app, "mutation");
    const mutation = await app.inject({
      method: "POST",
      url: `/api/runs/${flow.runId}/mutations`,
      payload: { type: "PRICE_CHANGED", offerId: flow.winner.offerId, amountMinor: 7900 },
    });
    expect(mutation.statusCode).toBe(200);

    const checkout = await app.inject({
      method: "POST",
      url: `/api/decisions/${flow.winner.id}/checkout`,
      payload: {
        mandateVersion: flow.winner.mandateVersion,
        offerVersion: flow.winner.offerVersion,
        idempotencyKey: "checkout-after-mutation",
      },
    });
    expect(checkout.statusCode).toBe(409);
    expect(checkout.json().error.code).toBe("REVALIDATION_FAILED");
    expect(checkout.json().error.reasonCodes).toEqual(
      expect.arrayContaining(["OFFER_VERSION_CHANGED", "PRICE_CHANGED", "TOTAL_CAP_EXCEEDED"]),
    );
  });

  it("blocks checkout after consent is revoked", async () => {
    const flow = await startGoldenPath(app, "revoked");
    const revoked = await app.inject({
      method: "POST",
      url: `/api/mandates/${flow.mandateId}/revoke`,
      payload: { expectedVersion: 1, idempotencyKey: "revoke-consent" },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().mandate.status).toBe("REVOKED");

    const checkout = await app.inject({
      method: "POST",
      url: `/api/decisions/${flow.winner.id}/checkout`,
      payload: {
        mandateVersion: flow.winner.mandateVersion,
        offerVersion: flow.winner.offerVersion,
        idempotencyKey: "checkout-revoked",
      },
    });
    expect(checkout.statusCode).toBe(409);
    expect(checkout.json().error.reasonCodes).toContain("CONSENT_CHANGED");
  });
});

async function startGoldenPath(app: FastifyInstance, suffix: string) {
  const compiled = await app.inject({
    method: "POST",
    url: "/api/mandates/compile",
    payload: { brief, baseCurrency: "EUR", destinationCountry: "PL" },
  });
  expect(compiled.statusCode).toBe(200);
  const mandate = compiled.json().mandate;
  const approved = await app.inject({
    method: "POST",
    url: `/api/mandates/${mandate.id}/approve`,
    payload: { expectedVersion: 1, idempotencyKey: `approve-${suffix}` },
  });
  expect(approved.statusCode).toBe(200);
  const started = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: { mandateId: mandate.id, scenarioId: "golden-path", seed: 20260711, idempotencyKey: `run-${suffix}` },
  });
  expect(started.statusCode).toBe(201);
  const runId = started.json().runId;
  const polled = await app.inject({ method: "GET", url: `/api/runs/${runId}/events?after=0` });
  expect(polled.statusCode).toBe(200);
  const decisions = polled.json().events
    .filter((event: { type: string }) => event.type === "DECISION_MADE")
    .map((event: { data: unknown }) => event.data);
  const winner = decisions.find((decision: { action: string }) => decision.action === "AUTO_BUY");
  return { mandateId: mandate.id, runId, decisions, winner, actions: decisions.map((decision: { action: string }) => decision.action) };
}
