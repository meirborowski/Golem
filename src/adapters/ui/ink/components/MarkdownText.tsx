import React from "react";
import { Text } from "ink";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

const marked = new Marked(markedTerminal() as any);

interface MarkdownTextProps {
  content: string;
}

export function MarkdownText({ content }: MarkdownTextProps) {
  const rendered = marked.parse(content) as string;
  // marked-terminal returns ANSI-formatted string; Ink's Text handles ANSI
  return <Text>{rendered.trimEnd()}</Text>;
}
