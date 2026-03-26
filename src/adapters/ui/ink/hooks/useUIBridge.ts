import { useState, useEffect, useCallback } from "react";
import type { UIBridge, PromptRequest, ConfirmRequest } from "../UIBridge.js";
import type { FileChange } from "#core/entities/FileChange.js";

function formatToolArgs(toolName: string, args: Record<string, unknown>): string {
  if (toolName === "readFile" && args.path) return String(args.path);
  if (toolName === "writeFile" && args.path) return String(args.path);
  if (toolName === "executeCommand" && args.command) return String(args.command);
  if (toolName === "listDirectory" && args.path) return String(args.path);
  const json = JSON.stringify(args);
  return json.length > 80 ? json.slice(0, 80) + "..." : json;
}

export type MessageEntry = {
  type: "user" | "assistant" | "error" | "system" | "tool-call" | "tool-result";
  content: string;
};

export type AppState = "idle" | "thinking" | "streaming" | "confirming";

export function useUIBridge(bridge: UIBridge) {
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [progressMessage, setProgressMessage] = useState("");
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const onDisplay = (msg: string) => {
      setMessages((prev) => [...prev, { type: "system", content: msg }]);
    };

    const onError = (msg: string) => {
      setMessages((prev) => [...prev, { type: "error", content: msg }]);
    };

    const onStreamChunk = (chunk: string) => {
      setStreamBuffer((prev) => prev + chunk);
      setAppState("streaming");
    };

    const onStreamEnd = () => {
      setStreamBuffer((prev) => {
        if (prev) {
          setMessages((msgs) => [...msgs, { type: "assistant", content: prev }]);
        }
        return "";
      });
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
      const summary = formatToolArgs(toolName, args);
      setMessages((prev) => [...prev, { type: "tool-call", content: `${toolName} ${summary}` }]);
    };

    const onToolResult = ({ toolName, result }: { toolName: string; result: string }) => {
      const summary = result.length > 120 ? result.slice(0, 120) + "..." : result;
      setMessages((prev) => [...prev, { type: "tool-result", content: `${toolName}: ${summary}` }]);
    };

    const onProgressStart = (msg: string) => {
      setProgressMessage(msg);
      setAppState("thinking");
    };

    const onProgressStop = () => {
      setProgressMessage("");
      // Don't set idle here — streaming will set the next state
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

    return () => {
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
    promptRequest,
    confirmRequest,
    submitPrompt,
    submitConfirmation,
  };
}
