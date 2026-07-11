import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { PurchasePlanSchema, type InterviewRequest, type InterviewResponse } from "../../../../packages/contracts/src/index.js";
import { ApiError } from "../errors.js";

export const PRODUCT_INTERVIEW_INSTRUCTIONS = `Jesteś doradcą zakupowym. Prowadzisz naturalną, adaptacyjną rozmowę przed wyszukiwaniem produktów. Nie masz limitu pytań, ale każde pytanie musi wnosić nową informację i rozmowa ma być możliwie zwięzła.
Najpierw zrozum cel użytkownika, a nie tylko nazwę produktu. Pytaj wyłącznie o brakujące informacje, bez których wyniki byłyby bezużyteczne lub wyraźnie nietrafione. Priorytet mają kluczowy wariant produktu, maksymalny pełny koszt z dostawą oraz termin. Preferencje, stan, akcesoria i poziom autonomii przyjmij rozsądnie lub pozostaw elastyczne, jeśli nie są krytyczne dla danego zakupu.
Ask about money exactly once using a simple question: "How much do you want to spend?" The user's answer is always the hard maximum TOTAL including product price, shipping, fees and delivery. Never ask a separate delivery-budget question, never ask whether delivery is included, and never ask the user to reconfirm the same amount.
Nie pytaj o rozmiar, jeśli dana kategoria nie ma standardowego parametru rozmiaru. W szczególności przy zakupie gitary nie pytaj o jej rozmiar; jeśli wariant instrumentu ma realne znaczenie, zapytaj najwyżej o typ gitary lub przeznaczenie.
If the user says they are unsure, asks you to choose, or selects a "most versatile" option, make a sensible default choice, record it as decided, and never ask another question about the same variant dimension.
Zadawaj jedno krótkie pytanie naraz. Nie pytaj ponownie o informacje już podane. Obowiązuje kolejność: (1) produkt i kluczowy wariant, (2) czy potrzebny jest sam produkt czy także sensowne akcesoria/zestaw, (3) stan nowy/używany, (4) jedna kwota all-in, (5) strategia BUY NOW albo WAIT FOR THE RIGHT PRICE. Pytanie o strategię jest zawsze ostatnim pytaniem. Po odpowiedzi na nie nie wolno zadawać żadnych dalszych pytań — zwróć READY. Gdy cel sugeruje kompletne rozwiązanie, wskaż kategorie uzupełniające, ale nie wciskaj dodatków.
Na każdym kroku aktualizuj plan: goal, wszystkie poznane parameters oraz categories potrzebne do wyszukiwania. Kategorie wybierasz samodzielnie na podstawie celu. Rozróżniaj kategorię główną od koniecznych elementów całego rozwiązania. Dla każdej kategorii utwórz konkretną query do wyszukiwarki.
Always respond in English, even when the user writes in another language. Keep the tone natural, concise and helpful.
Gdy brakuje danych krytycznych, ustaw status QUESTION i plan null. Konkretna specyfikacja produktu, pełny budżet oraz strategia KUP TERAZ / CZEKAJ NA ODPOWIEDNIĄ CENĘ są zawsze krytyczne. Nie wolno ustawić READY, dopóki użytkownik ich nie poda. Każde pytanie zwraca 2-4 krótkie opcje, ale użytkownik może też wpisać własną odpowiedź. Gdy masz komplet, zwięźle podsumuj ustalenia i ustaw status READY z pustą tablicą options. W brief i planie zapisz strategię zakupu jako wymagany parametr. Brief musi być samodzielnym opisem planu zakupu; nie wymyślaj niepodanych ograniczeń. Plan nie może być null przy READY. Nie rekomenduj jeszcze konkretnego modelu produktu ani sklepu.`;

export const VOICE_INTERVIEW_INSTRUCTIONS = `${PRODUCT_INTERVIEW_INSTRUCTIONS}
You are speaking with the user. Always speak English. Use at most two short sentences and ask one question at a time. At the beginning, greet the user briefly and ask what they want to buy. Do not read long lists or technical summaries aloud.
Nie pytaj o techniczny poziom autonomii. Zapytaj naturalnie, czy kupić teraz, czy czekać na odpowiednią cenę.
Gdy znasz już konkretny produkt i wariant, strategię zakupu oraz pełny budżet z dostawą, wywołaj narzędzie finalize_purchase_plan z krótkim podsumowaniem ustaleń. Nie pytaj o zgodę na wywołanie narzędzia. Jeśli narzędzie odpowie, że brakuje danych, zadaj użytkownikowi dokładnie wskazane pytanie.`;

export const VOICE_FINALIZE_TOOL = {
  type: "function",
  name: "finalize_purchase_plan",
  description:
    "Call when the shopping interview is complete: product, key variant, buy-now or wait-for-price strategy, condition, and full delivered budget are known.",
  parameters: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Concise English summary: product, requirements, purchase strategy, condition, and full delivered budget.",
      },
    },
    required: ["summary"],
  },
} as const;

const TurnSchema = z.object({
  assistantMessage: z.string().min(1),
  status: z.enum(["QUESTION", "READY"]),
  options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).max(5),
  brief: z.string().min(8).nullable(),
  plan: PurchasePlanSchema.nullable(),
});

export interface ProductInterviewer {
  readonly kind: "fixture" | "openai";
  respond(input: InterviewRequest): Promise<Omit<InterviewResponse, "interviewer">>;
}

export class OpenAIProductInterviewer implements ProductInterviewer {
  readonly kind = "openai" as const;
  private readonly client: OpenAI;
  private readonly fallback = new FixtureProductInterviewer();

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey, timeout: 10_000, maxRetries: 0 });
  }

  async respond(input: InterviewRequest): Promise<Omit<InterviewResponse, "interviewer">> {
    try {
      const questionsAsked = input.messages.filter((message) => message.role === "assistant").length;
      const userMessages = input.messages.filter((message) => message.role === "user");
      const allUserText = userMessages.map((message) => message.content).join(" ");
      const userProvidedBudget = userMessages.some((message) => hasExplicitBudget(message.content));
      const userProvidedTiming = userMessages.some((message) => hasExplicitTiming(message.content));
      const accessoryDecisionKnown = hasAccessoryDecision(allUserText);
      const conditionKnown = hasConditionDecision(allUserText);
      const knownFacts = `\nSERVER-VERIFIED FACTS: user's selected currency is ${input.baseCurrency}; accessory/setup choice ${accessoryDecisionKnown ? "IS already known" : "is missing"}; condition choice ${conditionKnown ? "IS already known" : "is missing"}; total budget including every delivery cost ${userProvidedBudget ? "IS already known" : "is missing"}; purchase strategy ${userProvidedTiming ? "IS already known and MUST be the final answer" : "is missing"}. Any amount stated by the user is automatically the hard delivered-total cap. Discuss and summarize all money in ${input.baseCurrency}. Never ask again for a fact marked as already known and never ask separately about delivery cost.`;
      const response = await this.client.responses.parse({
        model: this.model,
        instructions: PRODUCT_INTERVIEW_INSTRUCTIONS + knownFacts,
        input: input.messages,
        reasoning: { effort: "none" },
        text: { format: zodTextFormat(TurnSchema, "product_interview_turn") },
      });
      if (!response.output_parsed) throw new Error("missing parsed output");
      const turn = TurnSchema.parse(response.output_parsed);
      const triesToCloseInterview = turn.status === "READY" || /budget|spend|buy\s*[_ -]?now|wait|right price/i.test(turn.assistantMessage);
      if (triesToCloseInterview && !accessoryDecisionKnown) {
        return {
          status: "QUESTION", brief: null, plan: null, questionNumber: questionsAsked + 1, maxQuestions: null,
          assistantMessage: "Do you want the product only, or should I include the essential accessories as a complete starter setup?",
          options: [
            { label: "Product only", value: "I want the product only, without extra accessories." },
            { label: "Complete starter setup", value: "I want a complete starter setup with the essential accessories." },
            { label: "Show both routes", value: "Compare the product-only option with a complete starter setup." },
          ],
        };
      }
      if (triesToCloseInterview && !conditionKnown) {
        return {
          status: "QUESTION", brief: null, plan: null, questionNumber: questionsAsked + 1, maxQuestions: null,
          assistantMessage: "Should it be new, or is a used product in good condition acceptable?",
          options: [
            { label: "New only", value: "The product must be new." },
            { label: "Used is fine", value: "A used product in good condition is acceptable." },
            { label: "Either", value: "New or used is fine; prioritize the best value." },
          ],
        };
      }
      if (userProvidedTiming && userProvidedBudget && accessoryDecisionKnown && conditionKnown && turn.status === "QUESTION") {
        return this.fallback.respond(input);
      }
      if (turn.status === "READY" && (!userProvidedBudget || !userProvidedTiming)) {
        return this.fallback.respond(input);
      }
      if (turn.status === "READY" && (!turn.plan || !turn.brief)) {
        throw new ApiError(422, "INTERVIEW_RESULT_INVALID", "Model zakończył wywiad bez kompletnego planu zakupu.");
      }
      if (turn.status === "QUESTION" && turn.options.length === 0) {
        // Każde pytanie musi mieć odpowiedzi zamknięte do kliknięcia — bez nich wracamy do fallbacku.
        throw new Error("question without options");
      }
      return {
        ...turn,
        options: turn.status === "QUESTION" ? turn.options : [],
        brief: turn.status === "QUESTION" ? null : turn.brief,
        plan: turn.status === "QUESTION" ? null : turn.plan,
        questionNumber: turn.status === "QUESTION" ? questionsAsked + 1 : questionsAsked,
        maxQuestions: null,
      };
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 422) throw error;
      return this.fallback.respond(input);
    }
  }
}

export class FixtureProductInterviewer implements ProductInterviewer {
  readonly kind = "fixture" as const;

  async respond(input: InterviewRequest): Promise<Omit<InterviewResponse, "interviewer">> {
    const userText = input.messages.filter((message) => message.role === "user").map((message) => message.content).join(" ");
    const lower = userText.toLocaleLowerCase();
    const hasBudget = hasExplicitBudget(userText);
    const hasTiming = hasExplicitTiming(userText);
    const hasCondition = hasConditionDecision(userText);
    const hasAccessories = hasAccessoryDecision(userText);
    const questionsAsked = input.messages.filter((message) => message.role === "assistant").length;
    if (!hasAccessories) return { status: "QUESTION", options: [{ label: "Product only", value: "I want the product only, without extra accessories." }, { label: "Complete starter setup", value: "I want a complete starter setup with the essential accessories." }, { label: "Show both routes", value: "Compare the product-only option with a complete starter setup." }], questionNumber: questionsAsked + 1, maxQuestions: null, brief: null, plan: null, assistantMessage: "Do you want the product only, or should I include the essential accessories as a complete starter setup?" };
    if (!hasCondition) return { status: "QUESTION", options: [{ label: "New only", value: "The product must be new." }, { label: "Used is fine", value: "A used product in good condition is acceptable." }, { label: "Either", value: "Condition is flexible; prioritize the best offer." }], questionNumber: questionsAsked + 1, maxQuestions: null, brief: null, plan: null, assistantMessage: "Should the product be new, or is used acceptable?" };
    if (!hasBudget) return { status: "QUESTION", options: [500, 1500, 3000].map(amount => ({ label: `Up to ${input.baseCurrency} ${amount.toLocaleString("en")}`, value: `I want to spend up to ${input.baseCurrency} ${amount}.` })), questionNumber: questionsAsked + 1, maxQuestions: null, brief: null, plan: null, assistantMessage: `How much do you want to spend, in ${input.baseCurrency}?` };
    if (!hasTiming) return { status: "QUESTION", options: [{ label: "Buy now", value: "I choose BUY NOW. Find the best matching offer available now within my budget." }, { label: "Wait for the right price", value: "I choose WAIT FOR THE RIGHT PRICE within my budget." }], questionNumber: questionsAsked + 1, maxQuestions: null, brief: null, plan: null, assistantMessage: "Should I find the best offer to buy now, or wait for the right price?" };
    return {
      status: "READY",
      options: [],
      questionNumber: questionsAsked,
      maxQuestions: null,
      brief: userText,
      plan: {
        goal: userText.split(". ")[0] ?? userText,
        summary: userText,
        parameters: [{ name: "Ustalenia", value: userText, priority: "REQUIRED" }],
        categories: [{ name: "Main product", purpose: "Fulfil the user's purchase goal", required: true, query: userText }],
      },
      assistantMessage: "I have everything I need. Review and approve the draft mandate when you are ready for me to start hunting.",
    };
  }
}

export function hasExplicitBudget(text: string): boolean {
  return /(?:do|budżet|budget|limit|maksymalnie|max(?:imum)?|up to)\D{0,40}\d[\d\s]*(?:[.,]\d{1,2})?\s*(?:pln|eur|usd|gbp|zł)|\d[\d\s]*(?:[.,]\d{1,2})?\s*(?:pln|eur|usd|gbp|zł)|(?:pln|eur|usd|gbp|zł)\s*\d[\d\s]*(?:[.,]\d{1,2})?/i.test(text);
}

export function hasExplicitTiming(text: string): boolean {
  return /(?:dziś|jutro|teraz|od razu|kup\s+teraz|czek|odpowiedni[aą]\s+cen|dobra\s+cen|bez terminu|nie spieszy|today|tomorrow|buy[\s_-]*(?:it[\s_-]*)?now|buy[^.!?]{0,50}\bnow\b|offer\s+now|purchase\s+now|wait(?:ing)?[^.!?]{0,50}(?:price|deal)|right\s+price|find[^.!?]{0,20}\blater\b|no deadline)/i.test(text);
}

export function hasAccessoryDecision(text: string): boolean {
  return /(?:product|guitar|item)\s+only|without\s+(?:extra\s+)?accessor|complete\s+(?:starter\s+)?setup|starter\s+(?:kit|bundle|setup)|essential\s+accessor|show\s+both\s+routes|compare[^.!?]{0,30}(?:setup|accessor)|gig\s+bag|tuner|amplifier|\bamp\b|cable/i.test(text);
}

export function hasConditionDecision(text: string): boolean {
  return /(?:must\s+be\s+new|new\s+only|used\s+(?:is\s+)?(?:fine|acceptable)|new\s+or\s+used|condition\s+is\s+flexible|stan|nowy|nowa|nowe|używan)/i.test(text);
}
