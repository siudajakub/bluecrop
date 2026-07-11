"use client";
import React from 'react';
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
  | { id: string; sender: 'bot'; kind: 'recommendations'; items: ProductRecommendation[] };

export function formatMoney(money: Money) {
  return new Intl.NumberFormat('en', { style: 'currency', currency: money.currency }).format(money.amountMinor / 100);
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
            {busy ? 'Revoking…' : 'Revoke mandate'}
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
            {busy ? 'Checking out…' : purchased ? 'Retry checkout (idempotent)' : 'Complete test checkout'}
          </button>
          <button type="button" className="card-btn secondary" onClick={onMutate} disabled={busy || mutated}>
            {mutated ? 'Price changed' : 'Simulate price change'}
          </button>
        </div>
      )}
    </div>
  );
}

export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  return (
    <div className="chat-card receipt">
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
    </div>
  );
}

export function RecommendationList({ items }: { items: ProductRecommendation[] }) {
  return (
    <div className="chat-card recommendations">
      <div className="chat-card-header">
        <span className="status-pill approved">LIVE OFFERS</span>
        <small>{items.length} product page{items.length === 1 ? '' : 's'} found on the web</small>
      </div>
      <p className="chat-card-copy">Confirm price and availability with the seller before buying.</p>
      <div className="recommendation-items">
        {items.map((item) => (
          <div className="recommendation-item" key={`${item.url}-${item.name}`}>
            <div className="recommendation-item-main">
              <strong>{item.name}</strong>
              <span>{item.category} · {item.seller}</span>
              <p>{item.whyItFits}</p>
              {item.tradeoffs.length > 0 && <small>Check first: {item.tradeoffs.join(' · ')}</small>}
            </div>
            <div className="recommendation-item-side">
              <strong>{item.price}</strong>
              <a href={item.url} target="_blank" rel="noreferrer">View offer ↗</a>
            </div>
          </div>
        ))}
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
