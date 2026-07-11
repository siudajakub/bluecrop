import { z } from "zod";

export const CurrencySchema = z.enum(["EUR", "GBP", "USD", "PLN"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const MoneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: CurrencySchema,
});
export type Money = z.infer<typeof MoneySchema>;

export const MandateDraftSchema = z.object({
  product: z.object({
    query: z.string().min(1),
    size: z.string().min(1).nullable(),
    condition: z.enum(["NEW", "USED"]).nullable(),
  }),
  maxTotal: MoneySchema.nullable(),
  sellerPolicy: z.object({ allowResellers: z.boolean() }),
  autonomy: z.enum(["ALERT_ONLY", "ASK_BEFORE_BUY", "AUTO_BUY_IF_LOW_STOCK"]),
  ambiguities: z.array(
    z.object({
      field: z.string().min(1),
      code: z.enum(["REQUIRED", "AMBIGUOUS"]),
      question: z.string().min(1),
    }),
  ),
});
export type MandateDraft = z.infer<typeof MandateDraftSchema>;

export const MandateSchema = MandateDraftSchema.omit({ ambiguities: true }).extend({
  id: z.string().min(1),
  version: z.number().int().positive(),
  status: z.enum(["DRAFT", "APPROVED", "REVOKED"]),
  destinationCountry: z.string().length(2),
});
export type Mandate = z.infer<typeof MandateSchema>;

export const CompileMandateRequestSchema = z.object({
  brief: z.string().min(8),
  baseCurrency: CurrencySchema.default("EUR"),
  destinationCountry: z.string().length(2).default("PL"),
});
export type CompileMandateRequest = z.infer<typeof CompileMandateRequestSchema>;

export const CompileMandateResponseSchema = z.object({
  mandate: MandateSchema,
  ambiguities: MandateDraftSchema.shape.ambiguities,
  compiler: z.enum(["openai", "fixture"]),
  error: z.object({
    code: z.literal("AMBIGUOUS_MANDATE"),
    message: z.string(),
    fieldErrors: z.array(z.object({ field: z.string(), code: z.string() })),
  }).optional(),
});
export type CompileMandateResponse = z.infer<typeof CompileMandateResponseSchema>;

export const InterviewMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});
export type InterviewMessage = z.infer<typeof InterviewMessageSchema>;

export const InterviewRequestSchema = z.object({
  messages: z.array(InterviewMessageSchema).min(1).max(40),
  baseCurrency: CurrencySchema.default("EUR"),
  destinationCountry: z.string().length(2).default("PL"),
});
export type InterviewRequest = z.infer<typeof InterviewRequestSchema>;

export const ProductParameterSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  priority: z.enum(["REQUIRED", "PREFERRED"]),
});
export type ProductParameter = z.infer<typeof ProductParameterSchema>;

export const SearchCategorySchema = z.object({
  name: z.string().min(1),
  purpose: z.string().min(1),
  required: z.boolean(),
  query: z.string().min(1),
});
export type SearchCategory = z.infer<typeof SearchCategorySchema>;

export const PurchasePlanSchema = z.object({
  goal: z.string().min(1),
  summary: z.string().min(8),
  parameters: z.array(ProductParameterSchema),
  categories: z.array(SearchCategorySchema).min(1),
});
export type PurchasePlan = z.infer<typeof PurchasePlanSchema>;

export const InterviewResponseSchema = z.object({
  assistantMessage: z.string().min(1),
  status: z.enum(["QUESTION", "READY"]),
  options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).max(5),
  questionNumber: z.number().int().min(0),
  maxQuestions: z.number().int().positive(),
  brief: z.string().min(8).nullable(),
  plan: PurchasePlanSchema.nullable(),
  interviewer: z.enum(["openai", "fixture"]),
});
export type InterviewResponse = z.infer<typeof InterviewResponseSchema>;

export const RealtimeTokenResponseSchema = z.object({
  value: z.string().min(1),
  expiresAt: z.number().optional(),
  model: z.string().min(1),
});
export type RealtimeTokenResponse = z.infer<typeof RealtimeTokenResponseSchema>;

export const ProductRecommendationSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  price: z.string().min(1),
  seller: z.string().min(1),
  url: z.string().regex(/^https?:\/\//),
  imageUrl: z.string().regex(/^https?:\/\//).nullable(),
  whyItFits: z.string().min(1),
  tradeoffs: z.array(z.string()),
});
export type ProductRecommendation = z.infer<typeof ProductRecommendationSchema>;

export const ProductSearchRequestSchema = z.object({
  plan: PurchasePlanSchema,
  destinationCountry: z.string().length(2).default("PL"),
});
export type ProductSearchRequest = z.infer<typeof ProductSearchRequestSchema>;

export const ProductSearchResponseSchema = z.object({
  recommendations: z.array(ProductRecommendationSchema).min(1).max(8),
  searchedCategories: z.array(z.string()).min(1),
  searcher: z.enum(["openai", "fixture"]),
});
export type ProductSearchResponse = z.infer<typeof ProductSearchResponseSchema>;

export const SellerSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string().length(2),
  type: z.enum(["RETAILER", "RESELLER"]),
  trustScore: z.number().min(0).max(1),
});

export const CanonicalOfferSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  seller: SellerSchema,
  product: z.object({
    brand: z.string(),
    model: z.string(),
    size: z.string(),
    condition: z.enum(["NEW", "USED"]),
  }),
  price: MoneySchema,
  shipping: MoneySchema,
  fees: MoneySchema,
  fxRateToBase: z.number().positive(),
  stock: z.number().int().nonnegative(),
  claimedDiscountPercent: z.number().min(0).max(100).nullable(),
  priceHistoryMinor: z.array(z.number().int().nonnegative()),
  couponValid: z.boolean(),
});
export type CanonicalOffer = z.infer<typeof CanonicalOfferSchema>;

export const DecisionActionSchema = z.enum(["IGNORE", "ALERT", "ASK_USER", "AUTO_BUY"]);
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

export const ReasonCodeSchema = z.enum([
  "EXACT_VARIANT",
  "VARIANT_MISMATCH",
  "WITHIN_TOTAL_CAP",
  "TOTAL_CAP_EXCEEDED",
  "LOW_STOCK",
  "RESELLER_BLOCKED",
  "FAKE_DISCOUNT",
  "INVALID_COUPON",
  "INSUFFICIENT_TRUST",
  "APPROVAL_REQUIRED",
]);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

export const CostBreakdownSchema = z.object({
  item: MoneySchema,
  shipping: MoneySchema,
  fees: MoneySchema,
  total: MoneySchema,
  sourceCurrency: CurrencySchema,
  fxRateToBase: z.number().positive(),
});
export type CostBreakdown = z.infer<typeof CostBreakdownSchema>;

export const DecisionSchema = z.object({
  id: z.string(),
  offerId: z.string(),
  offerVersion: z.number().int().positive(),
  mandateId: z.string(),
  mandateVersion: z.number().int().positive(),
  action: DecisionActionSchema,
  reasonCodes: z.array(ReasonCodeSchema).min(1),
  cost: CostBreakdownSchema,
  explanation: z.string(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const RunEventSchema = z.object({
  eventId: z.string(),
  sequence: z.number().int().positive(),
  type: z.enum(["RUN_STARTED", "OFFER_RECEIVED", "DECISION_MADE", "OFFER_MUTATED", "RUN_COMPLETED"]),
  occurredAt: z.string().datetime(),
  data: z.record(z.string(), z.unknown()),
});
export type RunEvent = z.infer<typeof RunEventSchema>;

export const RunSchema = z.object({
  id: z.string(),
  mandateId: z.string(),
  scenarioId: z.string(),
  seed: z.number().int(),
  status: z.enum(["RUNNING", "COMPLETED"]),
  offers: z.array(CanonicalOfferSchema),
  decisions: z.array(DecisionSchema),
  events: z.array(RunEventSchema),
});
export type Run = z.infer<typeof RunSchema>;

export const ReceiptSchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  decisionId: z.string(),
  mandateId: z.string(),
  mandateVersion: z.number().int().positive(),
  offerId: z.string(),
  offerVersion: z.number().int().positive(),
  cost: CostBreakdownSchema,
  reasonCodes: z.array(ReasonCodeSchema),
  idempotencyKey: z.string(),
  completedAt: z.string().datetime(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.array(z.object({ field: z.string(), code: z.string() })).optional(),
    reasonCodes: z.array(z.string()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const ScenarioSchema = z.object({
  id: z.string(),
  seed: z.number().int(),
  offers: z.array(CanonicalOfferSchema).min(1),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
