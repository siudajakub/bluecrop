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
    this.client = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 0 });
  }

  async search(input: ProductSearchRequest): Promise<Omit<ProductSearchResponse, "searcher">> {
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
          "Find currently available products for every required category in the purchase plan. " +
          "Return only real products found on live sources with a direct product or listing URL. " +
          "Search broadly across at least three distinct retailer domains, using local-language shopping queries for the destination country. " +
          "Prioritize retailer product pages and marketplace listings; exclude social media, video, music, forums, wikis, and editorial pages. " +
          "Respect every required parameter. Never invent a price, seller, delivery time, image, or URL. " +
          "The structured maxTotal field, when present, is the authoritative hard cap and overrides any older amount in plan text. " +
          "The hard cap includes product price, delivery, fees, and taxes. Never return an offer whose known total exceeds maxTotal. " +
          "Prefer a verified delivered total. If delivery cost is not published, use the exact listed product price only when it is comfortably below maxTotal and add 'Delivery cost needs confirmation' to tradeoffs. " +
          `Return each price as one exact numeric amount followed by ${input.baseCurrency}; never return a range or a 'from' price. ` +
          "If the source provides a delivery date, return it in deliveryEstimate; otherwise use null. " +
          "whyItFits must be one polished English sentence of at most 14 words. Each tradeoff must be at most 8 words. " +
          "Return 3-6 best offers total. Write every user-facing field in English.",
        input: JSON.stringify(input),
        text: { format: zodTextFormat(SearchResultSchema, "product_search_results") },
      });
      if (!response.output_parsed) throw new Error("missing parsed search result");
      const parsed = SearchResultSchema.parse(response.output_parsed);
      const directRecommendations = parsed.recommendations.filter((item) => isDirectProductUrl(item.url));
      const imageResults = extractImageResults(response.output as unknown[]);
      const enrichedRecommendations = await Promise.all(directRecommendations.map(async (item) => ({
        ...item,
        // The exact listing page is authoritative. Search-result thumbnails can
        // be stale, generic, or associated with another variant.
        imageUrl: selectPreferredProductImage(
          await this.enrichImage(item.url),
          findMatchingImage(item.url, imageResults),
        ),
      })));
      const recommendations = enrichedRecommendations;
      if (!recommendations.length) {
        throw new ApiError(422, "NO_VERIFIED_PRODUCT_OFFERS", "No verified product offer with a direct link and exact price was found.");
      }
      const webSources = extractWebSources(response.output as unknown[], recommendations.map(item => item.url));
      return {
        ...parsed,
        recommendations,
        searchActivity: {
          catalogOffersScanned: 0,
          catalogMatches: 0,
          webMatches: recommendations.length,
          sources: webSources.domains,
          rejectedAsIrrelevant: 0,
          withinBudgetMatches: recommendations.length,
          recordsChecked: webSources.pageCount,
          webSourcesChecked: webSources.pageCount,
          sourceCount: webSources.pageCount,
        },
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "PRODUCT_SEARCH_UNAVAILABLE", "Product search is temporarily unavailable.");
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

function extractWebSources(output: unknown[], recommendationUrls: string[]): { domains: string[]; pageCount: number } {
  const urls = new Set(recommendationUrls);
  const visit = (value: unknown, depth: number) => {
    if (depth > 7 || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, depth + 1));
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if ((key === "url" || key === "source_website_url") && typeof nested === "string" && /^https?:\/\//i.test(nested)) {
        urls.add(nested);
      } else {
        visit(nested, depth + 1);
      }
    }
  };
  visit(output, 0);
  const domains = new Set<string>();
  for (const rawUrl of urls) {
    try {
      const domain = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
      if (!isNonShoppingSource(domain)) domains.add(domain);
    } catch { /* ignore malformed source */ }
  }
  return { domains: [...domains], pageCount: urls.size };
}

function isNonShoppingSource(domain: string): boolean {
  return [
    "youtube.com",
    "youtu.be",
    "spotify.com",
    "open.spotify.com",
    "arxiv.org",
    "fandom.com",
    "reddit.com",
  ].some(blocked => domain === blocked || domain.endsWith(`.${blocked}`));
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

export function selectPreferredProductImage(pageImage: string | null, matchingSearchImage: string | null): string | null {
  return pageImage ?? matchingSearchImage;
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
