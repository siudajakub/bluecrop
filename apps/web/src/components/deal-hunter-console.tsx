"use client";

import type {
  CanonicalOffer,
  CompileMandateResponse,
  Decision,
  Mandate,
  Money,
  Receipt,
  RunEvent,
} from "@deal-hunter/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  API_URL,
  ApiClientError,
  approveMandate,
  checkoutDecision,
  compileMandate,
  getEvalSummary,
  getReceipt,
  mutateWinner,
  pollEvents,
  resetDemo,
  revokeMandate,
  startRun,
  type EvalSummary,
} from "@/lib/api";

const DEFAULT_BRIEF =
  "Nike Dunk Low, rozmiar 43, nowe, bez resellerów, maksymalnie 80 EUR z dostawą, kup automatycznie przy niskim stanie magazynowym";

type BusyAction = "compile" | "approve" | "run" | "mutate" | "checkout" | "revoke" | "reset" | null;

export function DealHunterConsole() {
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [compiled, setCompiled] = useState<CompileMandateResponse | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [metrics, setMetrics] = useState<EvalSummary | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mutationApplied, setMutationApplied] = useState(false);
  const checkoutKey = useRef(crypto.randomUUID());
  const cursor = useRef("0");

  const decisions = useMemo(
    () => events.filter((event) => event.type === "DECISION_MADE").map((event) => event.data as unknown as Decision),
    [events],
  );
  const winner = decisions.find((decision) => decision.action === "AUTO_BUY") ?? null;
  const mandate = compiled?.mandate ?? null;

  useEffect(() => {
    if (!runId) return;
    const activeRunId = runId;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function syncTimeline() {
      try {
        const response = await pollEvents(activeRunId, cursor.current, controller.signal);
        cursor.current = response.nextCursor;
        setEvents((current) => mergeEvents(current, response.events));
        if (response.status === "RUNNING") {
          timer = setTimeout(syncTimeline, 700);
        } else {
          setBusy(null);
          setMetrics(await getEvalSummary());
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(toMessage(error));
          setBusy(null);
        }
      }
    }

    void syncTimeline();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  async function handleCompile() {
    setBusy("compile");
    setMessage(null);
    setReceipt(null);
    setRunId(null);
    setEvents([]);
    cursor.current = "0";
    try {
      const response = await compileMandate(brief);
      setCompiled(response);
      if (response.ambiguities.length) setMessage("Uzupełnij brief i skompiluj mandat ponownie.");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove() {
    if (!mandate) return;
    setBusy("approve");
    setMessage(null);
    try {
      const response = await approveMandate(mandate);
      setCompiled((current) => current ? { ...current, mandate: response.mandate } : current);
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleStartRun() {
    if (!mandate) return;
    setBusy("run");
    setMessage(null);
    setEvents([]);
    setReceipt(null);
    setMutationApplied(false);
    cursor.current = "0";
    checkoutKey.current = crypto.randomUUID();
    try {
      const response = await startRun(mandate.id);
      setRunId(response.runId);
    } catch (error) {
      setMessage(toMessage(error));
      setBusy(null);
    }
  }

  async function handleMutation() {
    if (!runId || !winner) return;
    setBusy("mutate");
    setMessage(null);
    try {
      await mutateWinner(runId, winner.offerId);
      const response = await pollEvents(runId, cursor.current);
      cursor.current = response.nextCursor;
      setEvents((current) => mergeEvents(current, response.events));
      setMutationApplied(true);
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleCheckout() {
    if (!winner) return;
    setBusy("checkout");
    setMessage(null);
    try {
      const result = await checkoutDecision(winner, checkoutKey.current);
      setReceipt(await getReceipt(result.receiptId));
      setMetrics(await getEvalSummary());
      setMessage(result.idempotentReplay ? "Retry zwrócił ten sam zakup — idempotencja działa." : "Testowy zakup został zapisany.");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke() {
    if (!mandate) return;
    setBusy("revoke");
    setMessage(null);
    try {
      const response = await revokeMandate(mandate);
      setCompiled((current) => current ? { ...current, mandate: response.mandate } : current);
      setMessage("Zgoda została cofnięta. Checkout na starej decyzji zostanie zablokowany.");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleReset() {
    setBusy("reset");
    setMessage(null);
    try {
      await resetDemo();
      setCompiled(null);
      setRunId(null);
      setEvents([]);
      setReceipt(null);
      setMetrics(null);
      setMutationApplied(false);
      cursor.current = "0";
      checkoutKey.current = crypto.randomUUID();
      setMessage("Demo zostało zresetowane.");
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Bluecrop / purchase control desk</p>
          <h1>Mandat przed okazją.</h1>
          <p className="lede">Testuj interpretację briefu, decyzje i granice autonomicznego zakupu w jednym miejscu.</p>
        </div>
        <div className="connection" aria-label="Konfiguracja API">
          <span className="status-dot" />
          <div><strong>Local API</strong><small>{API_URL}</small></div>
          <button className="text-button" type="button" onClick={handleReset} disabled={busy !== null}>
            {busy === "reset" ? "Resetuję…" : "Reset demo"}
          </button>
        </div>
      </header>

      {message && <div className="notice" role="status">{message}</div>}

      <div className="workspace">
        <section className="controls" aria-label="Sterowanie demonstracją">
          <Step number="01" title="Brief">
            <label htmlFor="brief">Warunki zakupu</label>
            <textarea id="brief" value={brief} onChange={(event) => setBrief(event.target.value)} rows={6} />
            <button className="primary" type="button" onClick={handleCompile} disabled={busy !== null || brief.trim().length < 8}>
              {busy === "compile" ? "Kompiluję…" : "Utwórz mandat"}
            </button>
          </Step>

          <Step number="02" title="Mandat">
            {mandate ? <MandateCard compiled={compiled!} /> : <EmptyCopy>Najpierw skompiluj brief.</EmptyCopy>}
            <div className="button-row">
              <button className="primary" type="button" onClick={handleApprove} disabled={!mandate || mandate.status !== "DRAFT" || Boolean(compiled?.ambiguities.length) || busy !== null}>
                {busy === "approve" ? "Zatwierdzam…" : "Zatwierdź mandat"}
              </button>
              <button className="secondary" type="button" onClick={handleRevoke} disabled={!mandate || mandate.status !== "APPROVED" || busy !== null}>
                {busy === "revoke" ? "Cofam…" : "Cofnij zgodę"}
              </button>
            </div>
          </Step>

          <Step number="03" title="Replay">
            <p className="supporting">Seed 20260711 · UK trap · fake discount · NL winner</p>
            <button className="primary" type="button" onClick={handleStartRun} disabled={!mandate || mandate.status !== "APPROVED" || busy !== null}>
              {busy === "run" ? "Uruchamiam…" : "Uruchom monitoring"}
            </button>
          </Step>

          <Step number="04" title="Checkout">
            {winner ? (
              <>
                <Boundary mandate={mandate} decision={winner} />
                <div className="button-row stacked-mobile">
                  <button className="danger" type="button" onClick={handleMutation} disabled={mutationApplied || busy !== null}>
                    {busy === "mutate" ? "Zmieniam…" : mutationApplied ? "Cena zmieniona" : "Podnieś cenę"}
                  </button>
                  <button className="primary" type="button" onClick={handleCheckout} disabled={busy !== null}>
                    {busy === "checkout" ? "Sprawdzam…" : "Finalizuj testowo"}
                  </button>
                </div>
              </>
            ) : <EmptyCopy>Oferta do zakupu pojawi się po replay.</EmptyCopy>}
          </Step>
        </section>

        <section className="evidence" aria-label="Dowody decyzji">
          <div className="section-heading">
            <div><p className="eyebrow">Live evidence</p><h2>Oś decyzji</h2></div>
            <span className="event-count">{events.length} zdarzeń</span>
          </div>
          <div className="timeline">
            {events.length ? events.map((event) => <EventRow event={event} key={event.eventId} />) : (
              <div className="timeline-empty"><span>○</span><p>Zdarzenia pojawią się po uruchomieniu monitoringu.</p></div>
            )}
          </div>

          <div className="lower-grid">
            <ReceiptCard receipt={receipt} />
            <MetricsCard metrics={metrics} />
          </div>
        </section>
      </div>
    </main>
  );
}

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <article className="step"><header><span>{number}</span><h2>{title}</h2></header>{children}</article>;
}

function EmptyCopy({ children }: { children: React.ReactNode }) {
  return <p className="empty-copy">{children}</p>;
}

function MandateCard({ compiled }: { compiled: CompileMandateResponse }) {
  const { mandate, ambiguities } = compiled;
  return (
    <div className="mandate-card">
      <div className="mandate-status"><span className={`pill ${mandate.status.toLowerCase()}`}>{mandate.status}</span><small>{compiled.compiler}</small></div>
      <dl>
        <div><dt>Produkt</dt><dd>{mandate.product.query}</dd></div>
        <div><dt>Wariant</dt><dd>{mandate.product.size ?? "brak"} · {mandate.product.condition ?? "brak"}</dd></div>
        <div><dt>Limit</dt><dd>{mandate.maxTotal ? formatMoney(mandate.maxTotal) : "brak"}</dd></div>
        <div><dt>Autonomia</dt><dd>{mandate.autonomy}</dd></div>
      </dl>
      {ambiguities.map((item) => <p className="ambiguity" key={item.field}>{item.question}</p>)}
    </div>
  );
}

function Boundary({ mandate, decision }: { mandate: Mandate | null; decision: Decision }) {
  const limit = mandate?.maxTotal?.amountMinor ?? 1;
  const ratio = Math.min((decision.cost.total.amountMinor / limit) * 100, 100);
  const over = decision.cost.total.amountMinor > limit;
  return (
    <div className={`boundary ${over ? "over" : ""}`}>
      <div><span>Pełny koszt</span><strong>{formatMoney(decision.cost.total)}</strong></div>
      <div><span>Granica mandatu</span><strong>{mandate?.maxTotal ? formatMoney(mandate.maxTotal) : "—"}</strong></div>
      <div className="boundary-track"><span style={{ width: `${ratio}%` }} /></div>
      <small>{over ? "Poza mandatem" : `${Math.round(100 - ratio)}% zapasu do limitu`}</small>
    </div>
  );
}

function EventRow({ event }: { event: RunEvent }) {
  const decision = event.type === "DECISION_MADE" ? event.data as unknown as Decision : null;
  const offer = event.type === "OFFER_RECEIVED" ? event.data.offer as CanonicalOffer | undefined : undefined;
  const mutation = event.type === "OFFER_MUTATED" ? event.data as { price?: Money; offerVersion?: number } : null;
  return (
    <article className="event-row">
      <div className="event-marker"><span /></div>
      <div className="event-body">
        <header><span className="event-type">{eventLabel(event.type)}</span><time>{String(event.sequence).padStart(2, "0")}</time></header>
        {offer && <p><strong>{offer.seller.name}</strong> · {offer.product.brand} {offer.product.model} · {formatMoney(offer.price)}</p>}
        {decision && (
          <>
            <div className="decision-line"><span className={`decision ${decision.action.toLowerCase()}`}>{decision.action}</span><strong>{formatMoney(decision.cost.total)}</strong></div>
            <p>{decision.explanation}</p>
            <div className="reason-list">{decision.reasonCodes.map((reason) => <code key={reason}>{reason}</code>)}</div>
          </>
        )}
        {mutation?.price && <p className="mutation-copy">Nowa cena: <strong>{formatMoney(mutation.price)}</strong> · wersja {mutation.offerVersion}</p>}
        {event.type === "RUN_STARTED" && <p>Scenariusz golden-path uruchomiony z ustalonym seedem.</p>}
        {event.type === "RUN_COMPLETED" && <p>Wszystkie oferty zostały ocenione.</p>}
      </div>
    </article>
  );
}

function ReceiptCard({ receipt }: { receipt: Receipt | null }) {
  return (
    <section className="receipt-card">
      <p className="eyebrow">Trust receipt</p>
      {receipt ? (
        <>
          <h3>{receipt.purchaseId}</h3>
          <dl><div><dt>Koszt</dt><dd>{formatMoney(receipt.cost.total)}</dd></div><div><dt>Oferta</dt><dd>v{receipt.offerVersion}</dd></div><div><dt>Mandat</dt><dd>v{receipt.mandateVersion}</dd></div></dl>
          <code className="receipt-key">{receipt.idempotencyKey}</code>
        </>
      ) : <EmptyCopy>Receipt pojawi się po poprawnym checkoutcie.</EmptyCopy>}
    </section>
  );
}

function MetricsCard({ metrics }: { metrics: EvalSummary | null }) {
  return (
    <section className="metrics-card">
      <p className="eyebrow">Safety counters</p>
      <div className="metric-grid">
        <div><strong>{metrics?.hardCapViolations ?? 0}</strong><span>cap violations</span></div>
        <div><strong>{metrics?.duplicateBuys ?? 0}</strong><span>duplicate buys</span></div>
        <div><strong>{metrics?.decisions ?? 0}</strong><span>decisions</span></div>
        <div><strong>{metrics?.purchases ?? 0}</strong><span>purchases</span></div>
      </div>
    </section>
  );
}

function mergeEvents(current: RunEvent[], incoming: RunEvent[]) {
  const known = new Set(current.map((event) => event.eventId));
  return [...current, ...incoming.filter((event) => !known.has(event.eventId))].sort((a, b) => a.sequence - b.sequence);
}

function eventLabel(type: RunEvent["type"]) {
  return ({ RUN_STARTED: "Run started", OFFER_RECEIVED: "Offer received", DECISION_MADE: "Decision", OFFER_MUTATED: "Offer changed", RUN_COMPLETED: "Run completed" })[type];
}

function formatMoney(money: Money) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: money.currency }).format(money.amountMinor / 100);
}

function toMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.reasonCodes.length ? `${error.message} (${error.reasonCodes.join(", ")})` : error.message;
  }
  return error instanceof Error ? error.message : "Nieznany błąd.";
}
