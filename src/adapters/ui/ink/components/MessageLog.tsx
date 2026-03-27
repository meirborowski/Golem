import React, { useState } from "react";
import { Box, Text, Static } from "ink";
import { theme, box, icons } from "../theme.js";
import { WelcomeBanner } from "./WelcomeBanner.js";
import { MarkdownText } from "./MarkdownText.js";
import { ToolCallLine } from "./ToolCallLine.js";
import type { MessageEntry, ToolCallEntry } from "../hooks/useUIBridge.js";
import type { InkAdapterConfig } from "../InkAdapter.js";

type StaticItem =
  | { key: string; kind: "banner"; config: InkAdapterConfig }
  | { key: string; kind: "message"; entry: MessageEntry };

interface MessageLogProps {
  messages: MessageEntry[];
  config?: InkAdapterConfig;
}

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

        if (msg.type === "user") {
          return (
            <Box key={item.key} marginTop={1}>
              <Text color={theme.brand} bold>{icons.prompt} </Text>
              <Text color={theme.userText} bold>{msg.content}</Text>
            </Box>
          );
        }

        if (msg.type === "assistant") {
          return (
            <Box key={item.key} flexDirection="row">
              <Text color={theme.brand}>{box.vertical} </Text>
              <Box flexDirection="column">
                <MarkdownText content={msg.content} />
              </Box>
            </Box>
          );
        }

        if (msg.type === "tool-call") {
          return <ToolCallLine key={item.key} entry={msg as ToolCallEntry} />;
        }

        if (msg.type === "error") {
          return (
            <Box key={item.key} marginTop={1}>
              <Text color={theme.error}>{box.vertical} {icons.error} {msg.content}</Text>
            </Box>
          );
        }

        // system
        return (
          <Box key={item.key}>
            <Text dimColor>    {msg.content}</Text>
          </Box>
        );
      }}
    </Static>
  );
}
