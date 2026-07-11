import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ScenarioSchema, type Scenario } from "../../../packages/contracts/src/index.js";

const allowedScenarios = new Set(["golden-path", "uk-currency-trap", "fake-discount"]);

export function loadScenario(scenarioId: string): Scenario {
  if (!allowedScenarios.has(scenarioId)) throw new Error(`Unknown scenario: ${scenarioId}`);
  const path = resolve(process.cwd(), "fixtures", "scenarios", `${scenarioId}.json`);
  return ScenarioSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
