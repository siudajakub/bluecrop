import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
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
    const local = rankCatalog(catalog, input);
    const webResult = await searchWebUntilUsable(this.webSearcher, input);
    const intent = buildIntent(input);
    const merged = dedupe([...local, ...webResult.recommendations])
      .filter(item => isProductNameEligible(normalize(`${item.category} ${item.name}`), intent))
      .map(item => normalizeRecommendationPrice(item, input.baseCurrency))
      .filter((item): item is ProductRecommendation => item !== null);
    const budget = extractBudget(input);
    const recommendations = (budget === null ? merged : merged.filter((item) => isWithinBudget(item, budget, input.baseCurrency))).slice(0, 12);
    const webSourcesChecked = Math.max(webResult.searchActivity?.webSourcesChecked ?? 0, webResult.recommendations.length);
    const sourceLabels = [...new Set([
      "product_offers.json",
      "scraper snapshot",
      "OpenAI web search",
      ...(webResult.searchActivity?.sources ?? []),
    ])];

    return {
      recommendations,
      searchedCategories: [...new Set([...input.plan.categories.map((item) => item.name), ...webResult.searchedCategories])],
      searchActivity: {
        catalogOffersScanned: catalog.length,
        catalogMatches: local.length,
        webMatches: webResult.recommendations.length,
        sources: sourceLabels,
        rejectedAsIrrelevant: Math.max(0, catalog.length - local.length),
        withinBudgetMatches: recommendations.length,
        recordsChecked: catalog.length + webSourcesChecked,
        webSourcesChecked,
        sourceCount: 2 + webSourcesChecked,
      },
    };
  }
}

async function searchWebUntilUsable(webSearcher: ProductSearcher, input: ProductSearchRequest) {
  const recommendations: ProductRecommendation[] = [];
  const searchedCategories = new Set<string>();
  const sources = new Set<string>();
  let webSourcesChecked = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await webSearcher.search(input);
      recommendations.push(...result.recommendations);
      result.searchedCategories.forEach(category => searchedCategories.add(category));
      result.searchActivity?.sources.forEach(source => sources.add(source));
      webSourcesChecked += Math.max(
        result.searchActivity?.webSourcesChecked ?? 0,
        result.recommendations.length,
      );

      // A raw web result is not enough: it must still survive product, exact-price,
      // currency and approved all-in budget validation. Retry when it does not.
      const usableOffers = countUsableWebOffers(recommendations, input);
      if (extractBudget(input) === null ? usableOffers > 0 : usableOffers >= 3) break;
    } catch {
      // Web search and page enrichment are transient; keep any earlier valid pass.
    }
  }

  const uniqueRecommendations = dedupe(recommendations);
  return {
    recommendations: uniqueRecommendations,
    searchedCategories: searchedCategories.size
      ? [...searchedCategories]
      : input.plan.categories.map((category) => category.name),
    searchActivity: {
      catalogOffersScanned: 0,
      catalogMatches: 0,
      webMatches: uniqueRecommendations.length,
      sources: [...sources],
      rejectedAsIrrelevant: 0,
      withinBudgetMatches: countUsableWebOffers(uniqueRecommendations, input),
      recordsChecked: webSourcesChecked,
      webSourcesChecked,
      sourceCount: webSourcesChecked,
    },
  };
}

function countUsableWebOffers(items: ProductRecommendation[], input: ProductSearchRequest): number {
  const intent = buildIntent(input);
  const budget = extractBudget(input);
  return dedupe(items)
    .filter(item => isProductNameEligible(normalize(`${item.category} ${item.name}`), intent))
    .map(item => normalizeRecommendationPrice(item, input.baseCurrency))
    .filter((item): item is ProductRecommendation => item !== null)
    .filter(item => budget === null || isWithinBudget(item, budget, input.baseCurrency))
    .length;
}

async function loadCatalog(): Promise<CatalogOffer[]> {
  const candidates = [...new Set([
    resolve(process.cwd(), "product_offers.json"),
    fileURLToPath(new URL("../../product_offers.json", import.meta.url)),
    fileURLToPath(new URL("../../../../product_offers.json", import.meta.url)),
  ])];
  let lastError: unknown;
  for (const path of candidates) {
    try {
      return JSON.parse(await readFile(path, "utf8")) as CatalogOffer[];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("product_offers.json could not be loaded");
}

function rankCatalog(offers: CatalogOffer[], input: ProductSearchRequest): ProductRecommendation[] {
  const intent = buildIntent(input);
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
      price: formatPrice(convertCurrency(offer.price + (offer.deliveryPrice ?? 0), offer.currency, input.baseCurrency), input.baseCurrency),
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
  return isProductNameEligible(normalize(offer.productName), intent);
}

function isProductNameEligible(name: string, intent: string): boolean {
  if (/gitar|guitar/.test(intent)) {
    if (!/gitar|guitar/.test(name)) return false;
    if (/t-shirt|shirt|jumper|charm|brooch|toy|book|holder|koszul|zabaw|ksiaz|brosz|zawieszk/.test(name)) return false;
    if (/elektr|electric/.test(intent) && !/elektr|electric/.test(name)) return false;
    if (/akust|acoustic/.test(intent) && !/akust|acoustic/.test(name)) return false;
    const accessory = name.match(/strap|strings?|picks?|capo|tuner|cases?|bags?|stands?|cables?|amplifier|\bamp\b|pedal|pickup|hanger|pasek|strun|kostk|pokrow|stojak|wzmacniacz|kabel/);
    if (accessory && !intent.includes(accessory[0] ?? "")) return false;
  }
  return true;
}

function buildIntent(input: ProductSearchRequest): string {
  return normalize([
    input.plan.goal,
    input.plan.summary,
    ...input.plan.categories.flatMap((category) => [category.name, category.query]),
    ...input.plan.parameters.map((parameter) => parameter.value),
  ].join(" "));
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

export function extractBudget(input: ProductSearchRequest): number | null {
  if (input.maxTotal) {
    return convertCurrency(input.maxTotal.amountMinor / 100, input.maxTotal.currency, input.baseCurrency);
  }
  const code = input.baseCurrency.toLocaleLowerCase();
  const budgetParameters = input.plan.parameters.filter(item => /budget|spend|price|cost|maximum|max.*total|limit/i.test(item.name));
  const candidates = [...budgetParameters.map(item => item.value), input.plan.summary];
  for (const text of candidates) {
    const after = text.match(new RegExp(`(?:${code}|zł|€|\\$|£)\\s*(\\d[\\d ,.]*\\d|\\d)`, "i"))?.[1];
    const before = text.match(new RegExp(`(\\d[\\d ,.]*\\d|\\d)\\s*(?:${code}|zł|€|\\$|£)`, "i"))?.[1];
    const amount = parseNumericAmount(after ?? before ?? "");
    if (amount !== null && amount > 0) return amount;
    if (budgetParameters.some(parameter => parameter.value === text)) {
      const bareAmount = parseNumericAmount(text);
      if (bareAmount !== null && bareAmount > 0) return bareAmount;
    }
  }
  return null;
}

function isWithinBudget(item: ProductRecommendation, budget: number, currency: Currency): boolean {
  const parsed = parsePrice(item.price);
  if (!parsed) return false;
  const amount = convertCurrency(parsed.amount, parsed.currency, currency);
  const deliveryNeedsConfirmation = item.tradeoffs.some(tradeoff => /delivery|shipping/i.test(tradeoff) && /confirm|unknown|not included|checkout/i.test(tradeoff));
  const effectiveLimit = deliveryNeedsConfirmation ? budget * 0.9 : budget;
  return amount <= effectiveLimit;
}

function normalizeRecommendationPrice(item: ProductRecommendation, targetCurrency: Currency): ProductRecommendation | null {
  const parsed = parsePrice(item.price);
  if (!parsed) return null;
  const converted = convertCurrency(parsed.amount, parsed.currency, targetCurrency);
  return { ...item, price: formatPrice(converted, targetCurrency) };
}

export function parsePrice(price: string): { amount: number; currency: Currency } | null {
  if (/\bfrom\b|\bstarting at\b|\bod\b|[-–—]\s*\d/i.test(price)) return null;
  const currencies: Array<{ currency: Currency; pattern: RegExp }> = [
    { currency: "PLN", pattern: /PLN|zł/i },
    { currency: "EUR", pattern: /EUR|€/i },
    { currency: "USD", pattern: /USD|US\$|\$/i },
    { currency: "GBP", pattern: /GBP|£/i },
  ];
  const detected = currencies.find(({ pattern }) => pattern.test(price));
  if (!detected) return null;
  const withoutCurrency = price.replace(detected.pattern, " ");
  const numberGroups = withoutCurrency.match(/\d[\d\s.,]*/g)?.map(value => value.trim()).filter(Boolean) ?? [];
  if (numberGroups.length !== 1) return null;
  const amount = parseNumericAmount(numberGroups[0] ?? "");
  return amount !== null && amount >= 0 ? { amount, currency: detected.currency } : null;
}

function formatPrice(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
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
