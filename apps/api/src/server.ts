import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { FixtureMandateCompiler, OpenAIMandateCompiler } from "./services/mandate-compiler.js";

const config = loadConfig();
if (config.compilerMode === "openai" && !config.openAIApiKey) {
  throw new Error("OPENAI_API_KEY is required when MANDATE_COMPILER_MODE=openai");
}
const compiler = config.compilerMode === "openai"
  ? new OpenAIMandateCompiler(config.openAIApiKey!, config.openAIModel)
  : new FixtureMandateCompiler();

const app = await buildApp({ config, compiler, logger: true });
await app.listen({ port: config.port, host: config.host });
