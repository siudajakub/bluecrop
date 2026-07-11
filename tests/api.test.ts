import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/api/src/app.js";
import { loadConfig } from "../apps/api/src/config.js";
import { FixtureMandateCompiler } from "../apps/api/src/services/mandate-compiler.js";

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
  return { runId, decisions, winner, actions: decisions.map((decision: { action: string }) => decision.action) };
}
