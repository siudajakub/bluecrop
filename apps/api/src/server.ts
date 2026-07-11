import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { FixtureMandateCompiler, OpenAIMandateCompiler } from "./services/mandate-compiler.js";
import { OpenAIOfferScraper } from "./services/offer-scraper.js";

const config = loadConfig();
if (config.compilerMode === "openai" && !config.openAIApiKey) {
  throw new Error("OPENAI_API_KEY is required when MANDATE_COMPILER_MODE=openai");
}
if (config.offerScraperMode === "openai" && !config.openAIApiKey) {
  throw new Error("OPENAI_API_KEY is required when OFFER_SCRAPER_MODE=openai");
}
const compiler = config.compilerMode === "openai"
  ? new OpenAIMandateCompiler(config.openAIApiKey!, config.openAIModel)
  : new FixtureMandateCompiler();
const offerScraper = config.offerScraperMode === "openai"
  ? new OpenAIOfferScraper({
      apiKey: config.openAIApiKey!,
      model: config.openAIModel,
      allowedHosts: config.scraperAllowedHosts,
      maxHtmlBytes: config.scraperMaxHtmlBytes,
    })
  : undefined;

const app = await buildApp({ config, compiler, ...(offerScraper ? { offerScraper } : {}), logger: true });
await app.listen({ port: config.port, host: config.host });
