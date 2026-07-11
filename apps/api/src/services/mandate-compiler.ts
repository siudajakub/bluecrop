import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  MandateDraftSchema,
  type CompileMandateRequest,
  type MandateDraft,
} from "../../../../packages/contracts/src/index.js";
import { ApiError } from "../errors.js";

export interface MandateCompiler {
  readonly kind: "fixture" | "openai";
  compile(input: CompileMandateRequest): Promise<MandateDraft>;
}

export class FixtureMandateCompiler implements MandateCompiler {
  readonly kind = "fixture" as const;

  async compile(input: CompileMandateRequest): Promise<MandateDraft> {
    const size = input.brief.match(/size\s*(?:EU\s*)?(\d{2})/i)?.[1];
    const limit = input.brief.match(/(?:max(?:imum)?|up to)\s*(\d+(?:[.,]\d+)?)\s*(EUR|GBP|USD|PLN)/i);
    const deadline = input.brief.match(/\bby\s+(\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
    const query = input.brief.split(",")[0]?.trim() || input.brief.trim();
    const lower = input.brief.toLocaleLowerCase();
    const ambiguities: MandateDraft["ambiguities"] = [];
    const needsSize = /(?:but|shoe|nike|adidas|sneaker)/i.test(input.brief);
    if (needsSize && !size) ambiguities.push({ field: "product.size", code: "REQUIRED", question: "What size should the product be?" });
    if (!limit) ambiguities.push({ field: "maxTotal", code: "REQUIRED", question: "What is the maximum total cost including delivery?" });

    const draft = MandateDraftSchema.parse({
      product: {
        query,
        size: normalizeSize(size ?? null),
        condition: /\bused\b/.test(lower) ? "USED" : "NEW",
      },
      maxTotal: limit
        ? { amountMinor: Math.round(Number(limit[1]?.replace(",", ".")) * 100), currency: limit[2]?.toUpperCase() }
        : null,
      purchaseBy: deadline,
      sellerPolicy: { allowResellers: !(lower.includes("no reseller") || lower.includes("without reseller")) },
      autonomy: lower.includes("auto-buy") || lower.includes("auto buy") || lower.includes("automatic")
        ? "AUTO_BUY_IF_LOW_STOCK"
        : lower.includes("ask")
          ? "ASK_BEFORE_BUY"
          : "ALERT_ONLY",
      ambiguities,
    });
    return applyStructuralOverrides(draft, input);
  }
}

export class OpenAIMandateCompiler implements MandateCompiler {
  readonly kind = "openai" as const;
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey, timeout: 10_000, maxRetries: 1 });
  }

  async compile(input: CompileMandateRequest): Promise<MandateDraft> {
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        instructions:
          "Extract only the purchase mandate. Do not compute costs and do not make a purchase decision. " +
          "When the total spending cap is missing, set it to null and add an ambiguity. " +
          "Require a size only for products whose variant is genuinely described by a size; otherwise leave size null without an ambiguity. " +
          "Write shoe sizes in the canonical EU format, for example 'EU 43'. " +
          "If the brief mentions a purchase deadline, set purchaseBy to that date in ISO format (YYYY-MM-DD); otherwise set purchaseBy to null. " +
          "If the request contains structural maxTotal or purchaseBy values, use them verbatim - they win over the brief. " +
          "Do not add ambiguities about seller policy or autonomy: they have safe defaults and never block approval. " +
          "Do not guess missing constraints. Always answer and phrase ambiguity questions in English.",
        input: JSON.stringify(input),
        text: { format: zodTextFormat(MandateDraftSchema, "mandate_draft") },
      });
      if (!response.output_parsed) {
        throw new ApiError(422, "MANDATE_COMPILER_REFUSED", "The model did not return a mandate matching the schema.");
      }
      const parsed = MandateDraftSchema.parse(response.output_parsed);
      const normalized = MandateDraftSchema.parse({
        ...parsed,
        product: { ...parsed.product, size: normalizeSize(parsed.product.size) },
        maxTotal: extractExplicitBudget(input.brief) ?? parsed.maxTotal,
      });
      const draft = MandateDraftSchema.parse({ ...normalized, ambiguities: unresolvedBlockingAmbiguities(normalized) });
      return applyStructuralOverrides(draft, input);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "MANDATE_COMPILER_UNAVAILABLE", "The mandate compiler is temporarily unavailable.");
    }
  }
}

export function extractExplicitBudget(brief: string): MandateDraft["maxTotal"] {
  const match = brief.match(/(?:maksymaln(?:y|a|e)|maksymalnie|budżet|budget|limit|max(?:imum)?|up to|do)\D{0,40}(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(PLN|EUR|GBP|USD|zł)/i);
  if (!match?.[1] || !match[2]) return null;
  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) return null;
  const currency = match[2].toLowerCase() === "zł" ? "PLN" : match[2].toUpperCase();
  return { amountMinor: Math.round(amount * 100), currency: currency as "PLN" | "EUR" | "GBP" | "USD" };
}

export function unresolvedBlockingAmbiguities(draft: MandateDraft): MandateDraft["ambiguities"] {
  return draft.ambiguities.filter((ambiguity) => {
    if (ambiguity.field === "maxTotal") return draft.maxTotal === null;
    if (ambiguity.field === "product.condition") return draft.product.condition === null;
    return false;
  });
}

/** Structural request fields always win over anything parsed or extracted from the brief. */
function applyStructuralOverrides(draft: MandateDraft, input: CompileMandateRequest): MandateDraft {
  let next = draft;
  if (input.maxTotal) {
    next = {
      ...next,
      maxTotal: input.maxTotal,
      ambiguities: next.ambiguities.filter((ambiguity) => ambiguity.field !== "maxTotal"),
    };
  }
  if (input.purchaseBy !== undefined) {
    next = { ...next, purchaseBy: input.purchaseBy };
  }
  return MandateDraftSchema.parse(next);
}

function normalizeSize(size: string | null): string | null {
  if (!size) return null;
  const trimmed = size.trim();
  const bare = trimmed.match(/^(\d{2})$/)?.[1];
  if (bare) return `EU ${bare}`;
  const european = trimmed.match(/^EU\s*(\d{2})$/i)?.[1];
  return european ? `EU ${european}` : trimmed;
}
