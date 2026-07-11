import "dotenv/config";

export type AppConfig = {
  port: number;
  host: string;
  webOrigin: string;
  compilerMode: "fixture" | "openai";
  openAIApiKey?: string;
  openAIModel: string;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const compilerMode = env.MANDATE_COMPILER_MODE === "openai" ? "openai" : "fixture";
  const base = {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? "127.0.0.1",
    webOrigin: env.WEB_ORIGIN ?? "http://localhost:3000",
    compilerMode,
    openAIModel: env.OPENAI_MODEL ?? "gpt-5.6",
  } satisfies Omit<AppConfig, "openAIApiKey">;
  return env.OPENAI_API_KEY ? { ...base, openAIApiKey: env.OPENAI_API_KEY } : base;
}
