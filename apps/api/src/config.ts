import "dotenv/config";

export type AppConfig = {
  port: number;
  host: string;
  webOrigin: string;
  compilerMode: "fixture" | "openai";
  openAIApiKey?: string;
  openAIModel: string;
  openAIRealtimeModel: string;
  offerEnrichmentMode: "disabled" | "html";
  offerEnrichmentAllowedHosts: string[];
  offerEnrichmentMaxHtmlBytes: number;
  offerScraperMode: "disabled" | "openai";
  scraperAllowedHosts: string[];
  scraperMaxHtmlBytes: number;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const compilerMode = env.MANDATE_COMPILER_MODE === "fixture"
    ? "fixture"
    : env.MANDATE_COMPILER_MODE === "openai" || env.OPENAI_API_KEY
      ? "openai"
      : "fixture";
  const base = {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? "127.0.0.1",
    webOrigin: env.WEB_ORIGIN ?? "http://localhost:3000",
    compilerMode,
    openAIModel: env.OPENAI_MODEL ?? "gpt-5.6-luna",
    openAIRealtimeModel: env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1",
    offerEnrichmentMode: env.OFFER_ENRICHMENT_MODE === "disabled" ? "disabled" : "html",
    offerEnrichmentAllowedHosts: (env.OFFER_ENRICHMENT_ALLOWED_HOSTS ?? "")
      .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean),
    offerEnrichmentMaxHtmlBytes: Number(env.OFFER_ENRICHMENT_MAX_HTML_BYTES ?? 250_000),
    offerScraperMode: env.OFFER_SCRAPER_MODE === "openai" ? "openai" : "disabled",
    scraperAllowedHosts: (env.SCRAPER_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLocaleLowerCase())
      .filter(Boolean),
    scraperMaxHtmlBytes: Number(env.SCRAPER_MAX_HTML_BYTES ?? 1_000_000),
  } satisfies Omit<AppConfig, "openAIApiKey">;
  return env.OPENAI_API_KEY ? { ...base, openAIApiKey: env.OPENAI_API_KEY } : base;
}
