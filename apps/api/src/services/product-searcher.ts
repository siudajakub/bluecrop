import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ProductSearchRequest, ProductSearchResponse } from "../../../../packages/contracts/src/index.js";
import { ProductRecommendationSchema } from "../../../../packages/contracts/src/index.js";
import { ApiError } from "../errors.js";
import type { OfferPageEnricher } from "./offer-page-enricher.js";

const ModelRecommendationSchema = ProductRecommendationSchema.omit({ imageUrl: true });
const SearchResultSchema = z.object({
  recommendations: z.array(ModelRecommendationSchema).min(1).max(8),
  searchedCategories: z.array(z.string()).min(1),
});

export interface ProductSearcher {
  readonly kind: "fixture" | "openai";
  search(input: ProductSearchRequest): Promise<Omit<ProductSearchResponse, "searcher">>;
}

export class OpenAIProductSearcher implements ProductSearcher {
  readonly kind = "openai" as const;
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string, private readonly pageEnricher?: OfferPageEnricher) {
    this.client = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 1 });
  }

  async search(input: ProductSearchRequest, attempt = 0): Promise<Omit<ProductSearchResponse, "searcher">> {
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        reasoning: { effort: "low" },
        tools: [{
          type: "web_search",
          search_context_size: "medium",
          search_content_types: ["image", "text"],
          image_settings: { max_results: 8, caption: true },
          user_location: { type: "approximate", country: input.destinationCountry },
        }],
        include: ["web_search_call.results"],
        tool_choice: "required",
        instructions:
          "Wyszukaj aktualnie dostępne produkty dla każdej wymaganej kategorii planu. " +
          "Podawaj wyłącznie realne produkty znalezione w sieci, z bezpośrednim URL-em źródła/oferty. " +
          "Porównaj je z wymaganymi i preferowanymi parametrami. Nie wymyślaj cen, sprzedawców ani URL-i. " +
          "Zwróć 3-6 najlepszych propozycji łącznie, uwzględniając konieczne kategorie uzupełniające. Odpowiadaj po polsku.",
        input: JSON.stringify(input),
        text: { format: zodTextFormat(SearchResultSchema, "product_search_results") },
      });
      if (!response.output_parsed) throw new Error("missing parsed search result");
      const parsed = SearchResultSchema.parse(response.output_parsed);
      const directRecommendations = parsed.recommendations.filter((item) => isDirectProductUrl(item.url));
      const imageResults = extractImageResults(response.output as unknown[]);
      const enrichedRecommendations = await Promise.all(directRecommendations.map(async (item) => ({
        ...item,
        imageUrl: findMatchingImage(item.url, imageResults) ?? await this.enrichImage(item.url),
      })));
      const recommendations = enrichedRecommendations.filter((item) => item.imageUrl !== null);
      if (!recommendations.length) {
        if (attempt < 2) return this.search(input, attempt + 1);
        throw new ApiError(422, "NO_VERIFIED_PRODUCT_OFFERS", "Nie znaleziono dostępnych ofert z bezpośrednim linkiem i zdjęciem produktu. Spróbuj ponownie później.");
      }
      return { ...parsed, recommendations };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "PRODUCT_SEARCH_UNAVAILABLE", "Wyszukiwanie produktów jest chwilowo niedostępne.");
    }
  }

  private async enrichImage(listingUrl: string): Promise<string | null> {
    if (!this.pageEnricher) return null;
    try {
      return (await this.pageEnricher.enrich(listingUrl)).imageUrl;
    } catch {
      return null;
    }
  }
}

export function isDirectProductUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || isPrivateHostname(url.hostname)) return false;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");

    if (host === "olx.pl" || host.endsWith(".olx.pl")) {
      return path.includes("/d/oferta/");
    }
    if (host === "allegro.pl" || host.endsWith(".allegro.pl")) {
      return path.includes("/oferta/");
    }
    if (host === "allegrolokalnie.pl" || host.endsWith(".allegrolokalnie.pl")) {
      return path.includes("/oferta/");
    }
    if (["google.com", "google.pl", "bing.com", "duckduckgo.com"].some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return false;
    }
    if (!path || ["/search", "/szukaj", "/oferty", "/products", "/produkty"].includes(path)) return false;
    return !["q", "query", "search", "keyword"].some((key) => url.searchParams.has(key));
  } catch {
    return false;
  }
}

type WebImageResult = { imageUrl: string; thumbnailUrl: string | null; sourceUrl: string };

function extractImageResults(output: unknown[]): WebImageResult[] {
  const images: WebImageResult[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const results = (item as { results?: unknown[] }).results;
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      if (!result || typeof result !== "object") continue;
      const candidate = result as Record<string, unknown>;
      if (candidate.type !== "image_result" || typeof candidate.image_url !== "string" || typeof candidate.source_website_url !== "string") continue;
      images.push({
        imageUrl: candidate.image_url,
        thumbnailUrl: typeof candidate.thumbnail_url === "string" ? candidate.thumbnail_url : null,
        sourceUrl: candidate.source_website_url,
      });
    }
  }
  return images;
}

function findMatchingImage(listingUrl: string, images: WebImageResult[]): string | null {
  const listing = comparableUrl(listingUrl);
  const match = images.find((image) => comparableUrl(image.sourceUrl) === listing);
  return match?.thumbnailUrl ?? match?.imageUrl ?? null;
}

export function extractOpenGraphImage(html: string, pageUrl: string): string | null {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/(?:property|name)=["'](?:og:image|twitter:image)(?::url)?["']/i.test(tag)) continue;
    const contentMatch = tag.match(/content\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/i);
    const content = contentMatch?.[1] ?? contentMatch?.[2];
    if (!content) continue;
    try {
      const imageUrl = new URL(content.replace(/&amp;/g, "&"), pageUrl);
      if (["http:", "https:"].includes(imageUrl.protocol) && !isPrivateHostname(imageUrl.hostname)) return imageUrl.toString();
    } catch { /* ignore malformed metadata */ }
  }
  return null;
}

function comparableUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return "";
  }
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "::1" || host.endsWith(".local") || /^127\./.test(host) || /^10\./.test(host)
    || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

export class FixtureProductSearcher implements ProductSearcher {
  readonly kind = "fixture" as const;
  async search(input: ProductSearchRequest): Promise<Omit<ProductSearchResponse, "searcher">> {
    return {
      searchedCategories: input.plan.categories.map((category) => category.name),
      recommendations: [{
        name: "Przykładowy produkt — włącz tryb OpenAI",
        category: input.plan.categories[0]?.name ?? "Produkt",
        price: "—",
        seller: "Fixture",
        url: "https://example.com",
        imageUrl: null,
        whyItFits: "Rekord testowy zachowujący kontrakt offline.",
        tradeoffs: ["Brak wyszukiwania na żywo"],
      }],
    };
  }
}
