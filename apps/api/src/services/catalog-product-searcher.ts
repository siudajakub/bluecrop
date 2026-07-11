import { readFile } from "node:fs/promises";
import type {
  Currency,
  ProductRecommendation,
  ProductSearchRequest,
  ProductSearchResponse,
} from "../../../../packages/contracts/src/index.js";
import type { ProductSearcher } from "./product-searcher.js";

type CatalogOffer = {
  id: string;
  category: string | null;
  productName: string;
  store: string;
  price: number;
  currency: Currency;
  deliveryPrice: number | null;
  deliveryDays: number | null;
  url: string;
  imgUrl: string | null;
};

export class CatalogAndWebProductSearcher implements ProductSearcher {
  readonly kind = "openai" as const;

  constructor(private readonly webSearcher: ProductSearcher) {}

  async search(input: ProductSearchRequest): Promise<Omit<ProductSearchResponse, "searcher">> {
    const catalog = await loadCatalog();
    const local = rankCatalog(catalog, input).slice(0, 4);
    const webResult = await this.webSearcher.search(input).catch(() => ({
      recommendations: [] as ProductRecommendation[],
      searchedCategories: input.plan.categories.map((category) => category.name),
    }));
    const merged = dedupe([...local, ...webResult.recommendations]);
    const budget = extractBudget(input);
    const recommendations = (budget === null ? merged : merged.filter((item) => isWithinBudget(item.price, budget, input.baseCurrency))).slice(0, 8);

    return {
      recommendations,
      searchedCategories: [...new Set([...input.plan.categories.map((item) => item.name), ...webResult.searchedCategories])],
      searchActivity: {
        catalogOffersScanned: catalog.length,
        catalogMatches: local.length,
        webMatches: webResult.recommendations.length,
        sources: ["product_offers.json", "scraper snapshot", "OpenAI web search"],
        rejectedAsIrrelevant: Math.max(0, catalog.length - local.length),
        withinBudgetMatches: recommendations.length,
      },
    };
  }
}

async function loadCatalog(): Promise<CatalogOffer[]> {
  const raw = await readFile("product_offers.json", "utf8");
  return JSON.parse(raw) as CatalogOffer[];
}

function rankCatalog(offers: CatalogOffer[], input: ProductSearchRequest): ProductRecommendation[] {
  const intent = normalize([
    input.plan.goal,
    input.plan.summary,
    ...input.plan.categories.flatMap((category) => [category.name, category.query]),
    ...input.plan.parameters.map((parameter) => parameter.value),
  ].join(" "));
  const tokens = new Set(intent.split(/\s+/).filter((token) => token.length >= 3));
  const wantedCategories = new Set(input.plan.categories.flatMap((category) => categoryAliases(normalize(`${category.name} ${category.query}`))));

  return offers
    .filter((offer) => isProductEligible(offer, intent))
    .map((offer) => {
      const haystack = normalize(`${offer.category ?? ""} ${offer.productName}`);
      const tokenHits = [...tokens].filter((token) => haystack.includes(token)).length;
      const categoryHit = offer.category ? wantedCategories.has(normalize(offer.category)) : false;
      const noisePenalty = /t-shirt|shirt|jumper|charm|toy|book|holder|koszul|zabaw|książ/i.test(offer.productName)
        && !/(t-shirt|shirt|jumper|charm|toy|book|holder|koszul|zabaw|książ)/i.test(intent) ? 8 : 0;
      return { offer, score: tokenHits + (categoryHit ? 6 : 0) - noisePenalty };
    })
    .filter(({ score }) => score >= 3)
    .sort((a, b) => b.score - a.score || a.offer.price - b.offer.price)
    .map(({ offer }) => ({
      name: offer.productName,
      category: offer.category ?? "Produkt",
      price: new Intl.NumberFormat("en", { style: "currency", currency: input.baseCurrency }).format(convertCurrency(offer.price, offer.currency, input.baseCurrency)),
      seller: offer.store,
      url: offer.url,
      imageUrl: normalizeImageUrl(offer.imgUrl),
      whyItFits: "Matched in the verified offer catalog from the latest scraper run.",
      tradeoffs: [
        ...(offer.deliveryPrice === null ? ["Delivery cost needs confirmation"] : []),
        ...(offer.deliveryDays === null ? ["Delivery time needs confirmation"] : [`Delivery in about ${offer.deliveryDays} days`]),
      ],
      deliveryEstimate: offer.deliveryDays === null ? "Confirm with seller" : `${offer.deliveryDays} days`,
    }));
}

const PLN_PER_UNIT: Record<Currency, number> = { PLN: 1, EUR: 4.28, USD: 3.92, GBP: 5.08 };

function convertCurrency(amount: number, from: Currency, to: Currency): number {
  return Math.round(((amount * PLN_PER_UNIT[from]) / PLN_PER_UNIT[to]) * 100) / 100;
}

function isProductEligible(offer: CatalogOffer, intent: string): boolean {
  const name = normalize(offer.productName);
  if (/gitar|guitar/.test(intent)) {
    if (!/gitar|guitar/.test(name)) return false;
    if (/t-shirt|shirt|jumper|charm|brooch|toy|book|holder|koszul|zabaw|ksiaz|brosz|zawieszk/.test(name)) return false;
    if (/elektr|electric/.test(intent) && !/elektr|electric/.test(name)) return false;
    if (/akust|acoustic/.test(intent) && !/akust|acoustic/.test(name)) return false;
  }
  return true;
}

function categoryAliases(value: string): string[] {
  const aliases = [value];
  if (/gitar|guitar/.test(value)) aliases.push("guitar");
  if (/elektron|laptop|komputer|telefon|headphone|słuchawk/.test(value)) aliases.push("electronics");
  if (/sport|rower|fitness/.test(value)) aliases.push("sports");
  if (/dom|kuch|home|kitchen/.test(value)) aliases.push("home", "home-kitchen");
  if (/narzęd|tool/.test(value)) aliases.push("tools");
  if (/zabaw|toy/.test(value)) aliases.push("toys");
  if (/książ|book/.test(value)) aliases.push("books");
  return aliases;
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function normalizeImageUrl(value: string | null): string | null {
  if (!value) return null;
  const nested = value.match(/\[(https?:\/\/[^\]]+)\]/)?.[1];
  const candidate = nested ?? value;
  try { return new URL(candidate).href; } catch { return null; }
}

function dedupe(items: ProductRecommendation[]): ProductRecommendation[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.url}|${normalize(item.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractBudget(input: ProductSearchRequest): number | null {
  const text = `${input.plan.summary} ${input.plan.parameters.map((item) => item.value).join(" ")}`;
  const code = input.baseCurrency.toLocaleLowerCase();
  const after = text.match(new RegExp(`(?:${code}|zł|€|\\$|£)\\s*([\\d ,.]+)`, "i"))?.[1];
  const before = text.match(new RegExp(`([\\d ,.]+)\\s*(?:${code}|zł|€|\\$|£)`, "i"))?.[1];
  return parseNumericAmount(after ?? before ?? "");
}

function isWithinBudget(price: string, budget: number, currency: Currency): boolean {
  const symbols: Record<Currency, RegExp> = {
    PLN: /PLN|zł/i, EUR: /EUR|€/i, USD: /USD|\$/i, GBP: /GBP|£/i,
  };
  if (!symbols[currency].test(price)) return true;
  const amount = parseNumericAmount(price.replace(symbols[currency], ""));
  return amount === null || amount <= budget;
}

function parseNumericAmount(value: string): number | null {
  const raw = value.replace(/[^\d.,]/g, "");
  if (!raw) return null;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  const decimalLooksReal = decimalIndex >= 0 && raw.length - decimalIndex - 1 <= 2;
  const normalized = decimalLooksReal
    ? `${raw.slice(0, decimalIndex).replace(/[.,]/g, "")}.${raw.slice(decimalIndex + 1)}`
    : raw.replace(/[.,]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}
