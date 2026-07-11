import type { Mandate, Receipt, Run } from "../../../packages/contracts/src/index.js";

export class InMemoryStore {
  readonly mandates = new Map<string, Mandate>();
  readonly runs = new Map<string, Run>();
  readonly receipts = new Map<string, Receipt>();
  readonly idempotency = new Map<string, unknown>();
  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${String(this.counter).padStart(4, "0")}`;
  }

  reset(): void {
    this.mandates.clear();
    this.runs.clear();
    this.receipts.clear();
    this.idempotency.clear();
    this.counter = 0;
  }
}
