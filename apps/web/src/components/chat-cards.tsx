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
  | { id: string; sender: 'bot'; kind: 'trace'; recordsChecked: number; matches: number; sourceCount: number; webSourcesChecked: number; categories: string[]; sourceLabels: string[] }
  | { id: string; sender: 'bot'; kind: 'recommendations'; items: ProductRecommendation[] };

export interface MockPurchase {
  id: string;
  offer: ProductRecommendation;
  purchasedAt: string;
  deliveryEta: string;
}

const PRODUCT_IMAGE_PLACEHOLDER = '/images/product-placeholder.svg';

export function ProductImage({ src, alt, ...props }: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | null }) {
  return <img
    {...props}
    src={src ?? PRODUCT_IMAGE_PLACEHOLDER}
    alt={alt}
    onError={(event) => {
      if (event.currentTarget.src.endsWith(PRODUCT_IMAGE_PLACEHOLDER)) return;
      event.currentTarget.src = PRODUCT_IMAGE_PLACEHOLDER;
    }}
  />;
}

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

export function SearchTrace({ recordsChecked, matches, sourceCount, webSourcesChecked, categories, sourceLabels }: { recordsChecked: number; matches: number; sourceCount: number; webSourcesChecked: number; categories: string[]; sourceLabels: string[] }) {
  return (
    <div className="search-trace">
      <div className="trace-heading"><span className="trace-orb" /><div><strong>Search complete</strong><small>Transparent activity log · not private model reasoning</small></div></div>
      <div className="trace-stats"><div><strong>{recordsChecked}</strong><span>records checked</span></div><div><strong>{matches}</strong><span>price matches</span></div><div><strong>{sourceCount}</strong><span>sources checked</span></div></div>
      <div className="trace-timeline">
        <div className="done"><i>✓</i><span><strong>Intent understood</strong><small>{categories.join(' · ')}</small></span></div>
        <div className="done"><i>✓</i><span><strong>Scraper catalog scanned</strong><small>product_offers.json · verified scraper snapshot</small></span></div>
        <div className="done"><i>✓</i><span><strong>{webSourcesChecked} live web sources checked</strong><small>{sourceLabels.filter(label => !/product_offers|scraper snapshot|openai web search/i.test(label)).join(' · ') || 'OpenAI web search'}</small></span></div>
        <div className="done"><i>✓</i><span><strong>{matches} matching offers compared</strong><small>Price, delivery, variant and seller trust</small></span></div>
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
          <ProductImage src={null} alt="Purchased product" />
          <div><small>ORDER {receipt.purchaseId.toUpperCase()}</small><h3>Purchased product</h3><p>Delivery included</p></div>
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
          <DeliveryJourney />
          <div className="tracking-copy"><span className="live-dot" /><div><strong>On the way</strong><p>Arrives tomorrow, 12:00–14:00</p></div><span>Warsaw → You</span></div>
          <div className="tracking-steps"><span className="done">Ordered</span><span className="done">Shipped</span><span className="active">In transit</span><span>Delivered</span></div>
        </div>
      )}
    </div>
  );
}

export function RecommendationList({ items, onPay, purchasedUrls }: { items: ProductRecommendation[]; onPay: (item: ProductRecommendation) => void; purchasedUrls: Set<string> }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const purchasedItem = items.find(candidate => purchasedUrls.has(candidate.url));
  const item = purchasedItem ?? items[activeIndex];
  if (!item) return null;
  const purchased = Boolean(purchasedItem);
  return (
    <div className="chat-card recommendations recommendation-carousel">
      <div className="chat-card-header">
        <span className="status-pill approved">{purchased ? 'PURCHASED' : activeIndex === 0 ? 'TOP PICK' : 'SHORTLIST'}</span>
        <small>{purchased ? 'Order confirmed' : `${activeIndex + 1} of ${items.length}`}</small>
      </div>
      <p className="chat-card-copy">{purchased ? 'Your selected product has been purchased successfully.' : activeIndex === 0 ? 'This is my best match for your requirements.' : 'Another verified option from your shortlist.'}</p>
      <div className="recommendation-items"><div className="recommendation-item featured" key={`${item.url}-${item.name}`}>
            <ProductImage className="recommendation-image" src={item.imageUrl} alt={item.name} />
            <div className="recommendation-item-main">
              <strong>{item.name}</strong>
              <span>{item.category} · {item.seller}</span>
              <span className="delivery-line">◷ {item.deliveryEstimate ?? 'Delivery date to confirm'}</span>
              <p>{item.whyItFits}</p>
              {item.tradeoffs.length > 0 && <small>Check first: {item.tradeoffs.join(' · ')}</small>}
            </div>
            <div className="recommendation-item-side">
              <strong>{item.price}</strong>
              <a href={item.url} target="_blank" rel="noreferrer">View offer ↗</a>
              {purchased ? <span className="purchased-check">✓ Purchased</span> : <button type="button" className="result-pay-btn" onClick={() => onPay(item)}><span className="apple-mark"></span> Pay</button>}
            </div>
          </div>
      </div>
      {purchased && <div className="purchase-handoff" role="status"><div><i>✓</i><span><strong>Payment approved</strong><small>Apple Pay completed</small></span></div><div><i>✓</i><span><strong>Delivery details shared</strong><small>Your name and shipping address were passed securely</small></span></div><div><i>✓</i><span><strong>Added to Purchases</strong><small>Tracking is now available</small></span></div></div>}
      {!purchased && <div className="carousel-controls">
        <button type="button" onClick={() => setActiveIndex(index => (index - 1 + items.length) % items.length)} aria-label="Previous offer">←</button>
        <div>{items.map((_, index) => <button key={index} type="button" className={index === activeIndex ? 'active' : ''} onClick={() => setActiveIndex(index)} aria-label={`Show offer ${index + 1}`} />)}</div>
        <button type="button" onClick={() => setActiveIndex(index => (index + 1) % items.length)} aria-label="Next offer">→</button>
      </div>}
    </div>
  );
}

export function MockPurchaseCard({ purchase }: { purchase: MockPurchase }) {
  return <div className="chat-card tracking-card mock-purchase-card">
    <div className="purchase-hero">
      <ProductImage src={purchase.offer.imageUrl} alt={purchase.offer.name} />
      <div><small>ORDER {purchase.id.toUpperCase()}</small><h3>{purchase.offer.name}</h3><p>{purchase.offer.seller} · {purchase.offer.deliveryEstimate ?? 'Delivery confirmed'}</p></div>
      <strong>{purchase.offer.price}</strong>
    </div>
    <div className="mock-order-state"><span className="status-pill approved">PAID</span><a className="seller-order-link" href={purchase.offer.url} target="_blank" rel="noreferrer">View on {purchase.offer.seller} ↗</a><small>{new Date(purchase.purchasedAt).toLocaleString('en')}</small></div>
    <div className="tracking-panel">
      <DeliveryJourney />
      <div className="tracking-copy"><span className="live-dot" /><div><strong>Preparing for shipment</strong><p>{purchase.deliveryEta}</p></div><span>Seller → Warsaw</span></div>
      <div className="tracking-steps"><span className="done">Ordered</span><span className="active">Preparing</span><span>In transit</span><span>Delivered</span></div>
    </div>
  </div>;
}

function DeliveryJourney() {
  return <div className="delivery-journey" aria-label="Delivery vehicle travelling from the warehouse to your home">
    <div className="delivery-place warehouse"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 10 12 4l9 6v10H3z"/><path d="M7 20v-6h10v6M3 10h18"/></svg></span><small>Warehouse</small></div>
    <div className="delivery-route"><i className="road-mark one"/><i className="road-mark two"/><i className="road-mark three"/><span className="delivery-car"><svg viewBox="0 0 32 20" fill="none"><path d="M3 13V7.5c0-1.1.9-2 2-2h13l5 4h4c1.1 0 2 .9 2 2V13" fill="currentColor"/><circle cx="9" cy="14" r="3" fill="#fff" stroke="currentColor" strokeWidth="2"/><circle cx="24" cy="14" r="3" fill="#fff" stroke="currentColor" strokeWidth="2"/><path d="M18 5.5v4h5" stroke="#fff" strokeWidth="1.5"/></svg><em>In transit</em></span></div>
    <div className="delivery-place home"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M10 20v-6h4v6"/></svg></span><small>Your home</small></div>
  </div>;
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
