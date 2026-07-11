import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { PurchasePlanSchema, type InterviewMessage, type InterviewRequest, type InterviewResponse } from "../../../../packages/contracts/src/index.js";
import { ApiError } from "../errors.js";

export const PRODUCT_INTERVIEW_INSTRUCTIONS = `Jesteś doradcą zakupowym. Prowadzisz naturalną, adaptacyjną rozmowę przed wyszukiwaniem produktów. Nie masz limitu pytań, ale każde pytanie musi wnosić nową informację i rozmowa ma być możliwie zwięzła.
Najpierw zrozum cel użytkownika, a nie tylko nazwę produktu. Pytaj wyłącznie o brakujące informacje, bez których wyniki byłyby bezużyteczne lub wyraźnie nietrafione. Priorytet mają kluczowy wariant produktu, maksymalny pełny koszt z dostawą oraz termin. Preferencje, stan, akcesoria i poziom autonomii przyjmij rozsądnie lub pozostaw elastyczne, jeśli nie są krytyczne dla danego zakupu.
Ask about money exactly once using a simple question: "How much do you want to spend?" The user's answer is always the hard maximum TOTAL including product price, shipping, fees and delivery. Never ask a separate delivery-budget question, never ask whether delivery is included, and never ask the user to reconfirm the same amount.
Nie pytaj o rozmiar, jeśli dana kategoria nie ma standardowego parametru rozmiaru. W szczególności przy zakupie gitary nie pytaj o jej rozmiar; jeśli wariant instrumentu ma realne znaczenie, zapytaj najwyżej o typ gitary lub przeznaczenie.
Ask about new versus used only when a second-hand market is sensible for the actual product. For personal hygiene, oral care, cosmetics, food, supplements, medicines, consumables, underwear and similar safety-sensitive products, silently assume NEW, record NEW in the plan, and never offer a used option.
If the user says they are unsure, asks you to choose, or selects a "most versatile" option, make a sensible default choice, record it as decided, and never ask another question about the same variant dimension.
Zadawaj jedno krótkie pytanie naraz. Nie pytaj ponownie o informacje już podane. Obowiązuje kolejność: (1) produkt i kluczowy wariant, (2) czy potrzebny jest sam produkt czy także sensowne akcesoria/zestaw, (3) stan nowy/używany, (4) jedna kwota all-in, (5) strategia BUY NOW albo WAIT FOR THE RIGHT PRICE. Pytanie o strategię jest zawsze ostatnim pytaniem. Po odpowiedzi na nie nie wolno zadawać żadnych dalszych pytań — zwróć READY. Gdy cel sugeruje kompletne rozwiązanie, wskaż kategorie uzupełniające, ale nie wciskaj dodatków.
Na każdym kroku aktualizuj plan: goal, wszystkie poznane parameters oraz categories potrzebne do wyszukiwania. Kategorie wybierasz samodzielnie na podstawie celu. Rozróżniaj kategorię główną od koniecznych elementów całego rozwiązania. Dla każdej kategorii utwórz konkretną query do wyszukiwarki.
Always respond in English, even when the user writes in another language. Keep the tone natural, concise and helpful.
Gdy brakuje danych krytycznych, ustaw status QUESTION i plan null. Konkretna specyfikacja produktu, pełny budżet oraz strategia KUP TERAZ / CZEKAJ NA ODPOWIEDNIĄ CENĘ są zawsze krytyczne. Nie wolno ustawić READY, dopóki użytkownik ich nie poda. Każde pytanie zwraca 2-4 krótkie opcje, ale użytkownik może też wpisać własną odpowiedź. Gdy masz komplet, zwięźle podsumuj ustalenia i ustaw status READY z pustą tablicą options. W brief i planie zapisz strategię zakupu jako wymagany parametr. Brief musi być samodzielnym opisem planu zakupu; nie wymyślaj niepodanych ograniczeń. Plan nie może być null przy READY. Nie rekomenduj jeszcze konkretnego modelu produktu ani sklepu.
Przy READY wygeneruj chatTitle: naturalny angielski tytuł historii rozmowy, 2-5 słów, opisujący zakup, np. "Toothbrush purchase", "Acoustic guitar search" albo "Beginner guitar setup". Nie używaj powitania, budżetu ani technicznych kodów. Przy QUESTION ustaw chatTitle na null.`;

const TurnSchema = z.object({
  assistantMessage: z.string().min(1),
  status: z.enum(["QUESTION", "READY"]),
  options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).max(5),
  brief: z.string().min(8).nullable(),
  plan: PurchasePlanSchema.nullable(),
  chatTitle: z.string().min(2).max(48).nullable(),
});

export interface ProductInterviewer {
  readonly kind: "fixture" | "openai";
  respond(input: InterviewRequest): Promise<Omit<InterviewResponse, "interviewer">>;
}

export class OpenAIProductInterviewer implements ProductInterviewer {
  readonly kind = "openai" as const;
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new OpenAI({ apiKey, timeout: 10_000, maxRetries: 0 });
  }

  async respond(input: InterviewRequest): Promise<Omit<InterviewResponse, "interviewer">> {
    try {
      const questionsAsked = input.messages.filter((message) => message.role === "assistant").length;
      const userMessages = input.messages.filter((message) => message.role === "user");
      const allUserText = userMessages.map((message) => message.content).join(" ");
      const userProvidedBudget = hasBudgetDecision(input.messages);
      const userProvidedTiming = userMessages.some((message) => hasExplicitTiming(message.content));
      const accessoryDecisionKnown = hasAccessoryDecision(allUserText) || hasContextualAccessoryDecision(input.messages);
      const conditionChoiceRequired = requiresConditionChoice(allUserText);
      const conditionKnown = !conditionChoiceRequired || hasConditionDecision(allUserText) || hasContextualConditionDecision(input.messages);
      const knownFacts = `\nSERVER-VERIFIED FACTS: user's selected currency is ${input.baseCurrency}; accessory/setup choice ${accessoryDecisionKnown ? "IS already known" : "is missing"}; condition choice ${conditionChoiceRequired ? (conditionKnown ? "IS already known" : "is missing") : "is not applicable — default to NEW and DO NOT ask"}; total budget including every delivery cost ${userProvidedBudget ? "IS already known" : "is missing"}; purchase strategy ${userProvidedTiming ? "IS already known and MUST be the final answer" : "is missing"}. Any amount stated by the user is automatically the hard delivered-total cap. Discuss and summarize all money in ${input.baseCurrency}. Never ask again for a fact marked as already known and never ask separately about delivery cost.`;
      let turn = await this.generateTurn(input, knownFacts);
      for (let correctionAttempt = 0; correctionAttempt < 2; correctionAttempt += 1) {
        const triesToCloseInterview = turn.status === "READY" || /budget|spend|buy\s*[_ -]?now|wait|right price/i.test(turn.assistantMessage);
        const asksInapplicableCondition = !conditionChoiceRequired && turn.status === "QUESTION" && (
          /new.*used|used.*new|condition/i.test(turn.assistantMessage) || turn.options.some(option => /\bused\b/i.test(`${option.label} ${option.value}`))
        );
        let correction: string | null = null;
        if (asksInapplicableCondition) {
          correction = "This product category must default to NEW for hygiene or safety reasons. Never ask about used condition and never offer a used option. Ask the next unresolved contextual question in the required sequence, with LLM-generated options.";
        } else if (triesToCloseInterview && !accessoryDecisionKnown) {
          correction = "Your previous response tried to close the interview too early. Ask the single most relevant contextual question about product-only versus useful accessories/setup. Generate 2-4 concise options tailored to the actual product discussed. Return QUESTION.";
        } else if (triesToCloseInterview && conditionChoiceRequired && !conditionKnown) {
          correction = "Your previous response tried to close the interview too early. Ask a concise, product-specific condition question before budget and strategy. Generate 2-4 contextual options. Return QUESTION.";
        } else if (turn.status === "QUESTION" && userProvidedBudget && asksBudgetQuestion(turn.assistantMessage, turn.options)) {
          correction = userProvidedTiming
            ? "The budget was already answered and is locked. All required facts are known. Return READY now with a complete English brief and purchase plan. Do not ask any more questions."
            : "The budget was already answered and is locked. Never ask about price, budget, delivery cost, or spending again. Ask only the final buy-now versus wait-for-price question with two options. Return QUESTION.";
        } else if (turn.status === "READY" && !userProvidedBudget) {
          correction = `The total all-in budget is missing. Ask exactly one natural question about how much the user wants to spend in ${input.baseCurrency}, with 2-4 context-appropriate price options. Return QUESTION.`;
        } else if (turn.status === "READY" && !userProvidedTiming) {
          correction = "The purchase strategy is missing. Ask the final question: buy now or wait for the right price. Generate two natural options whose values explicitly contain BUY_NOW and WAIT_FOR_THE_RIGHT_PRICE. Return QUESTION.";
        } else if (userProvidedTiming && userProvidedBudget && accessoryDecisionKnown && conditionKnown && turn.status === "QUESTION") {
          correction = "All required facts are already known and the purchase strategy was the final answer. Do not ask another question. Return READY with a complete English brief and purchase plan based only on the conversation.";
        } else if (turn.status === "QUESTION" && turn.options.length === 0) {
          correction = "Return the same best contextual follow-up question, but include 2-4 concise, mutually exclusive answer options generated from the conversation. Return QUESTION.";
        }
        if (!correction) break;
        turn = await this.generateTurn(input, `${knownFacts}\nCORRECTION REQUIRED: ${correction}`);
      }
      if (turn.status === "QUESTION" && userProvidedBudget && asksBudgetQuestion(turn.assistantMessage, turn.options)) {
        throw new ApiError(422, "INTERVIEW_RESULT_INVALID", "The model repeated a budget question after the budget was already locked.");
      }
      if (turn.status === "READY" && (!userProvidedBudget || !userProvidedTiming || !accessoryDecisionKnown || !conditionKnown)) {
        throw new ApiError(422, "INTERVIEW_RESULT_INVALID", "The model completed the interview without all required purchase facts.");
      }
      if (userProvidedTiming && userProvidedBudget && accessoryDecisionKnown && conditionKnown && turn.status === "QUESTION") {
        throw new ApiError(422, "INTERVIEW_RESULT_INVALID", "The model asked another question after the final purchase-strategy answer.");
      }
      if (turn.status === "READY" && (!turn.plan || !turn.brief)) {
        throw new ApiError(422, "INTERVIEW_RESULT_INVALID", "Model zakończył wywiad bez kompletnego planu zakupu.");
      }
      if (turn.status === "READY" && !turn.chatTitle) {
        throw new ApiError(422, "INTERVIEW_RESULT_INVALID", "The model completed the interview without an LLM-generated chat title.");
      }
      if (turn.status === "QUESTION" && turn.options.length === 0) {
        throw new ApiError(422, "INTERVIEW_RESULT_INVALID", "The model returned a follow-up question without suggested answers.");
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
      throw new ApiError(503, "INTERVIEW_UNAVAILABLE", "The AI shopping conversation is temporarily unavailable.");
    }
  }

  private async generateTurn(input: InterviewRequest, extraInstructions: string) {
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: PRODUCT_INTERVIEW_INSTRUCTIONS + extraInstructions,
      input: input.messages,
      reasoning: { effort: "none" },
      text: { format: zodTextFormat(TurnSchema, "product_interview_turn") },
    });
    if (!response.output_parsed) throw new Error("missing parsed output");
    return TurnSchema.parse(response.output_parsed);
  }
}

export class FixtureProductInterviewer implements ProductInterviewer {
  readonly kind = "fixture" as const;

  async respond(input: InterviewRequest): Promise<Omit<InterviewResponse, "interviewer">> {
    const userText = input.messages.filter((message) => message.role === "user").map((message) => message.content).join(" ");
    const lower = userText.toLocaleLowerCase();
    const hasBudget = hasBudgetDecision(input.messages);
    const hasTiming = hasExplicitTiming(userText);
    const hasCondition = !requiresConditionChoice(userText) || hasConditionDecision(userText) || hasContextualConditionDecision(input.messages);
    const hasAccessories = hasAccessoryDecision(userText) || hasContextualAccessoryDecision(input.messages);
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
      chatTitle: "Shopping request",
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
  return /(?:product|guitar|item)\s+only|just\s+(?:the\s+)?(?:product|guitar|item)|without\s+(?:extra\s+)?accessor|complete\s+(?:starter\s+)?setup|starter\s+(?:kit|bundle|setup)|essential\s+accessor|show\s+both\s+routes|compare[^.!?]{0,30}(?:setup|accessor)|gig\s+bag|tuner|amplifier|\bamp\b|cable/i.test(text);
}

export function hasConditionDecision(text: string): boolean {
  return /(?:must\s+be\s+new|\bnew\b|used\s+(?:is\s+)?(?:fine|acceptable)|\bused\b|condition\s+is\s+flexible|stan|nowy|nowa|nowe|używan)/i.test(text);
}

export function requiresConditionChoice(text: string): boolean {
  return !/(?:toothbrush|electric toothbrush|szczoteczk|oral care|toothpaste|hygiene|cosmetic|skincare|makeup|food|grocery|groceries|supplement|vitamin|medicine|medication|razor|deodorant|shampoo|soap|underwear|lingerie|diaper|nappy|baby bottle|contact lens|consumable)/i.test(text);
}

export function hasBudgetDecision(messages: InterviewMessage[]): boolean {
  if (messages.some((message) => message.role === "user" && hasExplicitBudget(message.content))) return true;
  return hasAnswerAfterQuestion(messages, /how much|budget|maximum.*spend|want to spend|all[- ]in.*(?:limit|cap)|spending limit|price limit/i, answer => /\d/.test(answer));
}

export function asksBudgetQuestion(message: string, options: Array<{ label: string; value: string }> = []): boolean {
  const content = `${message} ${options.map(option => `${option.label} ${option.value}`).join(" ")}`;
  return /how much|budget|spend|spending limit|price limit|all[- ]in.*(?:limit|cap)|maximum.*(?:pay|price|cost)|delivery.*(?:cost|included)/i.test(content);
}

export function hasContextualAccessoryDecision(messages: InterviewMessage[]): boolean {
  return hasAnswerAfterQuestion(messages, /just the|product only|guitar only|starter (?:bundle|setup|kit)|accessor|essentials/i, answer => /\S/.test(answer));
}

export function hasContextualConditionDecision(messages: InterviewMessage[]): boolean {
  return hasAnswerAfterQuestion(
    messages,
    /new or used|new.*used|used.*new|prefer a new|consider.*used|condition/i,
    answer => /\S/.test(answer),
  );
}

function hasAnswerAfterQuestion(messages: InterviewMessage[], question: RegExp, accepts: (answer: string) => boolean): boolean {
  for (let index = 0; index < messages.length - 1; index += 1) {
    const current = messages[index];
    const next = messages[index + 1];
    if (current?.role === "assistant" && question.test(current.content) && next?.role === "user" && accepts(next.content)) return true;
  }
  return false;
}
