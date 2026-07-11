import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CompileMandateRequestSchema,
  MandateSchema,
  ScrapeOffersRequestSchema,
  ScrapeOffersResponseSchema,
  type CompileMandateResponse,
  type Decision,
  type Mandate,
  type Run,
  type RunEvent,
} from "../../../packages/contracts/src/index.js";
import { createReceipt, RevalidationError, revalidateCheckout } from "../../../packages/checkout/src/index.js";
import { evaluateOffer } from "../../../packages/domain/src/index.js";
import type { AppConfig } from "./config.js";
import { ApiError } from "./errors.js";
import { loadScenario } from "./scenarios.js";
import type { MandateCompiler } from "./services/mandate-compiler.js";
import type { OfferScraper } from "./services/offer-scraper.js";
import { InMemoryStore } from "./store.js";

const IdempotencySchema = z.object({ idempotencyKey: z.string().min(4) });
const ApproveBodySchema = IdempotencySchema.extend({ expectedVersion: z.number().int().positive() });
const RunBodySchema = IdempotencySchema.extend({
  mandateId: z.string().min(1),
  scenarioId: z.string().min(1),
  seed: z.number().int(),
});
const PollQuerySchema = z.object({ after: z.coerce.number().int().nonnegative().default(0) });
const CheckoutBodySchema = IdempotencySchema.extend({
  mandateVersion: z.number().int().positive(),
  offerVersion: z.number().int().positive(),
});
const MutationBodySchema = z.object({
  type: z.literal("PRICE_CHANGED"),
  offerId: z.string(),
  amountMinor: z.number().int().nonnegative(),
});

export type BuildAppOptions = {
  config: AppConfig;
  compiler: MandateCompiler;
  store?: InMemoryStore;
  logger?: boolean;
  offerScraper?: OfferScraper;
};

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const store = options.store ?? new InMemoryStore();
  await app.register(cors, {
    origin: [...new Set([options.config.webOrigin, "http://localhost:3000", "http://127.0.0.1:3000"])],
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, ...error.details },
      });
    }
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "Żądanie nie spełnia kontraktu.",
          fieldErrors: error.issues.map((issue) => ({ field: issue.path.join("."), code: issue.code })),
        },
      });
    }
    if (isClientHttpError(error)) {
      return reply.status(error.statusCode).send({
        error: { code: "INVALID_REQUEST", message: error.message },
      });
    }
    app.log.error(error);
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Wewnętrzny błąd serwera." } });
  });

  app.get("/health", async () => ({
    status: "ok",
    compiler: options.compiler.kind,
    offerScraper: options.offerScraper ? "openai" : "disabled",
    now: new Date().toISOString(),
  }));

  app.post("/api/offers/scrape", async (request) => {
    if (!options.offerScraper) {
      throw new ApiError(503, "OFFER_SCRAPER_DISABLED", "Scraper ofert nie jest skonfigurowany.");
    }
    const input = ScrapeOffersRequestSchema.parse(request.body);
    const offers = [];
    const errors: Array<{ url: string; code: string; message: string }> = [];
    for (const url of input.urls) {
      try {
        offers.push(...await options.offerScraper.scrape(url));
      } catch (error) {
        errors.push({ url, code: "SCRAPE_FAILED", message: error instanceof Error ? error.message : "Nieznany błąd scrapera." });
      }
    }
    return ScrapeOffersResponseSchema.parse({ offers, errors });
  });

  app.post("/api/mandates/compile", async (request, reply) => {
    const input = CompileMandateRequestSchema.parse(request.body);
    const draft = await options.compiler.compile(input);
    const mandate: Mandate = MandateSchema.parse({
      id: store.nextId("mandate"),
      version: 1,
      status: "DRAFT",
      destinationCountry: input.destinationCountry.toUpperCase(),
      product: draft.product,
      maxTotal: draft.maxTotal,
      sellerPolicy: draft.sellerPolicy,
      autonomy: draft.autonomy,
    });
    store.mandates.set(mandate.id, mandate);
    const response: CompileMandateResponse = draft.ambiguities.length
      ? {
          mandate,
          ambiguities: draft.ambiguities,
          compiler: options.compiler.kind,
          error: {
            code: "AMBIGUOUS_MANDATE",
            message: "Uzupełnij brakujące warunki mandatu.",
            fieldErrors: draft.ambiguities.map(({ field, code }) => ({ field, code })),
          },
        }
      : { mandate, ambiguities: [], compiler: options.compiler.kind };
    return reply.status(draft.ambiguities.length ? 422 : 200).send(response);
  });

  app.post<{ Params: { mandateId: string } }>("/api/mandates/:mandateId/approve", async (request) => {
    const input = ApproveBodySchema.parse(request.body);
    const cacheKey = `approve:${input.idempotencyKey}`;
    const cached = store.idempotency.get(cacheKey);
    if (cached) return cached;
    const mandate = getMandate(store, request.params.mandateId);
    if (mandate.version !== input.expectedVersion) {
      throw new ApiError(409, "VERSION_CONFLICT", "Mandat ma nowszą wersję.");
    }
    if (!mandate.product.size || !mandate.product.condition || !mandate.maxTotal) {
      throw new ApiError(422, "AMBIGUOUS_MANDATE", "Mandat nadal zawiera braki.");
    }
    const approved = MandateSchema.parse({ ...mandate, status: "APPROVED" });
    store.mandates.set(approved.id, approved);
    const response = { mandate: approved, idempotentReplay: false };
    store.idempotency.set(cacheKey, response);
    return response;
  });

  app.post<{ Params: { mandateId: string } }>("/api/mandates/:mandateId/revoke", async (request) => {
    const input = ApproveBodySchema.parse(request.body);
    const cacheKey = `revoke:${input.idempotencyKey}`;
    const cached = store.idempotency.get(cacheKey);
    if (cached) return cached;
    const mandate = getMandate(store, request.params.mandateId);
    if (mandate.version !== input.expectedVersion) {
      throw new ApiError(409, "VERSION_CONFLICT", "Mandat ma nowszą wersję.");
    }
    const revoked = MandateSchema.parse({ ...mandate, version: mandate.version + 1, status: "REVOKED" });
    store.mandates.set(revoked.id, revoked);
    const response = { mandate: revoked, idempotentReplay: false };
    store.idempotency.set(cacheKey, response);
    return response;
  });

  app.post("/api/runs", async (request, reply) => {
    const input = RunBodySchema.parse(request.body);
    const cacheKey = `run:${input.idempotencyKey}`;
    const cached = store.idempotency.get(cacheKey);
    if (cached) return reply.status(200).send(cached);
    const mandate = getMandate(store, input.mandateId);
    if (mandate.status !== "APPROVED") throw new ApiError(409, "MANDATE_NOT_APPROVED", "Najpierw zatwierdź mandat.");

    let scenario;
    try {
      scenario = loadScenario(input.scenarioId);
    } catch {
      throw new ApiError(404, "SCENARIO_NOT_FOUND", "Nie znaleziono scenariusza demo.");
    }
    if (scenario.seed !== input.seed) throw new ApiError(422, "SEED_MISMATCH", "Scenariusz wymaga ustalonego seeda.");

    const runId = store.nextId("run");
    const offers = structuredClone(scenario.offers);
    const decisions: Decision[] = [];
    const events: RunEvent[] = [];
    const baseTime = Date.parse("2026-07-11T10:00:00.000Z");
    const appendEvent = (type: RunEvent["type"], data: Record<string, unknown>) => {
      const sequence = events.length + 1;
      events.push({
        eventId: `${runId}-event-${sequence}`,
        sequence,
        type,
        occurredAt: new Date(baseTime + sequence * 1_000).toISOString(),
        data,
      });
    };

    appendEvent("RUN_STARTED", { scenarioId: scenario.id, seed: scenario.seed });
    for (const offer of offers) {
      appendEvent("OFFER_RECEIVED", { offer });
      const decision = evaluateOffer(offer, mandate, store.nextId("decision"));
      decisions.push(decision);
      appendEvent("DECISION_MADE", { ...decision });
    }
    appendEvent("RUN_COMPLETED", { decisionCount: decisions.length });
    const run: Run = { id: runId, mandateId: mandate.id, scenarioId: scenario.id, seed: scenario.seed, status: "COMPLETED", offers, decisions, events };
    store.runs.set(run.id, run);
    const response = { runId: run.id, status: run.status, eventCursor: "0" };
    store.idempotency.set(cacheKey, response);
    return reply.status(201).send(response);
  });

  app.get<{ Params: { runId: string } }>("/api/runs/:runId/events", async (request) => {
    const query = PollQuerySchema.parse(request.query);
    const run = getRun(store, request.params.runId);
    return {
      runId: run.id,
      status: run.status,
      events: run.events.filter((event) => event.sequence > query.after),
      nextCursor: String(run.events.at(-1)?.sequence ?? query.after),
    };
  });

  app.post<{ Params: { runId: string } }>("/api/runs/:runId/mutations", async (request) => {
    const input = MutationBodySchema.parse(request.body);
    const run = getRun(store, request.params.runId);
    const index = run.offers.findIndex((offer) => offer.id === input.offerId);
    const current = run.offers[index];
    if (!current || index < 0) throw new ApiError(404, "OFFER_NOT_FOUND", "Nie znaleziono oferty w tym runie.");
    const updated = { ...current, version: current.version + 1, price: { ...current.price, amountMinor: input.amountMinor } };
    run.offers[index] = updated;
    const sequence = (run.events.at(-1)?.sequence ?? 0) + 1;
    run.events.push({
      eventId: `${run.id}-event-${sequence}`,
      sequence,
      type: "OFFER_MUTATED",
      occurredAt: new Date().toISOString(),
      data: { offerId: updated.id, offerVersion: updated.version, price: updated.price },
    });
    return { offer: updated, nextCursor: String(sequence) };
  });

  app.post<{ Params: { decisionId: string } }>("/api/decisions/:decisionId/checkout", async (request) => {
    const input = CheckoutBodySchema.parse(request.body);
    const cacheKey = `checkout:${input.idempotencyKey}`;
    const cached = store.idempotency.get(cacheKey);
    if (cached) return { ...(cached as object), idempotentReplay: true };
    const { run, decision } = findDecision(store, request.params.decisionId);
    if (decision.mandateVersion !== input.mandateVersion || decision.offerVersion !== input.offerVersion) {
      throw new ApiError(409, "VERSION_CONFLICT", "Checkout odwołuje się do innej wersji decyzji.");
    }
    const mandate = getMandate(store, decision.mandateId);
    try {
      revalidateCheckout(run, mandate, decision);
    } catch (error) {
      if (error instanceof RevalidationError) {
        throw new ApiError(409, "REVALIDATION_FAILED", error.message, { reasonCodes: error.reasonCodes });
      }
      throw error;
    }
    const receipt = createReceipt(
      decision,
      input.idempotencyKey,
      { receiptId: store.nextId("receipt"), purchaseId: store.nextId("purchase") },
      new Date().toISOString(),
    );
    store.receipts.set(receipt.id, receipt);
    const response = { status: "COMPLETED", purchaseId: receipt.purchaseId, receiptId: receipt.id, idempotentReplay: false };
    store.idempotency.set(cacheKey, response);
    return response;
  });

  app.get<{ Params: { receiptId: string } }>("/api/receipts/:receiptId", async (request) => {
    const receipt = store.receipts.get(request.params.receiptId);
    if (!receipt) throw new ApiError(404, "RECEIPT_NOT_FOUND", "Nie znaleziono trust receipt.");
    return receipt;
  });

  app.get("/api/evals/summary", async () => {
    const decisions = [...store.runs.values()].flatMap((run) => run.decisions);
    const receipts = [...store.receipts.values()];
    const hardCapViolations = receipts.filter((receipt) => {
      const mandate = store.mandates.get(receipt.mandateId);
      return mandate?.maxTotal ? receipt.cost.total.amountMinor > mandate.maxTotal.amountMinor : false;
    }).length;
    const duplicateBuys = receipts.length - new Set(receipts.map((receipt) => receipt.purchaseId)).size;
    return {
      runs: store.runs.size,
      decisions: decisions.length,
      purchases: receipts.length,
      hardCapViolations,
      duplicateBuys,
      falseBuyRate: receipts.length ? hardCapViolations / receipts.length : 0,
      decisionCounts: Object.fromEntries(
        ["IGNORE", "ALERT", "ASK_USER", "AUTO_BUY"].map((action) => [
          action,
          decisions.filter((decision) => decision.action === action).length,
        ]),
      ),
    };
  });

  app.post("/api/demo/reset", async () => {
    store.reset();
    return { status: "RESET", seed: 20260711 };
  });

  return app;
}

function getMandate(store: InMemoryStore, id: string): Mandate {
  const mandate = store.mandates.get(id);
  if (!mandate) throw new ApiError(404, "MANDATE_NOT_FOUND", "Nie znaleziono mandatu.");
  return mandate;
}

function getRun(store: InMemoryStore, id: string): Run {
  const run = store.runs.get(id);
  if (!run) throw new ApiError(404, "RUN_NOT_FOUND", "Nie znaleziono runu.");
  return run;
}

function findDecision(store: InMemoryStore, decisionId: string): { run: Run; decision: Decision } {
  for (const run of store.runs.values()) {
    const decision = run.decisions.find((candidate) => candidate.id === decisionId);
    if (decision) return { run, decision };
  }
  throw new ApiError(404, "DECISION_NOT_FOUND", "Nie znaleziono decyzji.");
}

function isClientHttpError(error: unknown): error is Error & { statusCode: number } {
  if (!(error instanceof Error) || !("statusCode" in error)) return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500;
}
