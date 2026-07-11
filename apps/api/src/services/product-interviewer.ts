import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { PurchasePlanSchema, type InterviewRequest, type InterviewResponse } from "../../../../packages/contracts/src/index.js";
import { ApiError } from "../errors.js";

export const PRODUCT_INTERVIEW_INSTRUCTIONS = `Jesteś doradcą zakupowym. Prowadzisz krótki, adaptacyjny wywiad przed wyszukiwaniem produktów.
Najpierw zrozum cel użytkownika, a nie tylko nazwę produktu. Pytaj o brakujące informacje mające realny wpływ na wybór: zastosowanie i poziom doświadczenia, wymagania konieczne i preferencje, posiadany sprzęt lub kompatybilność, termin zakupu, kraj dostawy, stan nowy/używany, maksymalny pełny koszt z dostawą oraz oczekiwany poziom autonomii zakupowej.
Zadawaj najwyżej dwa blisko powiązane pytania naraz. Nie pytaj ponownie o informacje już podane. Gdy cel sugeruje kompletne rozwiązanie, wskaż kategorie uzupełniające, ale nie wciskaj dodatków. Przykład: nauka gry na gitarze może wymagać gitary, akcesoriów i wyboru sposobu nauki.
Na każdym kroku aktualizuj plan: goal, wszystkie poznane parameters oraz categories potrzebne do wyszukiwania. Kategorie wybierasz samodzielnie na podstawie celu. Rozróżniaj kategorię główną od koniecznych elementów całego rozwiązania. Dla każdej kategorii utwórz konkretną query do wyszukiwarki.
Gdy brakuje danych istotnych dla dobrego porównania, ustaw status QUESTION i plan null. Dla pytania zwróć 2-5 krótkich, rozłącznych opcji odpowiedzi, które pokrywają typowe wybory. Nie dodawaj opcji „inne”, ponieważ interfejs zawsze udostępnia własną odpowiedź. Gdy masz wystarczające dane, zwięźle podsumuj ustalenia i ustaw status READY, zwróć pustą tablicę options. Brief musi wtedy być samodzielnym, jednoznacznym opisem planu zakupu i zawierać pełny budżet. Plan nie może być null przy READY. Nie rekomenduj jeszcze konkretnego modelu produktu ani sklepu.`;

export const MAX_INTERVIEW_QUESTIONS = 4;

export const VOICE_INTERVIEW_INSTRUCTIONS = `${PRODUCT_INTERVIEW_INSTRUCTIONS}
Rozmawiasz z użytkownikiem głosowo, po polsku. Mów naturalnie i zwięźle: maksymalnie dwa krótkie zdania naraz i jedno pytanie naraz. Jeśli rozmowa dopiero się zaczyna, przywitaj się jednym zdaniem i zapytaj, co użytkownik chce osiągnąć. Nie czytaj na głos długich list ani technicznych podsumowań.
W rozmowie głosowej zadaj łącznie najwyżej ${MAX_INTERVIEW_QUESTIONS} pytania i nie pytaj o poziom autonomii zakupowej, chyba że użytkownik sam poruszy ten temat.
Gdy znasz już cel, kluczowe wymagania, termin, akceptowany stan produktu i pełny budżet z dostawą, wywołaj narzędzie finalize_purchase_plan z krótkim podsumowaniem ustaleń. Nie pytaj o zgodę na wywołanie narzędzia. Gdy użytkownik powie, że nie ma nic więcej do dodania, poprosi o zakończenie albo odmówi odpowiedzi, natychmiast wywołaj finalize_purchase_plan z najlepszym możliwym podsumowaniem zamiast ponawiać pytanie. Jeśli narzędzie odpowie, że brakuje danych, zadaj użytkownikowi dokładnie wskazane pytanie.`;

export const VOICE_FINALIZE_TOOL = {
  type: "function",
  name: "finalize_purchase_plan",
  description:
    "Wywołaj, gdy wywiad zakupowy jest kompletny: znasz cel, kluczowe wymagania, termin, akceptowany stan produktu i pełny budżet z dostawą. Narzędzie kompiluje plan zakupu i uruchamia wyszukiwanie produktów.",
  parameters: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Zwięzłe podsumowanie ustaleń po polsku: cel, wymagania, termin, stan produktu i pełny budżet z dostawą.",
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
      const mustFinish = questionsAsked >= MAX_INTERVIEW_QUESTIONS;
      const response = await this.client.responses.parse({
        model: this.model,
        instructions: PRODUCT_INTERVIEW_INSTRUCTIONS + (mustFinish
          ? " Osiągnięto twardy limit pytań. Musisz teraz zwrócić status READY i najlepszy możliwy kompletny plan na podstawie dostępnych danych. Nie zadawaj kolejnego pytania."
          : ` Możesz zadać jeszcze maksymalnie ${MAX_INTERVIEW_QUESTIONS - questionsAsked} pytania.`),
        input: input.messages,
        reasoning: { effort: "none" },
        text: { format: zodTextFormat(TurnSchema, "product_interview_turn") },
      });
      if (!response.output_parsed) throw new Error("missing parsed output");
      const turn = TurnSchema.parse(response.output_parsed);
      if (mustFinish && turn.status !== "READY") {
        throw new ApiError(422, "INTERVIEW_LIMIT_INVALID", "Model nie zakończył wywiadu po osiągnięciu limitu pytań.");
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
        maxQuestions: MAX_INTERVIEW_QUESTIONS,
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
    const hasBudget = /(?:do|budżet|maksymalnie)\s*\d+|\d+\s*(?:pln|eur|usd|gbp|zł)/i.test(userText);
    const hasTiming = /(?:dziś|jutro|tygod|miesią|do\s+\w+|nie spieszy)/i.test(userText);
    const hasCondition = /(?:now|używan)/i.test(userText);
    const questionsAsked = input.messages.filter((message) => message.role === "assistant").length;
    if (!hasBudget && questionsAsked < MAX_INTERVIEW_QUESTIONS) return { status: "QUESTION", options: [{ label: "Do 500 zł", value: "Mój pełny budżet to 500 PLN z dostawą." }, { label: "Do 1500 zł", value: "Mój pełny budżet to 1500 PLN z dostawą." }, { label: "Do 3000 zł", value: "Mój pełny budżet to 3000 PLN z dostawą." }], questionNumber: questionsAsked + 1, maxQuestions: MAX_INTERVIEW_QUESTIONS, brief: null, plan: null, assistantMessage: "Jaki jest maksymalny budżet łącznie z dostawą?" };
    if ((!hasTiming || !hasCondition) && questionsAsked < MAX_INTERVIEW_QUESTIONS) return { status: "QUESTION", options: [{ label: "Nowy, w tym miesiącu", value: "Produkt ma być nowy i chcę kupić w tym miesiącu." }, { label: "Używany, bez pośpiechu", value: "Dopuszczam produkt używany i nie spieszy mi się." }, { label: "Oba warianty", value: "Dopuszczam nowy lub używany produkt, zależnie od opłacalności." }], questionNumber: questionsAsked + 1, maxQuestions: MAX_INTERVIEW_QUESTIONS, brief: null, plan: null, assistantMessage: "Kiedy chcesz kupić i jaki stan produktu dopuszczasz?" };
    return {
      status: "READY",
      options: [],
      questionNumber: questionsAsked,
      maxQuestions: MAX_INTERVIEW_QUESTIONS,
      brief: userText,
      plan: {
        goal: userText.split(". ")[0] ?? userText,
        summary: userText,
        parameters: [{ name: "Ustalenia", value: userText, priority: "REQUIRED" }],
        categories: [{ name: "Produkt główny", purpose: "Realizacja celu użytkownika", required: true, query: userText }],
      },
      assistantMessage: "Mam komplet najważniejszych ustaleń. Rozpoczynam wyszukiwanie dopasowanych produktów.",
    };
  }
}
