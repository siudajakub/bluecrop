"use client";

import type { InterviewMessage } from "@deal-hunter/contracts";
import { useEffect, useRef, useState } from "react";
import { getRealtimeToken } from "@/lib/api";

export type VoiceInterviewState = "idle" | "connecting" | "listening";

export type VoiceFinalizeResult =
  | { kind: "done" }
  | { kind: "ask"; question: string }
  | { kind: "retry" };

const FINALIZE_TOOL_NAME = "finalize_purchase_plan";

/**
 * Realtime voice interview session over WebRTC. Transcripts stream through
 * onTranscript; when the model calls finalize_purchase_plan, onFinalize decides
 * whether the interview is complete, needs one more question, or must retry.
 */
export function useVoiceInterview(handlers: {
  onTranscript: (role: InterviewMessage["role"], text: string) => void;
  onFinalize: (summary: string) => Promise<VoiceFinalizeResult>;
  onError: (message: string) => void;
  onStop?: () => void;
}) {
  const [state, setState] = useState<VoiceInterviewState>("idle");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const finishingRef = useRef(false);
  const toolBusyRef = useRef(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => () => teardown(), []);

  function teardown() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    channelRef.current?.close();
    peerRef.current?.close();
    if (audioRef.current) audioRef.current.srcObject = null;
    streamRef.current = null;
    channelRef.current = null;
    peerRef.current = null;
    audioRef.current = null;
    finishingRef.current = false;
    toolBusyRef.current = false;
  }

  function stop() {
    const wasActive = peerRef.current !== null;
    teardown();
    setState("idle");
    if (wasActive) handlersRef.current.onStop?.();
  }

  function sendEvent(event: Record<string, unknown>) {
    const channel = channelRef.current;
    if (channel?.readyState === "open") channel.send(JSON.stringify(event));
  }

  function sendUserText(text: string) {
    sendEvent({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
    sendEvent({ type: "response.create" });
  }

  async function start(history: InterviewMessage[]) {
    if (state !== "idle") return;
    setState("connecting");
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
      channel.addEventListener("message", (event: MessageEvent<string>) => { void handleServerEvent(event); });
      channel.addEventListener("open", () => {
        setState("listening");
        seedConversation(history);
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answerResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/sdp" },
      });
      if (!answerResponse.ok) throw new Error("OpenAI rejected the voice connection.");
      await pc.setRemoteDescription({ type: "answer", sdp: await answerResponse.text() });
    } catch (error) {
      stop();
      handlersRef.current.onError(error instanceof Error ? error.message : "The voice conversation could not be started.");
    }
  }

  function seedConversation(history: InterviewMessage[]) {
    if (history.length) {
      const transcript = history
        .map((message) => `${message.role === "user" ? "User" : "Advisor"}: ${message.content}`)
        .join("\n");
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: `Kontynuuj wywiad. Dotychczasowe ustalenia z rozmowy tekstowej:\n${transcript}` }],
        },
      });
    }
    sendEvent({ type: "response.create" });
  }

  async function handleServerEvent(event: MessageEvent<string>) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = String(payload.type ?? "");
    if (type === "conversation.item.input_audio_transcription.completed") {
      emitTranscript("user", String(payload.transcript ?? ""));
    }
    if (type === "response.output_audio_transcript.done") {
      emitTranscript("assistant", String(payload.transcript ?? ""));
    }
    if (type === "response.function_call_arguments.done" && String(payload.name ?? "") === FINALIZE_TOOL_NAME) {
      await handleFinalize(String(payload.call_id ?? ""), String(payload.arguments ?? "{}"));
    }
    if (type === "response.done" && finishingRef.current) {
      window.setTimeout(() => stop(), 1_500);
    }
    if (type === "error") {
      const message = (payload.error as { message?: string } | undefined)?.message;
      handlersRef.current.onError(message ? `Voice conversation error: ${message}` : "A voice conversation error occurred.");
    }
  }

  function emitTranscript(role: InterviewMessage["role"], text: string) {
    const clean = text.trim();
    if (clean) handlersRef.current.onTranscript(role, clean);
  }

  async function handleFinalize(callId: string, rawArguments: string) {
    if (toolBusyRef.current || finishingRef.current) return;
    toolBusyRef.current = true;
    try {
      let summary = "";
      try {
        summary = String((JSON.parse(rawArguments) as { summary?: string }).summary ?? "").trim();
      } catch {
        summary = "";
      }
      const result = await handlersRef.current.onFinalize(summary);
      if (result.kind === "done") {
        finishingRef.current = true;
        respondToToolCall(callId, "The purchase plan is complete. Thank the user in one English sentence and end the conversation.");
      } else if (result.kind === "ask") {
        respondToToolCall(callId, `Brakuje jeszcze danych do planu. Zadaj użytkownikowi dokładnie to pytanie: ${result.question}`);
      } else {
        respondToToolCall(callId, "A technical error occurred while compiling the plan. Apologize in one English sentence and retry after the user responds.");
      }
    } finally {
      toolBusyRef.current = false;
    }
  }

  function respondToToolCall(callId: string, output: string) {
    sendEvent({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output },
    });
    sendEvent({ type: "response.create" });
  }

  return { state, start, stop, sendUserText };
}

async function requestMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
      throw new Error("The browser blocked microphone access. Allow access and try again.");
    }
    if (error instanceof DOMException && error.name === "NotFoundError") {
      throw new Error("No microphone was detected. Connect one and try again.");
    }
    throw new Error("Microphone access could not be obtained.");
  }
}
