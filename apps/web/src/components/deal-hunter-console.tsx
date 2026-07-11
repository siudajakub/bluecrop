"use client";
import React, { useState, useRef, useEffect } from 'react';
import '../app/globals.css';
import type {
  CanonicalOffer,
  CompileMandateResponse,
  Currency,
  Decision,
  InterviewMessage,
  InterviewResponse,
  Mandate,
  Money,
  PurchasePlan,
  ProductRecommendation,
  Receipt,
  RunEvent,
} from '@deal-hunter/contracts';
import {
  ApiClientError,
  approveMandate,
  checkoutDecision,
  compileMandate,
  getEvalSummary,
  getReceipt,
  listReceipts,
  mutateWinner,
  pollEvents,
  resetDemo,
  respondToInterview,
  revokeMandate,
  searchProducts,
  startRun,
  type EvalSummary,
} from '@/lib/api';
import { useVoiceInterview } from '@/lib/voice-interview';
import { ChevronUpIcon, type ChevronUpIconHandle } from './chevron-up-icon';
import { CirclePlusIcon, type CirclePlusIconHandle } from './circle-plus-icon';
import { Trash2Icon } from './trash2-icon';
import { AudioLinesIcon, type AudioLinesIconHandle } from './audio-lines-icon';
import BlurText from './blur-text';
import MetaBalls from './meta-balls';
import { motion, AnimatePresence } from 'motion/react';
import {
  DecisionCard,
  ErrorNote,
  MandateCard,
  OfferLine,
  ReceiptCard,
  RecommendationList,
  SearchTrace,
  SearchingCard,
  formatMoney,
  type ChatMessage,
} from './chat-cards';

interface ShoppingContext {
  budget?: { amount: number; currency: Currency; label: string };
  timing?: { label: string; purchaseBy: string | null };
}

type BusyAction = 'compile' | 'approve' | 'run' | 'mutate' | 'checkout' | 'revoke' | null;

interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  context: ShoppingContext;
  pendingBrief: string | null;
  ambiguities: CompileMandateResponse['ambiguities'];
  mandate: Mandate | null;
  runId: string | null;
  checkoutKey: string | null;
  purchasedDecisionIds: string[];
  mutatedOfferIds: string[];
  busy: BusyAction;
  interviewOptions: { label: string; value: string }[];
  purchasePlan: PurchasePlan | null;
  waitingForTime: boolean;
}

function dateAfterDays(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function uid() {
  return crypto.randomUUID();
}

function botText(text: string): ChatMessage {
  return { id: uid(), sender: 'bot', kind: 'text', text };
}

function botError(error: unknown): ChatMessage {
  if (error instanceof ApiClientError) {
    return { id: uid(), sender: 'bot', kind: 'error', code: error.code, text: error.message, reasonCodes: error.reasonCodes };
  }
  const text = error instanceof Error ? error.message : 'Unknown error.';
  return { id: uid(), sender: 'bot', kind: 'error', code: 'UNEXPECTED_ERROR', text, reasonCodes: [] };
}

function compileOptionsFor(context: ShoppingContext, preferredCurrency: Currency) {
  return {
    baseCurrency: context.budget?.currency ?? preferredCurrency,
    maxTotal: context.budget
      ? { amountMinor: Math.round(context.budget.amount * 100), currency: context.budget.currency }
      : undefined,
    purchaseBy: context.timing ? context.timing.purchaseBy : undefined,
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function DealHunterConsole() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [draftContext, setDraftContext] = useState<ShoppingContext>({});
  const [purchases, setPurchases] = useState<Receipt[]>([]);
  const [metrics, setMetrics] = useState<EvalSummary | null>(null);
  const [purchasesNotice, setPurchasesNotice] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUserPanelOpen, setIsUserPanelOpen] = useState(false);
  const [isPlusPopoverOpen, setIsPlusPopoverOpen] = useState(false);
  const [plusPopoverView, setPlusPopoverView] = useState<'menu' | 'budget' | 'time'>('menu');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState<Currency>('PLN');
  const [budgetCurrency, setBudgetCurrency] = useState<Currency>('PLN');
  const [timeChoice, setTimeChoice] = useState<'now' | 'later'>('now');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'chat' | 'purchases'>('chat');
  const [pendingCheckout, setPendingCheckout] = useState<{ chatId: string; decision: Decision } | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<ProductRecommendation | null>(null);
  const [mockPaymentComplete, setMockPaymentComplete] = useState(false);

  // Welcome message animation states
  const [phraseIndex, setPhraseIndex] = useState(0);

  const welcomePhrases = [
    "How can I help you, Alex?",
    "What are we shopping today?",
    "Looking for any deals, Alex?",
    "What's on your mind?"
  ];

  useEffect(() => {
    const currentChatIdStr = currentChatId || "";
    const msgs = chats.find(c => c.id === currentChatIdStr)?.messages || [];
    if (msgs.length > 0) return;

    const interval = setInterval(() => {
      setPhraseIndex(prev => (prev + 1) % welcomePhrases.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [chats, currentChatId]);

  const sendIconRef = useRef<ChevronUpIconHandle>(null);
  const plusIconRef = useRef<CirclePlusIconHandle>(null);
  const micIconRef = useRef<AudioLinesIconHandle>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cursorsRef = useRef<Record<string, string>>({});
  const chatsRef = useRef<Chat[]>([]);
  chatsRef.current = chats;
  const interviewsRef = useRef<Record<string, InterviewMessage[]>>({});
  const voiceChatIdRef = useRef<string | null>(null);

  const currentChat = chats.find(c => c.id === currentChatId);
  const messages = currentChat ? currentChat.messages : [];
  const isThinking = currentChat?.busy === 'compile' || currentChat?.busy === 'run';
  const activeContext = currentChat?.context ?? draftContext;
  const todayIso = new Date().toISOString().slice(0, 10);
  const quickDateOptions = [
    { label: '7 days', value: dateAfterDays(7) },
    { label: '2 weeks', value: dateAfterDays(14) },
    { label: '1 month', value: dateAfterDays(30) }
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isThinking]);

  useEffect(() => {
    // Load purchase history once on mount so it survives page reloads.
    void refreshReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeSidebarTab !== 'purchases') return;
    void refreshMetrics();
    void refreshReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSidebarTab]);

  const updateChat = (id: string, updater: (chat: Chat) => Chat) => {
    setChats(prev => prev.map(chat => (chat.id === id ? updater(chat) : chat)));
  };

  const appendMessages = (id: string, newMessages: ChatMessage[]) => {
    updateChat(id, chat => ({ ...chat, messages: [...chat.messages, ...newMessages] }));
  };

  const setChatBusy = (id: string, busy: BusyAction) => {
    updateChat(id, chat => ({ ...chat, busy }));
  };

  async function refreshMetrics() {
    try {
      setMetrics(await getEvalSummary());
    } catch {
      // Safety counters are best-effort; the chat surfaces API errors already.
    }
  }

  async function refreshReceipts() {
    try {
      const response = await listReceipts();
      setPurchases(prev => {
        const merged = [...response.receipts];
        for (const receipt of prev) {
          if (!merged.some(item => item.id === receipt.id)) merged.push(receipt);
        }
        return merged.sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.id.localeCompare(a.id));
      });
    } catch {
      // Purchase history is best-effort; session receipts still render.
    }
  }

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (voiceChatIdRef.current === id) voice.stop();
    delete interviewsRef.current[id];
    setChats(prev => prev.filter(c => c.id !== id));
    if (currentChatId === id) {
      setCurrentChatId(null);
    }
  };

  const handleSelectChat = (id: string) => {
    if (voice.state !== 'idle' && voiceChatIdRef.current !== id) voice.stop();
    setCurrentChatId(id);
  };

  const handleNewChat = () => {
    voice.stop();
    setCurrentChatId(null);
    setActiveSidebarTab('chat');
    setDraftContext({});
    setInputValue('');
    setIsPlusPopoverOpen(false);
  };

  const createChat = (title: string, messages: ChatMessage[]): Chat => {
    const chat: Chat = {
      id: Date.now().toString(),
      title: title.length > 20 ? title.substring(0, 20) + "..." : title,
      messages,
      context: draftContext,
      pendingBrief: null,
      ambiguities: [],
      mandate: null,
      runId: null,
      checkoutKey: null,
      purchasedDecisionIds: [],
      mutatedOfferIds: [],
      busy: null,
      interviewOptions: [],
      purchasePlan: null,
      waitingForTime: false,
    };
    setChats(prev => [chat, ...prev]);
    setCurrentChatId(chat.id);
    setDraftContext({});
    return chat;
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const userText = inputValue.trim();
    if (!userText || isSending) return;
    setInputValue("");
    void sendUserMessage(userText);
  };

  const sendUserMessage = async (userText: string) => {
    if (!userText || isSending) return;

    setIsSending(true);
    sendIconRef.current?.startAnimation();

    let activeId = currentChatId;
    let chat = chats.find(c => c.id === activeId);

    if (!activeId || !chat) {
      chat = createChat(userText, [{ id: uid(), sender: 'user', text: userText }]);
      activeId = chat.id;
    } else {
      appendMessages(activeId, [{ id: uid(), sender: 'user', text: userText }]);
      updateChat(activeId, c => ({ ...c, interviewOptions: [] }));
    }

    try {
      if (chat.waitingForTime) {
        updateChat(activeId, current => ({ ...current, waitingForTime: false, interviewOptions: [] }));
        appendMessages(activeId, [botText(`Price watch activated for ${userText}. I’ll keep the approved budget and product requirements unchanged.`)]);
        return;
      }
      if (voice.state !== 'idle' && voiceChatIdRef.current === activeId) {
        // An active voice conversation owns the interview: typed answers join it and the reply is spoken.
        pushInterviewEntry(activeId, 'user', userText);
        voice.sendUserText(userText);
        return;
      }
      if (!chat.mandate && !chat.pendingBrief) {
        await runInterviewTurn(activeId, userText, chat.context);
        return;
      }
      const answeringAmbiguities = chat.ambiguities.length > 0 && chat.pendingBrief;
      const brief = answeringAmbiguities ? `${chat.pendingBrief}, ${userText}` : userText;
      await compileBrief(activeId, brief, chat.context);
    } finally {
      setIsSending(false);
    }
  };

  const compileBrief = async (chatId: string, brief: string, context: ShoppingContext) => {
    setChatBusy(chatId, 'compile');
    try {
      const response = await compileMandate(brief, compileOptionsFor(context, preferredCurrency));
      updateChat(chatId, c => ({
        ...c,
        mandate: response.mandate,
        ambiguities: response.ambiguities,
        pendingBrief: brief,
      }));
      if (response.ambiguities.length) {
        appendMessages(chatId, [
          botText(response.error?.message ?? "I need a bit more detail before I can lock in this mandate:"),
          ...response.ambiguities.map(item => botText(item.question)),
        ]);
      } else {
        appendMessages(chatId, [
          botText("Here is the purchase mandate I compiled from your brief. Approve it and I'll start hunting."),
          { id: uid(), sender: 'bot', kind: 'mandate', compiled: response },
        ]);
      }
    } catch (error) {
      appendMessages(chatId, [botError(error)]);
    } finally {
      setChatBusy(chatId, null);
    }
  };

  const pushInterviewEntry = (chatId: string, role: InterviewMessage['role'], content: string) => {
    interviewsRef.current[chatId] = [...(interviewsRef.current[chatId] ?? []), { role, content }];
  };

  const runInterviewTurn = async (chatId: string, userText: string, context: ShoppingContext) => {
    const isFirstTurn = !(interviewsRef.current[chatId]?.length);
    const contextHints: string[] = [];
    if (isFirstTurn && context.budget) {
      contextHints.push(`My full budget including delivery is ${context.budget.amount} ${context.budget.currency}.`);
    }
    if (isFirstTurn && context.timing) {
      contextHints.push(context.timing.purchaseBy ? `I want to buy by ${context.timing.purchaseBy}.` : 'I want to buy right away.');
    }
    pushInterviewEntry(chatId, 'user', [userText, ...contextHints].join(' '));
    setChatBusy(chatId, 'compile');
    try {
      const response = await respondToInterview(interviewsRef.current[chatId] ?? [], preferredCurrency);
      pushInterviewEntry(chatId, 'assistant', response.assistantMessage);
      appendMessages(chatId, [botText(response.assistantMessage)]);
      if (response.status === 'READY' && response.brief && response.plan) {
        await finishInterview(chatId, response);
      } else {
        updateChat(chatId, c => ({ ...c, interviewOptions: response.options }));
      }
    } catch (error) {
      appendMessages(chatId, [botError(error)]);
    } finally {
      setChatBusy(chatId, null);
    }
  };

  const finishInterview = async (chatId: string, response: InterviewResponse) => {
    if (!response.brief || !response.plan) return;
    updateChat(chatId, c => ({ ...c, interviewOptions: [], purchasePlan: response.plan }));
    const context = chatsRef.current.find(c => c.id === chatId)?.context ?? {};
    await compileBrief(chatId, response.brief, context);
  };

  const searchRecommendations = async (chatId: string, plan: PurchasePlan) => {
    const searchingId = uid();
    appendMessages(chatId, [{ id: searchingId, sender: 'bot', kind: 'searching' }]);
    try {
      const results = await searchProducts(plan, preferredCurrency);
      const activity = results.searchActivity;
      updateChat(chatId, chat => ({ ...chat, messages: [
        ...chat.messages.filter(message => message.id !== searchingId),
        { id: uid(), sender: 'bot', kind: 'trace', sources: activity?.catalogOffersScanned ?? results.recommendations.length, categories: results.searchedCategories, sourceLabels: activity?.sources ?? ['OpenAI web search'], catalogMatches: activity?.catalogMatches ?? 0, webMatches: activity?.webMatches ?? results.recommendations.length, rejected: activity?.rejectedAsIrrelevant ?? 0 },
        { id: uid(), sender: 'bot', kind: 'recommendations', items: results.recommendations },
      ] }));
      const isWaitMode = /wait|right price|price watch|later/i.test(`${plan.summary} ${plan.parameters.map(item => item.value).join(' ')}`);
      if (results.recommendations.length === 0 && isWaitMode) {
        appendMessages(chatId, [botText("I couldn't find a verified offer inside your budget right now. How long should I keep watching?")]);
        updateChat(chatId, chat => ({ ...chat, waitingForTime: true, interviewOptions: [
          { label: '24 hours', value: 'the next 24 hours' },
          { label: '7 days', value: 'the next 7 days' },
          { label: '30 days', value: 'the next 30 days' },
        ] }));
      } else if (results.recommendations.length === 0) {
        appendMessages(chatId, [botText("I checked the catalog, scraper data, and live web search, but found no verified offer inside your approved all-in budget. I won't show an over-budget product. You can raise the budget or switch to Wait for the right price.")]);
      }
    } catch (error) {
      updateChat(chatId, chat => ({ ...chat, messages: chat.messages.filter(message => message.id !== searchingId) }));
      appendMessages(chatId, [botError(error)]);
    }
  };

  const voice = useVoiceInterview({
    onTranscript: (role, text) => {
      const chatId = voiceChatIdRef.current;
      if (!chatId) return;
      pushInterviewEntry(chatId, role, text);
      appendMessages(chatId, [role === 'user' ? { id: uid(), sender: 'user', text } : botText(text)]);
    },
    onFinalize: async (summary) => {
      const chatId = voiceChatIdRef.current;
      if (!chatId) return { kind: 'retry' };
      const history = interviewsRef.current[chatId] ?? [];
      const confirmation: InterviewMessage = {
        role: 'user',
        content: summary ? `I confirm the requirements: ${summary}` : 'I confirm the requirements from the voice conversation.',
      };
      setChatBusy(chatId, 'compile');
      try {
        const response = await respondToInterview([...history, confirmation], preferredCurrency);
        if (response.status === 'READY' && response.brief && response.plan) {
          await finishInterview(chatId, response);
          return { kind: 'done' };
        }
        return { kind: 'ask', question: response.assistantMessage };
      } catch (error) {
        appendMessages(chatId, [botError(error)]);
        return { kind: 'retry' };
      } finally {
        setChatBusy(chatId, null);
      }
    },
    onError: (message) => {
      const chatId = voiceChatIdRef.current ?? currentChatId;
      if (chatId) {
        appendMessages(chatId, [{ id: uid(), sender: 'bot', kind: 'error', code: 'VOICE_ERROR', text: message, reasonCodes: [] }]);
      }
    },
    onStop: () => {
      voiceChatIdRef.current = null;
    },
  });
  const isRecording = voice.state === 'listening';

  useEffect(() => {
    if (isRecording) {
      micIconRef.current?.startAnimation();
    } else {
      micIconRef.current?.stopAnimation();
    }
  }, [isRecording]);

  const handleApprove = async (chatId: string, mandate: Mandate) => {
    setChatBusy(chatId, 'approve');
    try {
      const response = await approveMandate(mandate);
      syncMandate(chatId, response.mandate);
      const plan = chatsRef.current.find(chat => chat.id === chatId)?.purchasePlan;
      appendMessages(chatId, [botText("Mandate approved. I’ll now search the catalog, verify live sources, and shortlist one product for you.")]);
      if (plan) await searchRecommendations(chatId, plan);
      else appendMessages(chatId, [botText("The purchase plan is missing. Start a new chat so I can collect the requirements again.")]);
    } catch (error) {
      appendMessages(chatId, [botError(error)]);
      setChatBusy(chatId, null);
    }
  };

  const handleRevoke = async (chatId: string, mandate: Mandate) => {
    setChatBusy(chatId, 'revoke');
    try {
      const response = await revokeMandate(mandate);
      syncMandate(chatId, response.mandate);
      appendMessages(chatId, [botText("Mandate revoked. Any checkout on decisions from this mandate is now blocked.")]);
    } catch (error) {
      appendMessages(chatId, [botError(error)]);
    } finally {
      setChatBusy(chatId, null);
    }
  };

  const syncMandate = (chatId: string, mandate: Mandate) => {
    updateChat(chatId, chat => ({
      ...chat,
      mandate: chat.mandate?.id === mandate.id ? mandate : chat.mandate,
      messages: chat.messages.map(message =>
        message.sender === 'bot' && message.kind === 'mandate' && message.compiled.mandate.id === mandate.id
          ? { ...message, compiled: { ...message.compiled, mandate } }
          : message
      ),
    }));
  };

  const runMonitoring = async (chatId: string, mandate: Mandate) => {
    setChatBusy(chatId, 'run');
    try {
      const checkoutKey = uid();
      const response = await startRun(mandate.id);
      cursorsRef.current[response.runId] = "0";
      updateChat(chatId, chat => ({ ...chat, runId: response.runId, checkoutKey }));
      await streamRunEvents(chatId, response.runId);
      await refreshMetrics();
    } catch (error) {
      appendMessages(chatId, [botError(error)]);
    } finally {
      setChatBusy(chatId, null);
    }
  };

  const streamRunEvents = async (chatId: string, runId: string) => {
    // Same cadence as the original console: poll every 700 ms while the run is RUNNING.
    for (;;) {
      const response = await pollEvents(runId, cursorsRef.current[runId] ?? "0");
      cursorsRef.current[runId] = response.nextCursor;
      await appendEventMessages(chatId, response.events);
      if (response.status !== 'RUNNING') break;
      await sleep(700);
    }
  };

  const appendEventMessages = async (chatId: string, events: RunEvent[]) => {
    for (const event of events) {
      const message = eventToMessage(event);
      if (!message) continue;
      appendMessages(chatId, [message]);
      await sleep(260);
    }
  };

  const eventToMessage = (event: RunEvent): ChatMessage | null => {
    switch (event.type) {
      case 'RUN_STARTED':
        return botText("Monitoring run started — replaying the golden-path scenario with a fixed seed.");
      case 'OFFER_RECEIVED': {
        const offer = event.data.offer as CanonicalOffer | undefined;
        return offer ? { id: uid(), sender: 'bot', kind: 'offer', offer } : null;
      }
      case 'DECISION_MADE':
        return { id: uid(), sender: 'bot', kind: 'decision', decision: event.data as unknown as Decision };
      case 'OFFER_MUTATED': {
        const data = event.data as { price?: Money; offerVersion?: number };
        return botText(
          data.price
            ? `Heads up — the seller changed the price to ${formatMoney(data.price)} (offer version ${data.offerVersion}).`
            : "Heads up — the offer changed after the decision."
        );
      }
      case 'RUN_COMPLETED':
        return botText("Run completed — every offer has been evaluated.");
    }
  };

  const handleCheckout = async (chatId: string, decision: Decision) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    const checkoutKey = chat.checkoutKey ?? uid();
    if (!chat.checkoutKey) updateChat(chatId, c => ({ ...c, checkoutKey }));
    setChatBusy(chatId, 'checkout');
    try {
      const result = await checkoutDecision(decision, checkoutKey);
      const receipt = await getReceipt(result.receiptId);
      updateChat(chatId, c => ({
        ...c,
        purchasedDecisionIds: c.purchasedDecisionIds.includes(decision.id)
          ? c.purchasedDecisionIds
          : [...c.purchasedDecisionIds, decision.id],
      }));
      setPurchases(prev => (prev.some(item => item.id === receipt.id) ? prev : [receipt, ...prev]));
      if (result.idempotentReplay) {
        appendMessages(chatId, [botText("The retry returned the same purchase — idempotency holds, no duplicate buy.")]);
      } else {
        appendMessages(chatId, [
          botText("Test checkout completed. Here is your trust receipt:"),
          { id: uid(), sender: 'bot', kind: 'receipt', receipt },
        ]);
      }
      await refreshMetrics();
    } catch (error) {
      appendMessages(chatId, [botError(error)]);
    } finally {
      setChatBusy(chatId, null);
    }
  };

  const handleMutate = async (chatId: string, decision: Decision) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat?.runId) return;
    const runId = chat.runId;
    setChatBusy(chatId, 'mutate');
    try {
      await mutateWinner(runId, decision.offerId);
      updateChat(chatId, c => ({
        ...c,
        mutatedOfferIds: c.mutatedOfferIds.includes(decision.offerId)
          ? c.mutatedOfferIds
          : [...c.mutatedOfferIds, decision.offerId],
      }));
      const response = await pollEvents(runId, cursorsRef.current[runId] ?? "0");
      cursorsRef.current[runId] = response.nextCursor;
      await appendEventMessages(chatId, response.events);
      if (!chat.purchasedDecisionIds.includes(decision.id)) {
        appendMessages(chatId, [botText("Try the checkout now — revalidation should block the stale decision.")]);
      }
    } catch (error) {
      appendMessages(chatId, [botError(error)]);
    } finally {
      setChatBusy(chatId, null);
    }
  };

  const handleResetDemo = async () => {
    if (isResetting) return;
    setIsResetting(true);
    setPurchasesNotice(null);
    try {
      voice.stop();
      await resetDemo();
      setChats([]);
      setCurrentChatId(null);
      setDraftContext({});
      setPurchases([]);
      cursorsRef.current = {};
      interviewsRef.current = {};
      setMetrics(await getEvalSummary().catch(() => null));
      setPurchasesNotice("Demo reset — mandates, runs and receipts were cleared.");
    } catch (error) {
      setPurchasesNotice(error instanceof ApiClientError ? `${error.code}: ${error.message}` : 'Reset failed.');
    } finally {
      setIsResetting(false);
    }
  };

  const toggleRecording = () => {
    if (voice.state !== 'idle') {
      voice.stop();
      return;
    }
    let activeId = currentChatId;
    if (!activeId || !chats.some(c => c.id === activeId)) {
      activeId = createChat('Voice conversation', []).id;
    }
    voiceChatIdRef.current = activeId;
    void voice.start(interviewsRef.current[activeId] ?? []);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const togglePlusPopover = () => {
    if (!isPlusPopoverOpen) {
      plusIconRef.current?.startAnimation();
      setPlusPopoverView('menu');
    }
    setIsPlusPopoverOpen(!isPlusPopoverOpen);
  };

  const setContextValue = <K extends keyof ShoppingContext>(key: K, value: ShoppingContext[K]) => {
    if (currentChatId) {
      setChats(prev => prev.map(chat =>
        chat.id === currentChatId
          ? { ...chat, context: { ...chat.context, [key]: value } }
          : chat
      ));
    } else {
      setDraftContext(prev => ({ ...prev, [key]: value }));
    }

    setIsPlusPopoverOpen(false);
    setPlusPopoverView('menu');
  };

  const removeContextValue = (key: keyof ShoppingContext) => {
    if (currentChatId) {
      setChats(prev => prev.map(chat => {
        if (chat.id !== currentChatId) return chat;
        const nextContext = { ...chat.context };
        delete nextContext[key];
        return { ...chat, context: nextContext };
      }));
    } else {
      setDraftContext(prev => {
        const nextContext = { ...prev };
        delete nextContext[key];
        return nextContext;
      });
    }
  };

  const handleBudgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number.parseFloat(budgetAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return;

    const formattedAmount = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: budgetCurrency,
      maximumFractionDigits: 2
    }).format(amount);

    setContextValue('budget', { amount, currency: budgetCurrency, label: formattedAmount });
    setBudgetAmount('');
  };

  const handleTimeSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (timeChoice === 'now') {
      setContextValue('timing', { label: 'Buy now', purchaseBy: null });
      return;
    }

    if (!purchaseDate) return;
    const formattedDate = new Intl.DateTimeFormat('en', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(`${purchaseDate}T12:00:00`));

    setContextValue('timing', { label: `Buy by ${formattedDate}`, purchaseBy: purchaseDate });
  };

  const renderBotMessage = (chat: Chat, message: ChatMessage) => {
    if (message.sender === 'user') {
      return <div key={message.id} className="chat-bubble user">{message.text}</div>;
    }
    switch (message.kind) {
      case 'text':
        return <div key={message.id} className="chat-bubble bot">{message.text}</div>;
      case 'error':
        return (
          <div key={message.id} className="chat-bubble bot">
            <ErrorNote code={message.code} text={message.text} reasonCodes={message.reasonCodes} />
          </div>
        );
      case 'mandate':
        return (
          <div key={message.id} className="chat-bubble bot has-card">
            <MandateCard
              compiled={message.compiled}
              busy={chat.busy !== null}
              onApprove={() => void handleApprove(chat.id, message.compiled.mandate)}
              onRevoke={() => void handleRevoke(chat.id, message.compiled.mandate)}
            />
          </div>
        );
      case 'offer':
        return (
          <div key={message.id} className="chat-bubble bot has-card">
            <OfferLine offer={message.offer} />
          </div>
        );
      case 'decision':
        return (
          <div key={message.id} className="chat-bubble bot has-card">
            <DecisionCard
              decision={message.decision}
              capTotal={chat.mandate?.id === message.decision.mandateId ? chat.mandate.maxTotal : null}
              busy={chat.busy !== null}
              purchased={chat.purchasedDecisionIds.includes(message.decision.id)}
              mutated={chat.mutatedOfferIds.includes(message.decision.offerId)}
              onCheckout={() => setPendingCheckout({ chatId: chat.id, decision: message.decision })}
              onMutate={() => void handleMutate(chat.id, message.decision)}
            />
          </div>
        );
      case 'receipt':
        return (
          <div key={message.id} className="chat-bubble bot has-card">
            <ReceiptCard receipt={message.receipt} />
          </div>
        );
      case 'recommendations':
        return (
          <div key={message.id} className="chat-bubble bot has-card">
            <RecommendationList items={message.items} onPay={(offer) => { setMockPaymentComplete(false); setSelectedOffer(offer); }} />
          </div>
        );
      case 'searching':
        return <div key={message.id} className="chat-bubble bot has-card"><SearchingCard /></div>;
      case 'trace':
        return <div key={message.id} className="chat-bubble bot has-card"><SearchTrace {...message} /></div>;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar: Brand, History & User Panel */}
      <aside className={`sidebar ${isSidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <h1 className="brand-name">bluecrop</h1>
          <button className="toggle-sidebar-btn" onClick={toggleSidebar} aria-label="Collapse sidebar">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
        </div>

        <div className="sidebar-content">
          <div className="sidebar-nav">
            <button className="new-chat-btn" type="button" onClick={handleNewChat}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg>
              <span>New chat</span>
            </button>
            <button
              className={`sidebar-nav-btn ${activeSidebarTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('chat')}
              aria-current={activeSidebarTab === 'chat' ? 'page' : undefined}
            >
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
              </svg>
              <span>Chat</span>
            </button>
            <button
              className={`sidebar-nav-btn ${activeSidebarTab === 'purchases' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('purchases')}
              aria-current={activeSidebarTab === 'purchases' ? 'page' : undefined}
            >
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8h12l1 13H5L6 8Z"></path>
                <path d="M9 8V6a3 3 0 0 1 6 0v2"></path>
              </svg>
              <span>Purchases</span>
            </button>
          </div>

          {chats.length > 0 && <h2 className="sidebar-title">Recent</h2>}
          <div className="history-list">
            {chats.map(chat => (
              <div
                key={chat.id}
                className={`history-card ${currentChatId === chat.id && activeSidebarTab === 'chat' ? 'active' : ''}`}
                onClick={() => { setActiveSidebarTab('chat'); handleSelectChat(chat.id); }}
              >
                <span className="history-name">{chat.title}</span>
                <button
                  className="delete-history-btn"
                  onClick={(e) => handleDeleteHistory(chat.id, e)}
                  aria-label="Delete"
                >
                  <Trash2Icon size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-currency">
          <label htmlFor="display-currency"><span>Currency</span><small>Conversation and prices</small></label>
          <select id="display-currency" value={preferredCurrency} onChange={(event) => { const currency = event.target.value as Currency; setPreferredCurrency(currency); setBudgetCurrency(currency); }}>
            <option value="PLN">PLN · zł</option>
            <option value="EUR">EUR · €</option>
            <option value="USD">USD · $</option>
            <option value="GBP">GBP · £</option>
          </select>
        </div>

        {/* User Panel in Bottom Left */}
        <div className="user-panel-wrapper">
          {isUserPanelOpen && (
            <div className="user-popover" role="menu" aria-label="Account menu">
              <div className="user-popover-header">
                <div className="user-avatar large">AC</div>
                <div className="user-info">
                  <span className="user-name">Alex Carter</span>
                  <span className="user-email">alex.carter@example.com</span>
                </div>
              </div>
              <div className="popover-divider"></div>
              <button className="popover-btn" role="menuitem">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
                My profile
              </button>
              <button className="popover-btn" role="menuitem">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.37.37.7.66.96.3.27.68.42 1.08.43H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>
                Settings
              </button>
              <button className="popover-btn" role="menuitem" onClick={() => { setIsUserPanelOpen(false); void handleResetDemo(); }} disabled={isResetting}>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
                {isResetting ? 'Resetting…' : 'Reset demo'}
              </button>
              <div className="popover-divider"></div>
              <button className="popover-btn text-red" role="menuitem">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></svg>
                Log out
              </button>
            </div>
          )}
          <button
            type="button"
            className="user-panel"
            onClick={() => setIsUserPanelOpen(!isUserPanelOpen)}
            aria-label="User menu"
            aria-expanded={isUserPanelOpen}
          >
            <div className="user-avatar">AC</div>
            <div className="user-info">
              <span className="user-name">Alex Carter</span>
              <span className="user-email">Personal account</span>
            </div>
            <svg className={`chevron ${isUserPanelOpen ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
        </div>
      </aside>

      <main className="chat-area">
        {activeSidebarTab === 'purchases' ? (
          <div className="purchases-page">
            <div className="purchases-header">
              <div>
                <h1>Your Purchases</h1>
                <p>Review your past shopping orders.</p>
              </div>
              <button type="button" className="card-btn secondary" onClick={() => void handleResetDemo()} disabled={isResetting}>
                {isResetting ? 'Resetting…' : 'Reset demo'}
              </button>
            </div>
            {purchasesNotice && <div className="purchases-notice" role="status">{purchasesNotice}</div>}
            {metrics && (
              <div className="metrics-grid" aria-label="Safety counters">
                <div><strong>{metrics.purchases}</strong><span>purchases</span></div>
                <div><strong>{metrics.decisions}</strong><span>decisions</span></div>
                <div><strong>{metrics.runs}</strong><span>runs</span></div>
                <div><strong>{metrics.hardCapViolations}</strong><span>cap violations</span></div>
                <div><strong>{metrics.duplicateBuys}</strong><span>duplicate buys</span></div>
              </div>
            )}
            {purchases.length === 0 ? (
              <div className="purchases-empty">No purchases found.</div>
            ) : (
              <div className="purchases-list">
                {purchases.map(receipt => (
                  <ReceiptCard key={receipt.id} receipt={receipt} tracking />
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {!isSidebarOpen && (
              <button className="floating-toggle-btn" onClick={toggleSidebar} aria-label="Expand sidebar">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                </svg>
              </button>
            )}
            <div className="chat-messages">
              {messages.length === 0 ? (
            <div className="empty-chat-welcome">
              <AnimatePresence mode="wait">
                <motion.div
                  key={phraseIndex}
                  initial={{ opacity: 1, filter: 'blur(0px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(10px)' }}
                  transition={{ duration: 0.6 }}
                >
                  <BlurText
                    text={welcomePhrases[phraseIndex]}
                    className="welcome-text-anim"
                    delay={50}
                    animateBy="words"
                    direction="top"
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          ) : (
            <>
              {currentChat && messages.map((msg) => renderBotMessage(currentChat, msg))}
              {currentChat && currentChat.interviewOptions.length > 0 && !isThinking && (
                <div className="quick-replies" aria-label="Suggested answers">
                  {currentChat.interviewOptions.map(option => (
                    <button
                      key={`${option.label}-${option.value}`}
                      type="button"
                      onClick={() => void sendUserMessage(option.value)}
                      disabled={isSending}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              <AnimatePresence>
                {isThinking && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3 }}
                    className="chat-bubble bot"
                    style={{ padding: '0 16px', display: 'flex', alignItems: 'center', height: '44px' }}
                  >
                    <div style={{ width: '36px', height: '36px', position: 'relative' }}>
                      <MetaBalls
                        color="#7C3AED"
                        cursorBallColor="#7C3AED"
                        cursorBallSize={1}
                        ballCount={8}
                        animationSize={90}
                        enableMouseInteraction={false}
                        enableTransparency={true}
                        hoverSmoothness={0.112}
                        clumpFactor={0.6}
                        speed={0.7}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="input-container">
          <div className="input-wrapper-container">
            {isPlusPopoverOpen && (
              <div className={`plus-popover ${plusPopoverView !== 'menu' ? 'editor' : ''}`}>
                {plusPopoverView === 'menu' && (
                  <>
                    <div className="plus-popover-heading">
                      <span>Add context</span>
                      <small>Help bluecrop narrow the search</small>
                    </div>
                    <button className="context-option" type="button" onClick={() => setPlusPopoverView('budget')}>
                      <span className="context-option-icon">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M4 7h16v12H4z"/><path d="M4 10h16"/><circle cx="16" cy="15" r="1"/></svg>
                      </span>
                      <span><strong>Budget</strong><small>Your total including delivery</small></span>
                      <svg className="context-option-arrow" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                    <button className="context-option" type="button" onClick={() => setPlusPopoverView('time')}>
                      <span className="context-option-icon">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                      </span>
                      <span><strong>Time</strong><small>Choose when you want to buy</small></span>
                      <svg className="context-option-arrow" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                  </>
                )}

                {plusPopoverView === 'budget' && (
                  <form className="context-form" onSubmit={handleBudgetSubmit}>
                    <div className="context-form-header">
                      <button type="button" className="context-back-btn" onClick={() => setPlusPopoverView('menu')} aria-label="Back to context options">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m15 18-6-6 6-6"/></svg>
                      </button>
                      <div><strong>Set a budget</strong><small>One total amount, including delivery</small></div>
                    </div>
                    <label className="context-field-label" htmlFor="budget-amount">Maximum amount</label>
                    <div className="money-input">
                      <select value={budgetCurrency} onChange={(e) => setBudgetCurrency(e.target.value as Currency)} aria-label="Currency">
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                        <option value="GBP">GBP</option>
                        <option value="PLN">PLN</option>
                      </select>
                      <input id="budget-amount" inputMode="decimal" placeholder="0.00" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} autoFocus />
                    </div>
                    <button className="context-submit-btn" type="submit" disabled={!budgetAmount.trim()}>Apply budget</button>
                  </form>
                )}

                {plusPopoverView === 'time' && (
                  <form className="context-form" onSubmit={handleTimeSubmit}>
                    <div className="context-form-header">
                      <button type="button" className="context-back-btn" onClick={() => setPlusPopoverView('menu')} aria-label="Back to context options">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m15 18-6-6 6-6"/></svg>
                      </button>
                      <div><strong>Choose timing</strong><small>How soon do you want to buy?</small></div>
                    </div>
                    <div className="time-choice" role="group" aria-label="Purchase timing">
                      <button type="button" className={timeChoice === 'now' ? 'active' : ''} onClick={() => setTimeChoice('now')}>Buy now</button>
                      <button type="button" className={timeChoice === 'later' ? 'active' : ''} onClick={() => setTimeChoice('later')}>Choose date</button>
                    </div>
                    {timeChoice === 'later' && (
                      <div className="date-field">
                        <label className="context-field-label" htmlFor="purchase-date">Purchase by</label>
                        <div className="date-input-wrap">
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
                          <input id="purchase-date" type="date" min={todayIso} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                        </div>
                        <div className="date-presets" aria-label="Quick date choices">
                          {quickDateOptions.map(option => (
                            <button
                              key={option.label}
                              type="button"
                              className={purchaseDate === option.value ? 'active' : ''}
                              onClick={() => setPurchaseDate(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button className="context-submit-btn" type="submit" disabled={timeChoice === 'later' && !purchaseDate}>Apply timing</button>
                  </form>
                )}
              </div>
            )}
            {(activeContext.budget || activeContext.timing) && (
              <div className="context-chips" aria-label="Active shopping context">
                {activeContext.budget && (
                  <div className="context-chip">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M4 7h16v12H4z"/><path d="M4 10h16"/></svg>
                    <span><small>Budget</small>{activeContext.budget.label}</span>
                    <button type="button" onClick={() => removeContextValue('budget')} aria-label="Remove budget context">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m7 7 10 10M17 7 7 17"/></svg>
                    </button>
                  </div>
                )}
                {activeContext.timing && (
                  <div className="context-chip">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                    <span><small>Timing</small>{activeContext.timing.label}</span>
                    <button type="button" onClick={() => removeContextValue('timing')} aria-label="Remove timing context">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m7 7 10 10M17 7 7 17"/></svg>
                    </button>
                  </div>
                )}
              </div>
            )}
            <form className="chat-input-wrapper" onSubmit={handleSend}>
              <button
                type="button"
                className="plus-btn has-tooltip"
                onClick={togglePlusPopover}
                aria-label="Add options"
                aria-expanded={isPlusPopoverOpen}
                data-tooltip="Add info"
              >
                <CirclePlusIcon ref={plusIconRef} size={20} />
              </button>

              <input
                type="text"
                className="chat-input"
                placeholder="Type a message..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />

              <button
                type="button"
                className={`voice-btn has-tooltip ${isRecording ? 'recording' : ''}`}
                onClick={toggleRecording}
                disabled={voice.state === 'connecting'}
                aria-label={isRecording ? 'End the voice conversation' : 'Start a voice conversation'}
                data-tooltip={voice.state === 'connecting' ? 'Connecting…' : isRecording ? 'End voice chat' : 'Talk to the advisor'}
              >
                {isRecording ? (
                  <AudioLinesIcon ref={micIconRef} size={18} color="currentColor" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="22"></line>
                  </svg>
                )}
              </button>

              <button
                type="submit"
                className="send-btn has-tooltip"
                aria-label="Send message"
                data-tooltip="Send"
                disabled={!inputValue.trim() || isSending}
              >
                <ChevronUpIcon ref={sendIconRef} size={20} />
              </button>
            </form>
          </div>
        </div>
        </>
        )}
      </main>
      <AnimatePresence>
        {selectedOffer && (
          <motion.div className="pay-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedOffer(null)}>
            <motion.div className="apple-pay-sheet" initial={{ y: 32, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, scale: .98 }} onClick={(event) => event.stopPropagation()}>
              <div className="pay-sheet-grabber" />
              <div className="pay-sheet-title"><strong><span className="apple-mark"></span> Pay</strong><button onClick={() => setSelectedOffer(null)} aria-label="Close">×</button></div>
              {mockPaymentComplete ? <div className="mock-payment-success"><span>✓</span><h3>Payment approved</h3><p>{selectedOffer.name}</p><strong>{selectedOffer.price}</strong><button className="apple-pay-confirm" onClick={() => setSelectedOffer(null)}>Done</button><small>Mock payment · no charge was made</small></div> : <>
                <div className="pay-product"><img src={selectedOffer.imageUrl ?? '/images/guitar-starter-kit.png'} alt="" /><div><strong>{selectedOffer.name}</strong><span>{selectedOffer.seller} · {selectedOffer.deliveryEstimate ?? 'delivery to confirm'}</span></div><b>{selectedOffer.price}</b></div>
                <div className="pay-row"><span>Card</span><strong>Visa ···· 4242</strong></div>
                <div className="pay-row"><span>Ship to</span><strong>Alex Carter · Warsaw</strong></div>
                <div className="pay-total"><span>Total</span><strong>{selectedOffer.price}</strong></div>
                <button className="apple-pay-confirm" onClick={() => setMockPaymentComplete(true)}><span className="apple-mark"></span> Pay · mockup</button>
                <small className="pay-secure">Presentation mockup · your card will not be charged.</small>
              </>}
            </motion.div>
          </motion.div>
        )}
        {pendingCheckout && (
          <motion.div className="pay-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPendingCheckout(null)}>
            <motion.div className="apple-pay-sheet" initial={{ y: 32, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, scale: .98 }} onClick={(event) => event.stopPropagation()}>
              <div className="pay-sheet-grabber" />
              <div className="pay-sheet-title"><strong><span className="apple-mark"></span> Pay</strong><button onClick={() => setPendingCheckout(null)} aria-label="Close">×</button></div>
              <div className="pay-product"><img src="/images/guitar-starter-kit.png" alt="Electric guitar starter set" /><div><strong>Electric guitar starter set</strong><span>Allegro · arrives tomorrow</span></div><b>{formatMoney(pendingCheckout.decision.cost.total)}</b></div>
              <div className="pay-row"><span>Card</span><strong>Visa ···· 4242</strong></div>
              <div className="pay-row"><span>Ship to</span><strong>Alex Carter · Warsaw</strong></div>
              <div className="pay-total"><span>Total</span><strong>{formatMoney(pendingCheckout.decision.cost.total)}</strong></div>
              <button className="apple-pay-confirm" onClick={() => { const next = pendingCheckout; setPendingCheckout(null); void handleCheckout(next.chatId, next.decision); }}><span className="apple-mark"></span> Pay</button>
              <small className="pay-secure">Test payment · no real charge will be made</small>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
