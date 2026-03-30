import { useState, useEffect, useCallback, useRef } from "react";
import type { UIBridge, PromptRequest, ConfirmRequest } from "../UIBridge.js";
import type { FileChange } from "#core/entities/FileChange.js";
import type { TodoItem } from "#core/entities/TodoItem.js";
import { toolDisplayNames, toolKeyArgExtractors } from "../theme.js";

export type ToolCallEntry = {
  type: "tool-call";
  content: string;
  toolName: string;
  keyArg: string;
  status: "success" | "error";
  resultSummary?: string;
};

export type MessageEntry =
  | { type: "user"; content: string }
  | { type: "assistant"; content: string }
  | { type: "error"; content: string }
  | { type: "system"; content: string }
  | ToolCallEntry;

export type PendingToolCall = {
  rawName: string;
  label: string;
  keyArg: string;
};

export type AppState = "idle" | "thinking" | "streaming" | "confirming";

function extractToolInfo(toolName: string, args: Record<string, unknown>): { label: string; keyArg: string } {
  const label = toolDisplayNames[toolName] ?? toolName;
  const extractor = toolKeyArgExtractors[toolName];
  const keyArg = extractor ? extractor(args) : "";
  return { label, keyArg };
}

export function useUIBridge(bridge: UIBridge) {
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const streamRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStreamingRef = useRef(false);
  const [pendingToolCalls, setPendingToolCalls] = useState<PendingToolCall[]>([]);
  const [progressMessage, setProgressMessage] = useState("");
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);

  useEffect(() => {
    const onDisplay = (msg: string) => {
      setMessages((prev) => [...prev, { type: "system", content: msg }]);
    };

    const onError = (msg: string) => {
      setMessages((prev) => [...prev, { type: "error", content: msg }]);
    };

    const flushStream = () => {
      flushTimerRef.current = null;
      setStreamBuffer(streamRef.current);
    };

    // Commit any accumulated streamed text to messages so it appears
    // before tool calls in the message log.
    const commitStreamText = () => {
      const text = streamRef.current;
      if (text) {
        streamRef.current = "";
        setStreamBuffer("");
        setMessages((prev) => [...prev, { type: "assistant", content: text }]);
      }
    };

    const onStreamChunk = (chunk: string) => {
      streamRef.current += chunk;
      if (!isStreamingRef.current) {
        isStreamingRef.current = true;
        setAppState("streaming");
      }
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(flushStream, 33);
      }
    };

    const onStreamEnd = () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      const fullText = streamRef.current;
      streamRef.current = "";
      isStreamingRef.current = false;
      setStreamBuffer("");
      if (fullText) {
        setMessages((msgs) => [...msgs, { type: "assistant", content: fullText }]);
      }
      setAppState("idle");
    };

    const onPromptRequest = (req: PromptRequest) => {
      setPromptRequest(req);
      setAppState("idle");
    };

    const onConfirmRequest = (req: ConfirmRequest) => {
      setConfirmRequest(req);
      setAppState("confirming");
    };

    const onToolCall = ({ toolName, args }: { toolName: string; args: Record<string, unknown> }) => {
      const { label, keyArg } = extractToolInfo(toolName, args);

      // If text was streaming before this tool call, commit it first
      // so it appears above the tool call in the message log.
      if (isStreamingRef.current) {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        commitStreamText();
        isStreamingRef.current = false;
        setAppState("thinking");
      }

      setPendingToolCalls((prev) => [...prev, { rawName: toolName, label, keyArg }]);
    };

    const onToolResult = ({ toolName, result }: { toolName: string; result: string }) => {
      const isError = result.toLowerCase().startsWith("error");
      setPendingToolCalls((prev) => {
        const idx = prev.findIndex((tc) => tc.rawName === toolName);
        if (idx === -1) return prev;
        const matched = prev[idx];
        const remaining = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        const entry: ToolCallEntry = {
          type: "tool-call",
          content: `${toolName} ${matched.keyArg}`,
          toolName: matched.label,
          keyArg: matched.keyArg,
          status: isError ? "error" : "success",
          resultSummary: isError ? (result.length > 120 ? result.slice(0, 120) + "..." : result) : undefined,
        };

        // Commit tool result to messages immediately so Static locks it in place
        setMessages((msgs) => [...msgs, entry]);

        return remaining;
      });
    };

    const onTodos = (items: TodoItem[]) => {
      setTodos(items);
    };

    const onProgressStart = (msg: string) => {
      setProgressMessage(msg);
      setAppState("thinking");
    };

    const onProgressStop = () => {
      setProgressMessage("");
    };

    bridge.on("display", onDisplay);
    bridge.on("error", onError);
    bridge.on("stream-chunk", onStreamChunk);
    bridge.on("stream-end", onStreamEnd);
    bridge.on("prompt-request", onPromptRequest);
    bridge.on("confirm-request", onConfirmRequest);
    bridge.on("tool-call", onToolCall);
    bridge.on("tool-result", onToolResult);
    bridge.on("progress-start", onProgressStart);
    bridge.on("progress-stop", onProgressStop);
    bridge.on("todos", onTodos);

    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      bridge.off("display", onDisplay);
      bridge.off("error", onError);
      bridge.off("stream-chunk", onStreamChunk);
      bridge.off("stream-end", onStreamEnd);
      bridge.off("prompt-request", onPromptRequest);
      bridge.off("confirm-request", onConfirmRequest);
      bridge.off("tool-call", onToolCall);
      bridge.off("tool-result", onToolResult);
      bridge.off("progress-start", onProgressStart);
      bridge.off("progress-stop", onProgressStop);
      bridge.off("todos", onTodos);
    };
  }, [bridge]);

  const submitPrompt = useCallback((text: string) => {
    if (promptRequest) {
      setMessages((prev) => [...prev, { type: "user", content: text }]);
      promptRequest.resolve(text);
      setPromptRequest(null);
    }
  }, [promptRequest]);

  const submitConfirmation = useCallback((approved: FileChange[]) => {
    if (confirmRequest) {
      confirmRequest.resolve(approved);
      setConfirmRequest(null);
      setAppState("idle");
    }
  }, [confirmRequest]);

  return {
    messages,
    streamBuffer,
    appState,
    progressMessage,
    pendingToolCalls,
    promptRequest,
    confirmRequest,
    todos,
    submitPrompt,
    submitConfirmation,
  };
}
