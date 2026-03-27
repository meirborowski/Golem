import React from "react";
import chalk from "chalk";
import { Text } from "ink";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { markdownTheme, theme } from "../theme.js";

const marked = new Marked(markedTerminal(markdownTheme) as any);

/**
 * Post-process to fix inline formatting that marked-terminal misses
 * inside list items (marked v15 + marked-terminal v7 compatibility issue).
 */
function postProcessMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, (_, t) => chalk.bold(t))
    .replace(/`([^`]+)`/g, (_, t) => chalk.hex(theme.accent)(t));
}

interface MarkdownTextProps {
  content: string;
}

export function MarkdownText({ content }: MarkdownTextProps) {
  const rendered = marked.parse(content) as string;
  return <Text>{postProcessMarkdown(rendered).trimEnd()}</Text>;
}
