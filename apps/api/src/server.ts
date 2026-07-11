import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { FixtureMandateCompiler, OpenAIMandateCompiler } from "./services/mandate-compiler.js";
import { FixtureProductInterviewer, OpenAIProductInterviewer } from "./services/product-interviewer.js";
import { FixtureProductSearcher, OpenAIProductSearcher } from "./services/product-searcher.js";
import { SafeHtmlOfferPageEnricher } from "./services/offer-page-enricher.js";

const config = loadConfig();
if (config.compilerMode === "openai" && !config.openAIApiKey) {
  throw new Error("OPENAI_API_KEY is required when MANDATE_COMPILER_MODE=openai");
}
const compiler = config.compilerMode === "openai"
  ? new OpenAIMandateCompiler(config.openAIApiKey!, config.openAIModel)
  : new FixtureMandateCompiler();
const interviewer = config.compilerMode === "openai"
  ? new OpenAIProductInterviewer(config.openAIApiKey!, config.openAIModel)
  : new FixtureProductInterviewer();
const pageEnricher = config.offerEnrichmentMode === "html"
  ? new SafeHtmlOfferPageEnricher({
      allowedHosts: config.offerEnrichmentAllowedHosts,
      maxHtmlBytes: config.offerEnrichmentMaxHtmlBytes,
    })
  : undefined;
const searcher = config.compilerMode === "openai"
  ? new OpenAIProductSearcher(config.openAIApiKey!, config.openAIModel, pageEnricher)
  : new FixtureProductSearcher();

const app = await buildApp({ config, compiler, interviewer, searcher, logger: true });
await app.listen({ port: config.port, host: config.host });
