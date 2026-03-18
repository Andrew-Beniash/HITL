import { useRef, useState } from "react";
import type { AiQueryPayload } from "@hitl/shared-types";

export interface AiResponseMetadata {
  confidence?: string;
  citations?: { sourceId: string }[];
  editSuggestion?: { unifiedDiff: string };
  kbUnavailable?: boolean;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: AiResponseMetadata;
}

export async function* streamAiResponse(
  payload: AiQueryPayload,
  signal: AbortSignal
) {
  const response = await fetch("/api/ai/query", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error("AI stream request failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    yield chunk;
  }
}

function parseDoneChunk(chunk: string): AiResponseMetadata | undefined {
  if (!chunk.startsWith("[DONE]")) {
    return undefined;
  }

  const json = chunk.replace(/^\[DONE\]\s*/, "");
  if (!json) {
    return undefined;
  }

  return JSON.parse(json) as AiResponseMetadata;
}

export function useAiStream() {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function submitQuery(payload: AiQueryPayload) {
    const userMessage: AiMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: payload.userQuery,
    };
    const assistantId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setIsStreaming(true);
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const chunk of streamAiResponse(payload, controller.signal)) {
        if (chunk.startsWith("[DONE]")) {
          const metadata = parseDoneChunk(chunk);
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, metadata } : message
            )
          );
          continue;
        }

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, content: `${message.content}${chunk}` }
              : message
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  return {
    messages,
    isStreaming,
    submitQuery,
    clearMessages: () => setMessages([]),
  };
}

