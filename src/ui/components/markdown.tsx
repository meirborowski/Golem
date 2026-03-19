import React from 'react';
import { Box, Text } from 'ink';
import { highlight } from 'cli-highlight';

interface MarkdownProps {
  content: string;
}

// ── Block types ─────────────────────────────────────────────────────────────

interface CodeBlock {
  type: 'code';
  language: string;
  code: string;
}

interface ProseBlock {
  type: 'prose';
  text: string;
}

type Block = CodeBlock | ProseBlock;

// ── Parsing ─────────────────────────────────────────────────────────────────

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split('\n');

  let inCodeBlock = false;
  let fenceLength = 0; // number of backticks in the opening fence
  let nestedDepth = 0; // track nested code fences inside a code block
  let codeLanguage = '';
  let codeLines: string[] = [];
  let proseLines: string[] = [];

  for (const line of lines) {
    if (!inCodeBlock) {
      // Match opening fence: 3+ backticks, optional language, nothing else
      const match = /^(`{3,})(\w*)\s*$/.exec(line);
      if (match) {
        // Flush accumulated prose
        if (proseLines.length > 0) {
          blocks.push({ type: 'prose', text: proseLines.join('\n') });
          proseLines = [];
        }
        inCodeBlock = true;
        fenceLength = match[1].length;
        nestedDepth = 0;
        codeLanguage = match[2] ?? '';
        codeLines = [];
      } else {
        proseLines.push(line);
      }
    } else {
      // Check for nested opening fence (e.g. ```bash inside a ```markdown block)
      const nestedOpen = /^(`{3,})(\w+)\s*$/.exec(line);
      if (nestedOpen && nestedOpen[1].length <= fenceLength) {
        // This looks like a nested code fence opening — track it
        nestedDepth++;
        codeLines.push(line);
        continue;
      }

      // Check for closing fence
      const closeMatch = /^(`{3,})\s*$/.exec(line);
      if (closeMatch && closeMatch[1].length <= fenceLength) {
        if (nestedDepth > 0) {
          // This closes a nested fence, not our outer one
          nestedDepth--;
          codeLines.push(line);
        } else {
          // End of our code block
          blocks.push({ type: 'code', language: codeLanguage, code: codeLines.join('\n') });
          inCodeBlock = false;
          fenceLength = 0;
          nestedDepth = 0;
          codeLanguage = '';
          codeLines = [];
        }
      } else {
        codeLines.push(line);
      }
    }
  }

  // Flush remaining
  if (inCodeBlock) {
    // Unterminated code block — still render it as code
    blocks.push({ type: 'code', language: codeLanguage, code: codeLines.join('\n') });
  } else if (proseLines.length > 0) {
    blocks.push({ type: 'prose', text: proseLines.join('\n') });
  }

  return blocks;
}

// ── Markdown detection heuristic ─────────────────────────────────────────────

function looksLikeMarkdown(text: string): boolean {
  const lines = text.split('\n');
  let markdownSignals = 0;

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) markdownSignals += 2; // headers are strong signal
    if (/^[-*+]\s+/.test(line)) markdownSignals++;      // unordered list
    if (/^\d+\.\s+/.test(line)) markdownSignals++;       // ordered list
    if (/^>\s+/.test(line)) markdownSignals++;            // blockquote
    if (/\*\*[^*]+\*\*/.test(line)) markdownSignals++;   // bold
  }

  // If we see at least 3 markdown signals, it's likely markdown
  return markdownSignals >= 3;
}

// ── Code block rendering ────────────────────────────────────────────────────

function CodeBlockView({ language, code }: { language: string; code: string }) {
  let highlighted: string;
  try {
    highlighted = highlight(code, {
      language: language || undefined,
      ignoreIllegals: true,
    });
  } catch {
    // Fallback to raw code if highlighting fails
    highlighted = code;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      marginY={0}
    >
      {language ? (
        <Text dimColor italic>
          {language}
        </Text>
      ) : null}
      <Text>{highlighted}</Text>
    </Box>
  );
}

// ── Inline formatting ───────────────────────────────────────────────────────

interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];

  // Process inline patterns: `code`, **bold**, *italic*
  // Order matters: code first (to avoid parsing inside), then bold, then italic
  const inlineRegex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // Inline code: strip backticks
      segments.push({ text: match[1].slice(1, -1), code: true });
    } else if (match[2]) {
      // Bold: strip **
      segments.push({ text: match[2].slice(2, -2), bold: true });
    } else if (match[3]) {
      // Italic: strip *
      segments.push({ text: match[3].slice(1, -1), italic: true });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ text });
  }

  return segments;
}

function InlineText({ text }: { text: string }) {
  const segments = parseInline(text);

  return (
    <Text wrap="wrap">
      {segments.map((seg, i) => {
        if (seg.code) {
          return (
            <Text key={i} color="cyan">
              {seg.text}
            </Text>
          );
        }
        if (seg.bold) {
          return (
            <Text key={i} bold>
              {seg.text}
            </Text>
          );
        }
        if (seg.italic) {
          return (
            <Text key={i} italic>
              {seg.text}
            </Text>
          );
        }
        return <Text key={i}>{seg.text}</Text>;
      })}
    </Text>
  );
}

// ── Line classification ─────────────────────────────────────────────────────

function renderProseLine(line: string, index: number): React.ReactNode {
  // Empty line
  if (line.trim() === '') {
    return <Text key={index}> </Text>;
  }

  // Horizontal rule
  if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
    return (
      <Text key={index} dimColor>
        ────────────────────────────────────
      </Text>
    );
  }

  // Headers
  const headerMatch = /^(#{1,3})\s+(.+)$/.exec(line);
  if (headerMatch) {
    const level = headerMatch[1].length;
    const text = headerMatch[2];
    const color = level === 1 ? 'cyan' : level === 2 ? 'blue' : 'magenta';
    return (
      <Text key={index} bold color={color}>
        {text}
      </Text>
    );
  }

  // Blockquote
  if (line.startsWith('> ')) {
    const quoteText = line.slice(2);
    return (
      <Box key={index}>
        <Text color="gray">│ </Text>
        <Text dimColor italic wrap="wrap">
          {quoteText}
        </Text>
      </Box>
    );
  }

  // Unordered list
  const ulMatch = /^(\s*)[-*+]\s+(.+)$/.exec(line);
  if (ulMatch) {
    const indent = ulMatch[1].length;
    const text = ulMatch[2];
    return (
      <Box key={index} marginLeft={indent}>
        <Text color="green">• </Text>
        <InlineText text={text} />
      </Box>
    );
  }

  // Ordered list
  const olMatch = /^(\s*)(\d+)\.\s+(.+)$/.exec(line);
  if (olMatch) {
    const indent = olMatch[1].length;
    const num = olMatch[2];
    const text = olMatch[3];
    return (
      <Box key={index} marginLeft={indent}>
        <Text color="green">{num}. </Text>
        <InlineText text={text} />
      </Box>
    );
  }

  // Plain text with inline formatting
  return <InlineText key={index} text={line} />;
}

function ProseView({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => renderProseLine(line, i))}
    </Box>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function Markdown({ content }: MarkdownProps) {
  if (!content) return null;

  const blocks = parseBlocks(content);

  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => {
        if (block.type === 'code') {
          // If language is markdown/md, render as parsed markdown
          // (LLMs often wrap entire responses in ```markdown ... ```)
          const lang = block.language.toLowerCase();
          if (lang === 'markdown' || lang === 'md') {
            return <Markdown key={i} content={block.code} />;
          }
          // If no language and content looks like markdown (has headers),
          // render as markdown instead of a plain code block.
          // LLMs sometimes wrap file contents in bare ``` fences.
          if (!block.language && looksLikeMarkdown(block.code)) {
            return <Markdown key={i} content={block.code} />;
          }
          return <CodeBlockView key={i} language={block.language} code={block.code} />;
        }
        return <ProseView key={i} text={block.text} />;
      })}
    </Box>
  );
}
