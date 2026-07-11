"use client";

import type { InterviewMessage, InterviewResponse, ProductRecommendation, PurchasePlan } from "@deal-hunter/contracts";
import { useEffect, useRef, useState } from "react";
import { getRealtimeToken, respondToInterview, searchProducts } from "@/lib/api";

type VoiceState = "idle" | "connecting" | "listening";

const VOICE_FINALIZE_TOOL_NAME = "finalize_purchase_plan";

export function ProductInterview({
  disabled,
  onBriefReady,
  onError,
}: {
  disabled: boolean;
  onBriefReady: (brief: string) => void;
  onError: (message: string) => void;
}) {
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const [readyBrief, setReadyBrief] = useState<string | null>(null);
  const [plan, setPlan] = useState<PurchasePlan | null>(null);
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [searching, setSearching] = useState(false);
  const [options, setOptions] = useState<InterviewResponse["options"]>([]);
  const [questionProgress, setQuestionProgress] = useState<{ current: number; max: number } | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const messagesRef = useRef<InterviewMessage[]>(messages);
  const finishingVoiceRef = useRef(false);
  const voiceToolBusyRef = useRef(false);
  messagesRef.current = messages;

  useEffect(() => () => stopVoice(peerRef, streamRef, audioRef, channelRef, finishingVoiceRef, setVoiceState), []);

  async function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || waiting) return;
    setInput("");
    await answerQuestion(content);
  }

  async function answerQuestion(content: string) {
    if (channelRef.current?.readyState === "open") {
      answerByVoiceChannel(content);
      return;
    }
    const nextMessages: InterviewMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInterviewError(null);
    setOptions([]);
    setWaiting(true);
    try {
      const response = await respondToInterview(nextMessages);
      setMessages((current) => [...current, { role: "assistant", content: response.assistantMessage }]);
      setOptions(response.options);
      setQuestionProgress(response.status === "QUESTION" ? { current: response.questionNumber, max: response.maxQuestions } : null);
      await completeInterview(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nie udało się kontynuować wywiadu.";
      setMessages(messages);
      setInput(content);
      setInterviewError(`${message} Twój wpis został zachowany — spróbuj wysłać go ponownie.`);
      onError(message);
    }
    setWaiting(false);
  }

  function answerByVoiceChannel(content: string) {
    setMessages((current) => [...current, { role: "user", content }]);
    setInterviewError(null);
    setOptions([]);
    sendVoiceEvent({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: content }] },
    });
    sendVoiceEvent({ type: "response.create" });
  }

  function sendVoiceEvent(event: Record<string, unknown>) {
    const channel = channelRef.current;
    if (channel?.readyState === "open") channel.send(JSON.stringify(event));
  }

  async function toggleVoice() {
    if (voiceState !== "idle") {
      stopVoiceSession();
      return;
    }
    setVoiceState("connecting");
    try {
      const token = await getRealtimeToken();
      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (event) => { audio.srcObject = event.streams[0] ?? null; };
      const stream = await requestMicrophone();
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("Nie znaleziono mikrofonu.");
      pc.addTrack(track, stream);
      const channel = pc.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.addEventListener("message", (event: MessageEvent<string>) => { void handleVoiceServerEvent(event); });
      channel.addEventListener("open", () => {
        setVoiceState("listening");
        seedVoiceConversation();
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answerResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/sdp" },
      });
      if (!answerResponse.ok) throw new Error("OpenAI odrzuciło połączenie głosowe.");
      await pc.setRemoteDescription({ type: "answer", sdp: await answerResponse.text() });
    } catch (error) {
      stopVoiceSession();
      onError(error instanceof Error ? error.message : "Nie udało się uruchomić rozmowy głosowej.");
    }
  }

  async function requestMicrophone(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
        throw new Error("Przeglądarka zablokowała mikrofon. Zezwól na dostęp do mikrofonu i spróbuj ponownie.");
      }
      if (error instanceof DOMException && error.name === "NotFoundError") {
        throw new Error("Nie wykryto mikrofonu. Podłącz mikrofon i spróbuj ponownie.");
      }
      throw new Error("Nie udało się uzyskać dostępu do mikrofonu.");
    }
  }

  function seedVoiceConversation() {
    const history = messagesRef.current;
    if (history.length) {
      const transcript = history
        .map((message) => `${message.role === "user" ? "Użytkownik" : "Doradca"}: ${message.content}`)
        .join("\n");
      sendVoiceEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: `Kontynuuj wywiad. Dotychczasowe ustalenia z rozmowy tekstowej:\n${transcript}` }],
        },
      });
    }
    sendVoiceEvent({ type: "response.create" });
  }

  async function handleVoiceServerEvent(event: MessageEvent<string>) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = String(payload.type ?? "");
    if (type === "conversation.item.input_audio_transcription.completed") {
      appendTranscript("user", String(payload.transcript ?? ""));
    }
    if (type === "response.output_audio_transcript.done") {
      appendTranscript("assistant", String(payload.transcript ?? ""));
    }
    if (type === "response.function_call_arguments.done" && String(payload.name ?? "") === VOICE_FINALIZE_TOOL_NAME) {
      await finalizeVoiceInterview(String(payload.call_id ?? ""), String(payload.arguments ?? "{}"));
    }
    if (type === "response.done" && finishingVoiceRef.current) {
      window.setTimeout(() => stopVoiceSession(), 1_500);
    }
    if (type === "error") {
      const message = (payload.error as { message?: string } | undefined)?.message;
      onError(message ? `Błąd rozmowy głosowej: ${message}` : "Wystąpił błąd podczas rozmowy głosowej.");
    }
  }

  async function finalizeVoiceInterview(callId: string, rawArguments: string) {
    if (voiceToolBusyRef.current || finishingVoiceRef.current) return;
    voiceToolBusyRef.current = true;
    setWaiting(true);
    try {
      let summary = "";
      try {
        summary = String((JSON.parse(rawArguments) as { summary?: string }).summary ?? "").trim();
      } catch {
        summary = "";
      }
      const voiceMessages: InterviewMessage[] = [
        ...messagesRef.current,
        { role: "user", content: summary ? `Potwierdzam ustalenia: ${summary}` : "Potwierdzam ustalenia z rozmowy głosowej." },
      ];
      const response = await respondToInterview(voiceMessages);
      if (response.status === "READY") {
        finishingVoiceRef.current = true;
        sendVoiceEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: "Plan zakupu jest kompletny, wyszukiwanie ofert właśnie ruszyło. Podziękuj użytkownikowi jednym zdaniem i zakończ rozmowę.",
          },
        });
        sendVoiceEvent({ type: "response.create" });
        setQuestionProgress(null);
        await completeInterview(response);
      } else {
        setQuestionProgress({ current: response.questionNumber, max: response.maxQuestions });
        sendVoiceEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: `Brakuje jeszcze danych do planu. Zadaj użytkownikowi dokładnie to pytanie: ${response.assistantMessage}`,
          },
        });
        sendVoiceEvent({ type: "response.create" });
      }
    } catch (error) {
      sendVoiceEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: "Wystąpił błąd techniczny przy kompilowaniu planu. Przeproś jednym zdaniem i spróbuj wywołać narzędzie ponownie po odpowiedzi użytkownika.",
        },
      });
      sendVoiceEvent({ type: "response.create" });
      onError(error instanceof Error ? error.message : "Nie udało się podsumować rozmowy głosowej.");
    } finally {
      voiceToolBusyRef.current = false;
      setWaiting(false);
    }
  }

  function appendTranscript(role: InterviewMessage["role"], content: string) {
    const clean = content.trim();
    if (clean) setMessages((current) => [...current, { role, content: clean }]);
  }

  async function useVoiceTranscript() {
    if (!messages.some((message) => message.role === "user")) return;
    setWaiting(true);
    try {
      const response = await respondToInterview(messages);
      setMessages((current) => [...current, { role: "assistant", content: response.assistantMessage }]);
      setOptions(response.options);
      setQuestionProgress(response.status === "QUESTION" ? { current: response.questionNumber, max: response.maxQuestions } : null);
      await completeInterview(response);
      if (response.status === "READY") {
        stopVoiceSession();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Nie udało się podsumować rozmowy.");
    } finally {
      setWaiting(false);
    }
  }

  function stopVoiceSession() {
    stopVoice(peerRef, streamRef, audioRef, channelRef, finishingVoiceRef, setVoiceState);
  }

  async function completeInterview(response: InterviewResponse) {
    if (response.status !== "READY" || !response.brief || !response.plan) return;
    setReadyBrief(response.brief);
    setPlan(response.plan);
    onBriefReady(response.brief);
    setSearching(true);
    try {
      const results = await searchProducts(response.plan);
      setRecommendations(results.recommendations);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Nie udało się wyszukać produktów.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="interview">
      <div className="interview-intro">
        <p>
          {voiceState === "listening"
            ? "Słucham — opowiedz, czego potrzebujesz. Doradca dopyta o szczegóły, a gdy zbierze komplet, sam uruchomi wyszukiwanie."
            : "Opowiedz, jaki cel chcesz osiągnąć. Doradca dopyta o wymagania, termin i pełny budżet."}
        </p>
        <button className={voiceState === "listening" ? "voice active" : "voice"} type="button" onClick={toggleVoice} disabled={disabled || voiceState === "connecting"}>
          {voiceState === "connecting" ? "Łączę…" : voiceState === "listening" ? "Zakończ rozmowę" : "Rozmawiaj głosowo"}
        </button>
      </div>
      <div className="chat-log" aria-live="polite">
        {messages.length ? messages.map((message, index) => (
          <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "user" ? "Ty" : "Doradca"}</span><p>{message.content}</p></div>
        )) : <p className="empty-copy">Np. „Chcę nauczyć się grać na gitarze”.</p>}
        {waiting && <div className="chat-message assistant"><span>Doradca AI</span><p>Analizuję wymagania…</p></div>}
      </div>
      {interviewError && <p className="interview-error" role="alert">{interviewError}</p>}
      {options.length > 0 && (
        <fieldset className="answer-options" disabled={disabled || waiting}>
          <legend>{questionProgress ? `Pytanie ${questionProgress.current} z maks. ${questionProgress.max}` : "Wybierz odpowiedź"}</legend>
          {options.map((option) => (
            <button type="button" key={`${option.label}-${option.value}`} onClick={() => void answerQuestion(option.value)}>
              <strong>{option.label}</strong>
              {option.value !== option.label && <span>{option.value}</span>}
            </button>
          ))}
        </fieldset>
      )}
      <form className="chat-form" onSubmit={submitMessage}>
        <label htmlFor="custom-answer">{voiceState === "listening" ? "Wolisz napisać? Doradca odpowie głosem" : options.length ? "Inna odpowiedź" : "Opisz, czego potrzebujesz"}</label>
        <div>
          <input id="custom-answer" value={input} onChange={(event) => setInput(event.target.value)} placeholder={options.length ? "Wpisz własną odpowiedź…" : "Np. chcę nauczyć się grać na gitarze…"} disabled={disabled || waiting} />
          <button className="secondary" type="submit" disabled={disabled || waiting || !input.trim()}>Wyślij</button>
        </div>
      </form>
      {voiceState === "listening" && <button className="secondary transcript-action" type="button" onClick={useVoiceTranscript} disabled={waiting || !messages.some((message) => message.role === "user")}>Podsumuj rozmowę i przejdź dalej</button>}
      {plan && (
        <section className="purchase-plan">
          <div><span className="eyebrow">Plan zakupu · AI</span><h3>{plan.goal}</h3></div>
          <div className="parameter-list">
            {plan.parameters.map((parameter) => <span key={`${parameter.name}-${parameter.value}`}><strong>{parameter.name}</strong>{parameter.value}</span>)}
          </div>
          <div className="category-list">
            {plan.categories.map((category) => <div key={category.name}><strong>{category.name}</strong><span>{category.purpose}</span></div>)}
          </div>
        </section>
      )}
      {readyBrief && <p className="interview-ready">Plan jest kompletny. AI wyszukuje produkty w wybranych kategoriach.</p>}
      {searching && <div className="searching-products">Przeszukuję aktualne oferty…</div>}
      {recommendations.length > 0 && (
        <section className="recommendations">
          <div><span className="eyebrow">Znaleziono {recommendations.length} ofert</span><h3>Konkretne oferty dla Ciebie</h3></div>
          <p className="recommendation-disclaimer">To konkretne strony produktów znalezione w internecie. Przed zakupem potwierdź aktualną cenę i dostępność u sprzedawcy.</p>
          {recommendations.map((item) => (
            <article className="recommendation-card" key={`${item.url}-${item.name}`}>
              <div className="recommendation-media">
                {item.imageUrl ? <img src={item.imageUrl} alt={`Zdjęcie oferty: ${item.name}`} loading="lazy" /> : <span aria-hidden="true">Brak zdjęcia</span>}
              </div>
              <div className="recommendation-content">
                <div className="recommendation-meta"><span>{item.category}</span><strong>{item.price}</strong></div>
                <h4>{item.name}</h4>
                <p><strong>Dlaczego pasuje:</strong> {item.whyItFits}</p>
                {item.tradeoffs.length > 0 && <div className="offer-caveats"><strong>Sprawdź przed zakupem</strong><span>{item.tradeoffs.join(" · ")}</span></div>}
                <div className="offer-footer"><span>{item.seller}</span><a href={item.url} target="_blank" rel="noreferrer">Zobacz ofertę <span aria-hidden="true">↗</span></a></div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function stopVoice(
  peerRef: React.MutableRefObject<RTCPeerConnection | null>,
  streamRef: React.MutableRefObject<MediaStream | null>,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  channelRef: React.MutableRefObject<RTCDataChannel | null>,
  finishingVoiceRef: React.MutableRefObject<boolean>,
  setVoiceState: React.Dispatch<React.SetStateAction<VoiceState>>,
) {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  channelRef.current?.close();
  peerRef.current?.close();
  if (audioRef.current) audioRef.current.srcObject = null;
  streamRef.current = null;
  channelRef.current = null;
  peerRef.current = null;
  audioRef.current = null;
  finishingVoiceRef.current = false;
  setVoiceState("idle");
}
