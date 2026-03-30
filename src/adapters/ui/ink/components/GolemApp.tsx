import React from "react";
import { Box } from "ink";
import type { UIBridge } from "../UIBridge.js";
import type { InkAdapterConfig } from "../InkAdapter.js";
import { useUIBridge } from "../hooks/useUIBridge.js";
import { MessageLog } from "./MessageLog.js";
import { StreamingText } from "./StreamingText.js";
import { GolemSpinner } from "./GolemSpinner.js";
import { PromptInput } from "./PromptInput.js";
import { ChangeConfirmation } from "./ChangeConfirmation.js";
import { PendingToolCallLine } from "./PendingToolCallLine.js";
import { TodoList } from "./TodoList.js";
import { StatusBar } from "./StatusBar.js";

interface GolemAppProps {
  bridge: UIBridge;
  config?: InkAdapterConfig;
}

export function GolemApp({ bridge, config = {} }: GolemAppProps) {
  const {
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
  } = useUIBridge(bridge);

  return (
    <Box flexDirection="column">
      <MessageLog messages={messages} config={config} />

      <TodoList items={todos} />

      {pendingToolCalls.map((tc, i) => (
        <PendingToolCallLine key={`pending-${i}`} label={tc.label} keyArg={tc.keyArg} />
      ))}

      <Box flexDirection="column">
        {appState === "streaming" && <StreamingText buffer={streamBuffer} />}

        {appState === "confirming" && confirmRequest && (
          <ChangeConfirmation
            changes={confirmRequest.changes}
            onConfirm={submitConfirmation}
          />
        )}

        {appState === "thinking" && <GolemSpinner message={progressMessage} />}

        {appState === "idle" && promptRequest && (
          <PromptInput
            message={promptRequest.message}
            onSubmit={submitPrompt}
          />
        )}
      </Box>

      <StatusBar
        appState={appState}
        modelName={config.modelName}
        workingDirectory={config.workingDirectory}
      />
    </Box>
  );
}
