import { useState, useEffect, useCallback, useRef } from "react";
import type { UIBridge, PromptRequest, ConfirmRequest } from "../UIBridge.js";
import type { FileChange } from "#core/entities/FileChange.js";
import type { TodoItem } from "#core/entities/TodoItem.js";
import type { SessionTokenUsage } from "#core/entities/AgentContext.js";
import { toolDisplayNames, toolKeyArgExtractors } from "../theme.js";
// toolDisplayNames/toolKeyArgExtractors still imported for error display

export type ToolCallEntry = {
  type: "tool-call";
  content: string;
  toolName: string;
  keyArg: string;
  status: "success" | "error";
  resultSummary?: string;
};

export type ToolSummaryEntry = {
  type: "tool-summary";
  totalCount: number;
  errorCount: number;
};

export type MessageEntry =
  | { type: "user"; content: string }
  | { type: "assistant"; content: string }
  | { type: "error"; content: string }
  | { type: "system"; content: string }
  | ToolCallEntry
  | ToolSummaryEntry;

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
  const [pendingToolCount, setPendingToolCount] = useState(0);
  const [responseToolCount, setResponseToolCount] = useState(0);
  const responseErrorCountRef = useRef(0);
  const pendingRawNamesRef = useRef<string[]>([]);
  const [progressMessage, setProgressMessage] = useState("");
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [sessionTokenUsage, setSessionTokenUsage] = useState<SessionTokenUsage | null>(null);

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
      // If text was streaming before this tool call, commit it first
      // so it appears above the tool activity in the message log.
      if (isStreamingRef.current) {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        commitStreamText();
        isStreamingRef.current = false;
        setAppState("thinking");
      }

      pendingRawNamesRef.current = [...pendingRawNamesRef.current, toolName];
      setPendingToolCount((c) => c + 1);
      setResponseToolCount((c) => c + 1);
    };

    const onToolResult = ({ toolName, result }: { toolName: string; result: string }) => {
      const isError = result.toLowerCase().startsWith("error");

      // Remove from pending tracking
      const idx = pendingRawNamesRef.current.indexOf(toolName);
      if (idx !== -1) {
        pendingRawNamesRef.current = [
          ...pendingRawNamesRef.current.slice(0, idx),
          ...pendingRawNamesRef.current.slice(idx + 1),
        ];
      }

      if (isError) {
        responseErrorCountRef.current += 1;
        const { label, keyArg } = extractToolInfo(toolName, { });
        const entry: ToolCallEntry = {
          type: "tool-call",
          content: `${toolName}`,
          toolName: label,
          keyArg: keyArg,
          status: "error",
          resultSummary: result.length > 120 ? result.slice(0, 120) + "..." : result,
        };
        setMessages((msgs) => [...msgs, entry]);
      }

      const newPendingCount = pendingRawNamesRef.current.length;
      setPendingToolCount(newPendingCount);

      // When all pending tools complete, emit a summary
      if (newPendingCount === 0) {
        setResponseToolCount((total) => {
          if (total > 0) {
            const errorCount = responseErrorCountRef.current;
            const summaryEntry: ToolSummaryEntry = {
              type: "tool-summary",
              totalCount: total,
              errorCount,
            };
            setMessages((msgs) => [...msgs, summaryEntry]);
          }
          return 0;
        });
        responseErrorCountRef.current = 0;
      }
    };

    const onTodos = (items: TodoItem[]) => {
      setTodos(items);
    };

    const onTokenUsage = (session: SessionTokenUsage) => {
      setSessionTokenUsage(session);
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
    bridge.on("token-usage", onTokenUsage);

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
      bridge.off("token-usage", onTokenUsage);
    };
  }, [bridge]);

  const submitPrompt = useCallback((text: string) => {
    if (promptRequest) {
      setMessages((prev) => [...prev, { type: "user", content: text }]);
      setResponseToolCount(0);
      responseErrorCountRef.current = 0;
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
    pendingToolCount,
    responseToolCount,
    promptRequest,
    confirmRequest,
    todos,
    sessionTokenUsage,
    submitPrompt,
    submitConfirmation,
  };
}
