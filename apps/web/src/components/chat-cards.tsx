"use client";
import React from 'react';
import BlurText from './blur-text';
import type {
  CanonicalOffer,
  CompileMandateResponse,
  Decision,
  Mandate,
  Money,
  ProductRecommendation,
  Receipt,
} from '@deal-hunter/contracts';

export type ChatMessage =
  | { id: string; sender: 'user'; text: string }
  | { id: string; sender: 'bot'; kind: 'text'; text: string }
  | { id: string; sender: 'bot'; kind: 'error'; code: string; text: string; reasonCodes: string[] }
  | { id: string; sender: 'bot'; kind: 'mandate'; compiled: CompileMandateResponse }
  | { id: string; sender: 'bot'; kind: 'offer'; offer: CanonicalOffer }
  | { id: string; sender: 'bot'; kind: 'decision'; decision: Decision }
  | { id: string; sender: 'bot'; kind: 'receipt'; receipt: Receipt }
  | { id: string; sender: 'bot'; kind: 'searching' }
  | { id: string; sender: 'bot'; kind: 'trace'; sources: number; categories: string[]; sourceLabels: string[]; catalogMatches: number; webMatches: number; rejected: number }
  | { id: string; sender: 'bot'; kind: 'recommendations'; items: ProductRecommendation[] };

export function formatMoney(money: Money) {
  return new Intl.NumberFormat('en', { style: 'currency', currency: money.currency }).format(money.amountMinor / 100);
}

export function SearchingCard() {
  const phrases = [
    'Searching verified sources…',
    'Comparing prices in your currency…',
    'Checking delivery estimates…',
    'Filtering mismatched products…',
    'Ranking the safest offers…',
  ];
  const [phrase, setPhrase] = React.useState(0);
  React.useEffect(() => {
    const timer = window.setInterval(() => setPhrase(value => (value + 1) % phrases.length), 2400);
    return () => window.clearInterval(timer);
  }, [phrases.length]);
  return <div className="searching-card"><span className="radar"><i /></span><div><BlurText key={phrase} text={phrases[phrase] ?? phrases[0]!} className="searching-blur-text" delay={35} animateBy="words" direction="top" /><small>Scraper catalog · stores · OpenAI web search</small></div><span className="searching-dots"><i /><i /><i /></span></div>;
}

export function SearchTrace({ sources, categories, sourceLabels, catalogMatches, webMatches, rejected }: { sources: number; categories: string[]; sourceLabels: string[]; catalogMatches: number; webMatches: number; rejected: number }) {
  return (
    <div className="search-trace">
      <div className="trace-heading"><span className="trace-orb" /><div><strong>Search complete</strong><small>Transparent activity log · not private model reasoning</small></div></div>
      <div className="trace-stats"><div><strong>{sources}</strong><span>offers checked</span></div><div><strong>{catalogMatches + webMatches}</strong><span>matches</span></div><div><strong>{rejected}</strong><span>filtered out</span></div></div>
      <div className="trace-timeline">
        <div className="done"><i>✓</i><span><strong>Intent understood</strong><small>{categories.join(' · ')}</small></span></div>
        <div className="done"><i>✓</i><span><strong>Combined {sourceLabels.length} sources</strong><small>{sourceLabels.join(' · ')}</small></span></div>
        <div className="blocked"><i>!</i><span><strong>Irrelevant results removed</strong><small>{rejected} records did not match the product or variant</small></span></div>
        <div className="done"><i>✓</i><span><strong>Finalists compared</strong><small>Price, delivery, variant and seller trust</small></span></div>
      </div>
    </div>
  );
}

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${isoDate}T12:00:00`));
}

const AUTONOMY_LABELS: Record<Mandate['autonomy'], string> = {
  ALERT_ONLY: 'Alert only',
  ASK_BEFORE_BUY: 'Ask before buying',
  AUTO_BUY_IF_LOW_STOCK: 'Auto-buy on low stock',
};

const DECISION_LABELS: Record<Decision['action'], string> = {
  IGNORE: 'Ignored',
  ALERT: 'Alert',
  ASK_USER: 'Needs your approval',
  AUTO_BUY: 'Ready to buy',
};

export function MandateCard({
  compiled,
  busy,
  onApprove,
  onRevoke,
}: {
  compiled: CompileMandateResponse;
  busy: boolean;
  onApprove: () => void;
  onRevoke: () => void;
}) {
  const { mandate } = compiled;
  return (
    <div className="chat-card">
      <div className="chat-card-header">
        <span className={`status-pill ${mandate.status.toLowerCase()}`}>{mandate.status}</span>
        <small>compiled by {compiled.compiler} · v{mandate.version}</small>
      </div>
      <dl className="chat-card-facts">
        <div>
          <dt>Product</dt>
          <dd>{mandate.product.query}</dd>
        </div>
        {(mandate.product.size || mandate.product.condition) && (
          <div>
            <dt>Variant</dt>
            <dd>{[mandate.product.size, mandate.product.condition?.toLowerCase()].filter(Boolean).join(' · ')}</dd>
          </div>
        )}
        <div>
          <dt>Max total</dt>
          <dd>{mandate.maxTotal ? formatMoney(mandate.maxTotal) : 'no cap'}</dd>
        </div>
        {mandate.purchaseBy && (
          <div>
            <dt>Purchase by</dt>
            <dd>{formatDate(mandate.purchaseBy)}</dd>
          </div>
        )}
        <div>
          <dt>Autonomy</dt>
          <dd>{AUTONOMY_LABELS[mandate.autonomy]}</dd>
        </div>
        <div>
          <dt>Resellers</dt>
          <dd>{mandate.sellerPolicy.allowResellers ? 'allowed' : 'blocked'}</dd>
        </div>
        <div>
          <dt>Ships to</dt>
          <dd>{mandate.destinationCountry}</dd>
        </div>
      </dl>
      <div className="chat-card-actions">
        {mandate.status === 'DRAFT' && (
          <button type="button" className="card-btn primary" onClick={onApprove} disabled={busy}>
            {busy ? 'Approving…' : 'Approve & start hunting'}
          </button>
        )}
        {mandate.status === 'APPROVED' && (
          <button type="button" className="card-btn danger" onClick={onRevoke} disabled={busy}>
            {busy ? 'Searching…' : 'Revoke mandate'}
          </button>
        )}
        {mandate.status === 'REVOKED' && <small className="chat-card-note">This mandate has been revoked.</small>}
      </div>
    </div>
  );
}

export function OfferLine({ offer }: { offer: CanonicalOffer }) {
  return (
    <div className="offer-line">
      <div className="offer-line-main">
        <strong>{offer.seller.name}</strong>
        <span>{offer.product.brand} {offer.product.model} · {offer.product.size} · {offer.product.condition.toLowerCase()}</span>
      </div>
      <div className="offer-line-meta">
        <span>{formatMoney(offer.price)} + {formatMoney(offer.shipping)} shipping</span>
        {offer.seller.type === 'RESELLER' && <span className="offer-tag">reseller</span>}
        {offer.claimedDiscountPercent !== null && <span className="offer-tag">-{offer.claimedDiscountPercent}% claimed</span>}
        <span className="offer-tag">{offer.stock} in stock</span>
      </div>
    </div>
  );
}

export function DecisionCard({
  decision,
  capTotal,
  busy,
  purchased,
  mutated,
  onCheckout,
  onMutate,
}: {
  decision: Decision;
  capTotal: Money | null;
  busy: boolean;
  purchased: boolean;
  mutated: boolean;
  onCheckout: () => void;
  onMutate: () => void;
}) {
  const canCheckout = decision.action === 'AUTO_BUY';
  const ratio = capTotal ? Math.min((decision.cost.total.amountMinor / capTotal.amountMinor) * 100, 100) : null;
  const over = capTotal ? decision.cost.total.amountMinor > capTotal.amountMinor : false;
  return (
    <div className="chat-card">
      <div className="chat-card-header">
        <span className={`status-pill decision-${decision.action.toLowerCase()}`}>{DECISION_LABELS[decision.action]}</span>
        <strong className="chat-card-amount">{formatMoney(decision.cost.total)}</strong>
      </div>
      <p className="chat-card-copy">{decision.explanation}</p>
      {ratio !== null && capTotal && (
        <div className={`cap-meter ${over ? 'over' : ''}`}>
          <div className="cap-meter-track"><span style={{ width: `${ratio}%` }} /></div>
          <small>{over ? 'Over the mandate cap' : `${Math.round(100 - ratio)}% headroom to the ${formatMoney(capTotal)} cap`}</small>
        </div>
      )}
      <div className="reason-codes">
        {decision.reasonCodes.map((reason) => <code key={reason}>{reason}</code>)}
      </div>
      {canCheckout && (
        <div className="chat-card-actions">
          <button type="button" className="card-btn primary" onClick={onCheckout} disabled={busy}>
            <span className="apple-mark"></span> {busy ? 'Checking…' : purchased ? 'Paid' : 'Pay'}
          </button>
          <button type="button" className="card-btn secondary" onClick={onMutate} disabled={busy || mutated}>
            {mutated ? 'Price changed' : 'Simulate price change'}
          </button>
        </div>
      )}
    </div>
  );
}

export function ReceiptCard({ receipt, tracking = false }: { receipt: Receipt; tracking?: boolean }) {
  return (
    <div className={`chat-card receipt ${tracking ? 'tracking-card' : ''}`}>
      {tracking && (
        <div className="purchase-hero">
          <img src="/images/guitar-starter-kit.png" alt="Purchased guitar starter kit" />
          <div><small>ORDER {receipt.purchaseId.toUpperCase()}</small><h3>Electric guitar starter set</h3><p>Allegro · delivery included</p></div>
          <strong>{formatMoney(receipt.cost.total)}</strong>
        </div>
      )}
      <div className="chat-card-header">
        <span className="status-pill approved">TRUST RECEIPT</span>
        <small>{new Date(receipt.completedAt).toLocaleString('en')}</small>
      </div>
      <dl className="chat-card-facts">
        <div>
          <dt>Purchase</dt>
          <dd>{receipt.purchaseId}</dd>
        </div>
        <div>
          <dt>Total cost</dt>
          <dd>{formatMoney(receipt.cost.total)}</dd>
        </div>
        <div>
          <dt>Offer version</dt>
          <dd>v{receipt.offerVersion}</dd>
        </div>
        <div>
          <dt>Mandate version</dt>
          <dd>v{receipt.mandateVersion}</dd>
        </div>
      </dl>
      <code className="receipt-key">{receipt.idempotencyKey}</code>
      {tracking && (
        <div className="tracking-panel">
          <div className="tracking-map" aria-label="Package route from Warsaw to your location">
            <span className="map-road road-a" /><span className="map-road road-b" />
            <span className="route-line" /><span className="map-pin origin" /><span className="map-pin destination" />
          </div>
          <div className="tracking-copy"><span className="live-dot" /><div><strong>On the way</strong><p>Arrives tomorrow, 12:00–14:00</p></div><span>Warsaw → You</span></div>
          <div className="tracking-steps"><span className="done">Ordered</span><span className="done">Shipped</span><span className="active">In transit</span><span>Delivered</span></div>
        </div>
      )}
    </div>
  );
}

export function RecommendationList({ items, onPay }: { items: ProductRecommendation[]; onPay: (item: ProductRecommendation) => void }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const item = items[activeIndex];
  if (!item) return null;
  return (
    <div className="chat-card recommendations recommendation-carousel">
      <div className="chat-card-header">
        <span className="status-pill approved">{activeIndex === 0 ? 'TOP PICK' : 'SHORTLIST'}</span>
        <small>{activeIndex + 1} of {items.length}</small>
      </div>
      <p className="chat-card-copy">{activeIndex === 0 ? 'This is my best match for your requirements.' : 'Another verified option from your shortlist.'}</p>
      <div className="recommendation-items"><div className="recommendation-item featured" key={`${item.url}-${item.name}`}>
            <img className="recommendation-image" src={item.imageUrl ?? '/images/guitar-starter-kit.png'} alt={item.name} />
            <div className="recommendation-item-main">
              <strong>{item.name}</strong>
              <span>{item.category} · {item.seller}</span>
              <span className="delivery-line">◷ {item.deliveryEstimate ?? 'Termin dostawy do potwierdzenia'}</span>
              <p>{item.whyItFits}</p>
              {item.tradeoffs.length > 0 && <small>Check first: {item.tradeoffs.join(' · ')}</small>}
            </div>
            <div className="recommendation-item-side">
              <strong>{item.price}</strong>
              <a href={item.url} target="_blank" rel="noreferrer">View offer ↗</a>
              <button type="button" className="result-pay-btn" onClick={() => onPay(item)}><span className="apple-mark"></span> Pay</button>
            </div>
          </div>
      </div>
      <div className="carousel-controls">
        <button type="button" onClick={() => setActiveIndex(index => (index - 1 + items.length) % items.length)} aria-label="Previous offer">←</button>
        <div>{items.map((_, index) => <button key={index} type="button" className={index === activeIndex ? 'active' : ''} onClick={() => setActiveIndex(index)} aria-label={`Show offer ${index + 1}`} />)}</div>
        <button type="button" onClick={() => setActiveIndex(index => (index + 1) % items.length)} aria-label="Next offer">→</button>
      </div>
    </div>
  );
}

export function ErrorNote({ code, text, reasonCodes }: { code: string; text: string; reasonCodes: string[] }) {
  return (
    <div className="chat-error">
      <div className="chat-error-header">
        <span className="chat-error-code">{code}</span>
        <span>{text}</span>
      </div>
      {reasonCodes.length > 0 && (
        <div className="reason-codes">
          {reasonCodes.map((reason) => <code key={reason}>{reason}</code>)}
        </div>
      )}
    </div>
  );
}
