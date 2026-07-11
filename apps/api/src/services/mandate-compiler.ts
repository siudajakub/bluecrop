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
    const size = input.brief.match(/(?:rozmiar|size)\s*(?:EU\s*)?(\d{2})/i)?.[1];
    const limit = input.brief.match(/(?:maksymalnie|max(?:imum)?|do)\s*(\d+(?:[.,]\d+)?)\s*(EUR|GBP|USD|PLN)/i);
    const query = input.brief.split(",")[0]?.trim() || input.brief.trim();
    const lower = input.brief.toLocaleLowerCase();
    const ambiguities: MandateDraft["ambiguities"] = [];
    if (!size) ambiguities.push({ field: "product.size", code: "REQUIRED", question: "Jaki rozmiar ma mieć produkt?" });
    if (!limit) ambiguities.push({ field: "maxTotal", code: "REQUIRED", question: "Jaki jest maksymalny koszt z dostawą?" });

    return MandateDraftSchema.parse({
      product: {
        query,
        size: normalizeSize(size ?? null),
        condition: lower.includes("używan") || lower.includes("used") ? "USED" : "NEW",
      },
      maxTotal: limit
        ? { amountMinor: Math.round(Number(limit[1]?.replace(",", ".")) * 100), currency: limit[2]?.toUpperCase() }
        : null,
      sellerPolicy: { allowResellers: !(lower.includes("bez reseller") || lower.includes("no reseller")) },
      autonomy: lower.includes("automatycz") || lower.includes("auto-buy")
        ? "AUTO_BUY_IF_LOW_STOCK"
        : lower.includes("zapytaj") || lower.includes("ask")
          ? "ASK_BEFORE_BUY"
          : "ALERT_ONLY",
      ambiguities,
    });
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
          "Wyodrębnij wyłącznie mandat zakupowy. Nie licz kosztów i nie podejmuj decyzji zakupowej. " +
          "Gdy brakuje rozmiaru albo limitu całkowitego, ustaw null i dodaj ambiguity. " +
          "Rozmiar buta zapisuj w kanonicznym formacie EU, na przykład 'EU 43'. " +
          "Nie zgaduj brakujących warunków.",
        input: JSON.stringify(input),
        text: { format: zodTextFormat(MandateDraftSchema, "mandate_draft") },
      });
      if (!response.output_parsed) {
        throw new ApiError(422, "MANDATE_COMPILER_REFUSED", "Model nie zwrócił mandatu zgodnego ze schematem.");
      }
      const parsed = MandateDraftSchema.parse(response.output_parsed);
      return MandateDraftSchema.parse({
        ...parsed,
        product: { ...parsed.product, size: normalizeSize(parsed.product.size) },
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "MANDATE_COMPILER_UNAVAILABLE", "Kompilator mandatu jest chwilowo niedostępny.");
    }
  }
}

function normalizeSize(size: string | null): string | null {
  if (!size) return null;
  const trimmed = size.trim();
  const bare = trimmed.match(/^(\d{2})$/)?.[1];
  if (bare) return `EU ${bare}`;
  const european = trimmed.match(/^EU\s*(\d{2})$/i)?.[1];
  return european ? `EU ${european}` : trimmed;
}
