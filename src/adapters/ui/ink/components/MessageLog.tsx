import React, { useState } from "react";
import { Box, Text, Static } from "ink";
import { theme, box } from "../theme.js";
import { WelcomeBanner } from "./WelcomeBanner.js";
import { MarkdownText } from "./MarkdownText.js";
import type { MessageEntry } from "../hooks/useUIBridge.js";
import type { InkAdapterConfig } from "../InkAdapter.js";

type StaticItem =
  | { key: string; kind: "banner"; config: InkAdapterConfig }
  | { key: string; kind: "message"; entry: MessageEntry };

interface MessageLogProps {
  messages: MessageEntry[];
  config?: InkAdapterConfig;
}

const styleMap: Record<MessageEntry["type"], { color: string; borderColor: string; prefix: string }> = {
  user:          { color: theme.userText,      borderColor: theme.accent,     prefix: "You " },
  assistant:     { color: theme.assistantText,  borderColor: theme.brand,      prefix: "" },
  error:         { color: theme.error,          borderColor: theme.error,      prefix: "\u2718 " },
  system:        { color: theme.muted,          borderColor: theme.dimmed,     prefix: "" },
  "tool-call":   { color: theme.toolCall,       borderColor: theme.toolCall,   prefix: "\u26A1 " },
  "tool-result": { color: theme.toolResult,     borderColor: theme.toolResult, prefix: "  " },
};

export function MessageLog({ messages, config = {} }: MessageLogProps) {
  const [bannerItem] = useState<StaticItem[]>(() => [
    { key: "banner", kind: "banner", config },
  ]);

  const items: StaticItem[] = [
    ...bannerItem,
    ...messages.map((m, i): StaticItem => ({
      key: `msg-${i}`,
      kind: "message",
      entry: m,
    })),
  ];

  return (
    <Static items={items}>
      {(item) => {
        if (item.kind === "banner") {
          return (
            <WelcomeBanner
              key={item.key}
              modelName={item.config.modelName}
              workingDirectory={item.config.workingDirectory}
              version={item.config.version}
            />
          );
        }

        const msg = item.entry;
        const style = styleMap[msg.type] ?? styleMap.system;

        if (msg.type === "assistant") {
          return (
            <Box key={item.key} flexDirection="row">
              <Text color={style.borderColor}>{box.vertical} </Text>
              <Box flexDirection="column">
                <MarkdownText content={msg.content} />
              </Box>
            </Box>
          );
        }

        return (
          <Box key={item.key} marginTop={msg.type === "user" ? 1 : 0}>
            <Text color={style.borderColor}>{box.vertical} </Text>
            <Text color={style.color}>
              {style.prefix}{msg.content}
            </Text>
          </Box>
        );
      }}
    </Static>
  );
}
