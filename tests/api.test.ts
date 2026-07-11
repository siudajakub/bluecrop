import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Decision } from "../packages/contracts/src/index.js";
import { buildApp } from "../apps/api/src/app.js";
import { loadConfig } from "../apps/api/src/config.js";
import { FixtureMandateCompiler } from "../apps/api/src/services/mandate-compiler.js";
import type { OfferScraper } from "../apps/api/src/services/offer-scraper.js";

const brief = "Nike Dunk Low, size 43, new, no resellers, maximum 80 EUR with delivery, auto-buy on low stock";

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
      payload: { brief: "Nike Dunk Low new", baseCurrency: "EUR", destinationCountry: "PL" },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("AMBIGUOUS_MANDATE");
    expect(response.json().ambiguities.map((item: { field: string }) => item.field)).toEqual(["product.size", "maxTotal"]);
  });

  it("conducts an interview before compiling a broad purchase goal", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/interviews/respond",
      payload: { messages: [{ role: "user", content: "Chcę nauczyć się grać na gitarze" }] },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ status: "QUESTION", interviewer: "fixture", brief: null });
    expect(first.json().assistantMessage).toContain("budżet");
    expect(first.json().options.length).toBeGreaterThanOrEqual(2);
    expect(first.json()).toMatchObject({ questionNumber: 1, maxQuestions: 4 });

    const ready = await app.inject({
      method: "POST",
      url: "/api/interviews/respond",
      payload: { messages: [
        { role: "user", content: "Chcę nauczyć się grać na gitarze" },
        { role: "assistant", content: first.json().assistantMessage },
        { role: "user", content: "Do 1500 PLN z dostawą, nowa, chcę kupić w tym miesiącu" },
      ] },
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().status).toBe("READY");
    expect(ready.json().brief).toContain("gitarze");
    expect(ready.json().plan.categories).toHaveLength(1);

    const search = await app.inject({
      method: "POST",
      url: "/api/products/search",
      payload: { plan: ready.json().plan, destinationCountry: "PL" },
    });
    expect(search.statusCode).toBe(200);
    expect(search.json()).toMatchObject({ searcher: "fixture", searchedCategories: ["Produkt główny"] });
    expect(search.json().recommendations).toHaveLength(1);
    expect(search.json().recommendations[0].imageUrl).toBeNull();
  });

  it("forces a plan after the hard interview question limit", async () => {
    const messages = [{ role: "user", content: "Szukam produktu do nowego hobby" }];
    for (let index = 0; index < 4; index += 1) {
      messages.push({ role: "assistant", content: `Pytanie ${index + 1}` });
      messages.push({ role: "user", content: `Odpowiedź ${index + 1}` });
    }
    const response = await app.inject({ method: "POST", url: "/api/interviews/respond", payload: { messages } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "READY", options: [], maxQuestions: 4 });
    expect(response.json().plan).not.toBeNull();
  });

  it("keeps the realtime API key server-side and reports missing configuration", async () => {
    const response = await app.inject({ method: "POST", url: "/api/realtime/token" });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("VOICE_NOT_CONFIGURED");
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

  it("prefers structural maxTotal and purchaseBy over the brief", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/mandates/compile",
      payload: {
        brief,
        baseCurrency: "EUR",
        destinationCountry: "PL",
        maxTotal: { amountMinor: 9000, currency: "EUR" },
        purchaseBy: "2026-08-01",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().mandate.maxTotal).toEqual({ amountMinor: 9000, currency: "EUR" });
    expect(response.json().mandate.purchaseBy).toBe("2026-08-01");
  });

  it("resolves the maxTotal ambiguity when the budget arrives structurally", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/mandates/compile",
      payload: {
        brief: "Nike Dunk Low, size 43, new",
        baseCurrency: "EUR",
        destinationCountry: "PL",
        maxTotal: { amountMinor: 8000, currency: "EUR" },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ambiguities).toEqual([]);
    expect(response.json().mandate.maxTotal).toEqual({ amountMinor: 8000, currency: "EUR" });
  });

  it("lists receipts newest first and starts empty", async () => {
    const empty = await app.inject({ method: "GET", url: "/api/receipts" });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ receipts: [] });

    const flow = await startGoldenPath(app, "receipts");
    const checkout = await app.inject({
      method: "POST",
      url: `/api/decisions/${flow.winner.id}/checkout`,
      payload: {
        mandateVersion: flow.winner.mandateVersion,
        offerVersion: flow.winner.offerVersion,
        idempotencyKey: "checkout-receipts",
      },
    });
    expect(checkout.statusCode).toBe(200);

    const listed = await app.inject({ method: "GET", url: "/api/receipts" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().receipts).toHaveLength(1);
    expect(listed.json().receipts[0].id).toBe(checkout.json().receiptId);
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

  it("shows a checkout candidate for a user-approved custom product", async () => {
    const compiled = await app.inject({
      method: "POST",
      url: "/api/mandates/compile",
      payload: {
        brief: "Used guitar bundle, up to 2500 PLN including delivery, ask before buying",
        baseCurrency: "PLN",
        destinationCountry: "PL",
      },
    });
    expect(compiled.statusCode).toBe(200);
    const mandate = compiled.json().mandate;
    await app.inject({
      method: "POST",
      url: `/api/mandates/${mandate.id}/approve`,
      payload: { expectedVersion: 1, idempotencyKey: "approve-guitar" },
    });
    const started = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { mandateId: mandate.id, scenarioId: "golden-path", seed: 20260711, idempotencyKey: "run-guitar" },
    });
    const polled = await app.inject({ method: "GET", url: `/api/runs/${started.json().runId}/events?after=0` });
    const candidate = polled.json().events
      .filter((event: { type: string }) => event.type === "DECISION_MADE")
      .map((event: { data: Decision }) => event.data)
      .find((decision: Decision) => decision.action === "ASK_USER");
    expect(candidate).toBeDefined();
    expect(candidate.cost.total).toEqual({ amountMinor: 175000, currency: "PLN" });

    const checkout = await app.inject({
      method: "POST",
      url: `/api/decisions/${candidate.id}/checkout`,
      payload: { mandateVersion: 1, offerVersion: 1, idempotencyKey: "checkout-guitar" },
    });
    expect(checkout.statusCode).toBe(200);
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
