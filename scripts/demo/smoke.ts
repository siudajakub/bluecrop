import { buildApp } from "../../apps/api/src/app.js";
import { loadConfig } from "../../apps/api/src/config.js";
import { FixtureMandateCompiler } from "../../apps/api/src/services/mandate-compiler.js";

const app = await buildApp({ config: loadConfig({}), compiler: new FixtureMandateCompiler() });
try {
  const compile = await app.inject({
    method: "POST",
    url: "/api/mandates/compile",
    payload: {
      brief: "Nike Dunk Low, rozmiar 43, nowe, bez resellerów, maksymalnie 80 EUR z dostawą, kup automatycznie przy niskim stanie",
      baseCurrency: "EUR",
      destinationCountry: "PL"
    }
  });
  if (compile.statusCode !== 200) throw new Error(compile.body);
  const mandate = compile.json().mandate;
  const approve = await app.inject({ method: "POST", url: `/api/mandates/${mandate.id}/approve`, payload: { expectedVersion: 1, idempotencyKey: "smoke-approve" } });
  if (approve.statusCode !== 200) throw new Error(approve.body);
  const started = await app.inject({ method: "POST", url: "/api/runs", payload: { mandateId: mandate.id, scenarioId: "golden-path", seed: 20260711, idempotencyKey: "smoke-run" } });
  if (started.statusCode !== 201) throw new Error(started.body);
  const run = started.json();
  const polled = await app.inject({ method: "GET", url: `/api/runs/${run.runId}/events?after=0` });
  const decisions = polled.json().events.filter((event: { type: string }) => event.type === "DECISION_MADE");
  const winner = decisions.map((event: { data: { action: string } }) => event.data).find((decision: { action: string }) => decision.action === "AUTO_BUY");
  if (!winner) throw new Error("AUTO_BUY decision missing");
  const checkout = await app.inject({ method: "POST", url: `/api/decisions/${winner.id}/checkout`, payload: { mandateVersion: winner.mandateVersion, offerVersion: winner.offerVersion, idempotencyKey: "smoke-checkout" } });
  if (checkout.statusCode !== 200) throw new Error(checkout.body);
  console.log(JSON.stringify({ status: "PASS", decisions: decisions.map((event: { data: { action: string } }) => event.data.action), checkout: checkout.json() }, null, 2));
} finally {
  await app.close();
}
