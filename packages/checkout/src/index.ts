import type { Decision, Mandate, Receipt, Run } from "../../contracts/src/index.js";
import { calculateTotalCost } from "../../domain/src/index.js";

export class RevalidationError extends Error {
  constructor(public readonly reasonCodes: string[]) {
    super("Oferta zmieniła się przed finalizacją.");
  }
}

export function revalidateCheckout(run: Run, mandate: Mandate, decision: Decision): void {
  if (mandate.status !== "APPROVED" || mandate.version !== decision.mandateVersion) {
    throw new RevalidationError(["CONSENT_CHANGED"]);
  }
  const offer = run.offers.find((candidate) => candidate.id === decision.offerId);
  if (!offer) throw new RevalidationError(["OFFER_NOT_FOUND"]);
  const reasons: string[] = [];
  if (offer.version !== decision.offerVersion) reasons.push("OFFER_VERSION_CHANGED");
  const currentCost = calculateTotalCost(offer, decision.cost.total.currency);
  if (currentCost.total.amountMinor !== decision.cost.total.amountMinor) {
    reasons.push("PRICE_CHANGED");
  }
  if (mandate.maxTotal && currentCost.total.amountMinor > mandate.maxTotal.amountMinor) {
    reasons.push("TOTAL_CAP_EXCEEDED");
  }
  if (offer.stock < 1) reasons.push("OUT_OF_STOCK");
  if (decision.action !== "AUTO_BUY") reasons.push("ACTION_NOT_AUTHORIZED");
  if (reasons.length) throw new RevalidationError(reasons);
}

export function createReceipt(
  decision: Decision,
  idempotencyKey: string,
  ids: { receiptId: string; purchaseId: string },
  completedAt: string,
): Receipt {
  return {
    id: ids.receiptId,
    purchaseId: ids.purchaseId,
    decisionId: decision.id,
    mandateId: decision.mandateId,
    mandateVersion: decision.mandateVersion,
    offerId: decision.offerId,
    offerVersion: decision.offerVersion,
    cost: decision.cost,
    reasonCodes: decision.reasonCodes,
    idempotencyKey,
    completedAt,
  };
}
