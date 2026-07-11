import type {
  CanonicalOffer,
  CostBreakdown,
  Decision,
  Mandate,
  Money,
  ReasonCode,
} from "../../contracts/src/index.js";

function convertToBase(money: Money, baseCurrency: Money["currency"], fxRateToBase: number): Money {
  return {
    amountMinor: Math.round(money.amountMinor * fxRateToBase),
    currency: baseCurrency,
  };
}

export function calculateTotalCost(offer: CanonicalOffer, baseCurrency: Money["currency"]): CostBreakdown {
  const item = convertToBase(offer.price, baseCurrency, offer.fxRateToBase);
  const shipping = convertToBase(offer.shipping, baseCurrency, offer.fxRateToBase);
  const fees = convertToBase(offer.fees, baseCurrency, offer.fxRateToBase);
  return {
    item,
    shipping,
    fees,
    total: {
      amountMinor: item.amountMinor + shipping.amountMinor + fees.amountMinor,
      currency: baseCurrency,
    },
    sourceCurrency: offer.price.currency,
    fxRateToBase: offer.fxRateToBase,
  };
}

function isExactVariant(offer: CanonicalOffer, mandate: Mandate): boolean {
  const query = mandate.product.query.toLocaleLowerCase();
  const productName = `${offer.product.brand} ${offer.product.model}`.toLocaleLowerCase();
  return (
    productName.includes(query) &&
    offer.product.size.toLocaleLowerCase() === mandate.product.size?.toLocaleLowerCase() &&
    offer.product.condition === mandate.product.condition
  );
}

function isFakeDiscount(offer: CanonicalOffer): boolean {
  if (!offer.claimedDiscountPercent || offer.priceHistoryMinor.length < 2) return false;
  const recentAverage = offer.priceHistoryMinor.reduce((sum, value) => sum + value, 0) / offer.priceHistoryMinor.length;
  const realDiscount = ((recentAverage - offer.price.amountMinor) / recentAverage) * 100;
  return offer.claimedDiscountPercent - realDiscount >= 15;
}

export function evaluateOffer(offer: CanonicalOffer, mandate: Mandate, decisionId: string): Decision {
  const cost = calculateTotalCost(offer, mandate.maxTotal?.currency ?? "EUR");
  const reasons: ReasonCode[] = [];
  let action: Decision["action"] = "ALERT";

  if (!isExactVariant(offer, mandate)) {
    action = "IGNORE";
    reasons.push("VARIANT_MISMATCH");
  } else {
    reasons.push("EXACT_VARIANT");
  }

  if (action !== "IGNORE" && offer.seller.type === "RESELLER" && !mandate.sellerPolicy.allowResellers) {
    action = "IGNORE";
    reasons.push("RESELLER_BLOCKED");
  }
  if (action !== "IGNORE" && isFakeDiscount(offer)) {
    action = "IGNORE";
    reasons.push("FAKE_DISCOUNT");
  }
  if (action !== "IGNORE" && !offer.couponValid) {
    action = "IGNORE";
    reasons.push("INVALID_COUPON");
  }
  if (action !== "IGNORE" && offer.seller.trustScore < 0.65) {
    action = "ASK_USER";
    reasons.push("INSUFFICIENT_TRUST");
  }
  if (mandate.maxTotal && cost.total.amountMinor > mandate.maxTotal.amountMinor) {
    action = "IGNORE";
    reasons.push("TOTAL_CAP_EXCEEDED");
  } else if (action !== "IGNORE") {
    reasons.push("WITHIN_TOTAL_CAP");
  }

  if (action === "ALERT" && mandate.autonomy === "ASK_BEFORE_BUY") {
    action = "ASK_USER";
    reasons.push("APPROVAL_REQUIRED");
  } else if (action === "ALERT" && mandate.autonomy === "AUTO_BUY_IF_LOW_STOCK" && offer.stock <= 2) {
    action = "AUTO_BUY";
    reasons.push("LOW_STOCK");
  }

  return {
    id: decisionId,
    offerId: offer.id,
    offerVersion: offer.version,
    mandateId: mandate.id,
    mandateVersion: mandate.version,
    action,
    reasonCodes: reasons,
    cost,
    explanation: explanationFor(action, reasons),
  };
}

function explanationFor(action: Decision["action"], reasons: ReasonCode[]): string {
  if (reasons.includes("TOTAL_CAP_EXCEEDED")) return "Pełny koszt oferty przekracza zatwierdzony limit.";
  if (reasons.includes("FAKE_DISCOUNT")) return "Deklarowany rabat nie znajduje potwierdzenia w historii ceny.";
  if (reasons.includes("VARIANT_MISMATCH")) return "Oferta nie odpowiada dokładnemu wariantowi z mandatu.";
  if (action === "AUTO_BUY") return "Oferta spełnia mandat i ma niski stan magazynowy.";
  if (action === "ASK_USER") return "Oferta wymaga dodatkowej decyzji użytkownika.";
  if (action === "ALERT") return "Oferta spełnia warunki i jest warta uwagi.";
  return "Oferta została odrzucona przez reguły mandatu.";
}
