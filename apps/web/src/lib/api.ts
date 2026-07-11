import type {
  CompileMandateResponse,
  Currency,
  InterviewMessage,
  InterviewResponse,
  ProductSearchResponse,
  PurchasePlan,
  Decision,
  Mandate,
  Receipt,
  RunEvent,
  ScrapeOffersResponse,
} from "@deal-hunter/contracts";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

type IdempotentMandateResponse = { mandate: Mandate; idempotentReplay: boolean };
type StartRunResponse = { runId: string; status: "RUNNING" | "COMPLETED"; eventCursor: string };
export type EventsResponse = { runId: string; status: "RUNNING" | "COMPLETED"; events: RunEvent[]; nextCursor: string };
type CheckoutResponse = { status: "COMPLETED"; purchaseId: string; receiptId: string; idempotentReplay: boolean };
export type EvalSummary = {
  runs: number;
  decisions: number;
  purchases: number;
  hardCapViolations: number;
  duplicateBuys: number;
  falseBuyRate: number;
  decisionCounts: Record<Decision["action"], number>;
};

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly reasonCodes: string[] = [],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, acceptedErrors: number[] = []): Promise<T> {
  const headers = init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    ...(headers ? { headers } : {}),
  });
  const data = await response.json() as T & {
    error?: { code: string; message: string; reasonCodes?: string[] };
  };
  if (!response.ok && !acceptedErrors.includes(response.status)) {
    throw new ApiClientError(
      data.error?.code ?? "REQUEST_FAILED",
      data.error?.message ?? `Żądanie zakończyło się statusem ${response.status}.`,
      data.error?.reasonCodes,
    );
  }
  return data;
}

export type CompileMandateOptions = { baseCurrency?: Currency; destinationCountry?: string };

export function compileMandate(brief: string, options: CompileMandateOptions = {}) {
  return request<CompileMandateResponse>(
    "/api/mandates/compile",
    {
      method: "POST",
      body: JSON.stringify({
        brief,
        baseCurrency: options.baseCurrency ?? "EUR",
        destinationCountry: options.destinationCountry ?? "PL",
      }),
    },
    [422],
  );
}

export function respondToInterview(messages: InterviewMessage[]) {
  return request<InterviewResponse>("/api/interviews/respond", {
    method: "POST",
    body: JSON.stringify({ messages, baseCurrency: "EUR", destinationCountry: "PL" }),
  });
}

export function getRealtimeToken() {
  return request<{ value: string; expiresAt?: number; model: string }>("/api/realtime/token", { method: "POST" });
}

export function searchProducts(plan: PurchasePlan) {
  return request<ProductSearchResponse>("/api/products/search", {
    method: "POST",
    body: JSON.stringify({ plan, destinationCountry: "PL" }),
  });
}

export function approveMandate(mandate: Mandate) {
  return request<IdempotentMandateResponse>(`/api/mandates/${mandate.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: mandate.version, idempotencyKey: crypto.randomUUID() }),
  });
}

export function revokeMandate(mandate: Mandate) {
  return request<IdempotentMandateResponse>(`/api/mandates/${mandate.id}/revoke`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: mandate.version, idempotencyKey: crypto.randomUUID() }),
  });
}

export function startRun(mandateId: string) {
  return request<StartRunResponse>("/api/runs", {
    method: "POST",
    body: JSON.stringify({ mandateId, scenarioId: "golden-path", seed: 20260711, idempotencyKey: crypto.randomUUID() }),
  });
}

export function pollEvents(runId: string, cursor: string, signal?: AbortSignal) {
  return request<EventsResponse>(`/api/runs/${runId}/events?after=${cursor}`, signal ? { signal } : undefined);
}

export function mutateWinner(runId: string, offerId: string) {
  return request<{ nextCursor: string }>(`/api/runs/${runId}/mutations`, {
    method: "POST",
    body: JSON.stringify({ type: "PRICE_CHANGED", offerId, amountMinor: 7900 }),
  });
}

export function checkoutDecision(decision: Decision, idempotencyKey: string) {
  return request<CheckoutResponse>(`/api/decisions/${decision.id}/checkout`, {
    method: "POST",
    body: JSON.stringify({
      mandateVersion: decision.mandateVersion,
      offerVersion: decision.offerVersion,
      idempotencyKey,
    }),
  });
}

export function getReceipt(receiptId: string) {
  return request<Receipt>(`/api/receipts/${receiptId}`);
}

export function getEvalSummary() {
  return request<EvalSummary>("/api/evals/summary");
}

export function resetDemo() {
  return request<{ status: "RESET"; seed: number }>("/api/demo/reset", { method: "POST" });
}

export function scrapeOffers(urls: string[]) {
  return request<ScrapeOffersResponse>("/api/offers/scrape", {
    method: "POST",
    body: JSON.stringify({ urls }),
  });
}
