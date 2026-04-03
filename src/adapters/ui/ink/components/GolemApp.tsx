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
import { ToolActivityIndicator } from "./ToolActivityIndicator.js";
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
    pendingToolCount,
    responseToolCount,
    promptRequest,
    confirmRequest,
    todos,
    sessionTokenUsage,
    submitPrompt,
    submitConfirmation,
  } = useUIBridge(bridge);

  return (
    <Box flexDirection="column">
      <MessageLog messages={messages} config={config} />

      <TodoList items={todos} />

      {pendingToolCount > 0 && (
        <ToolActivityIndicator toolCount={responseToolCount} />
      )}

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
        sessionTokenUsage={sessionTokenUsage}
      />
    </Box>
  );
}
