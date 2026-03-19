import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputBarProps {
  onSubmit: (input: string) => void;
  isDisabled: boolean;
}

export function InputBar({ onSubmit, isDisabled }: InputBarProps) {
  const [lines, setLines] = useState<string[]>(['']);
  const [cursorRow, setCursorRow] = useState(0);
  const [cursorCol, setCursorCol] = useState(0);
  const [isMultiline, setIsMultiline] = useState(false);

  const currentLine = lines[cursorRow] ?? '';

  const submit = useCallback(() => {
    const text = lines.join('\n').trim();
    if (!text) return;
    setLines(['']);
    setCursorRow(0);
    setCursorCol(0);
    setIsMultiline(false);
    onSubmit(text);
  }, [lines, onSubmit]);

  useInput(
    (input, key) => {
      if (isDisabled) return;

      // Enter: submit (single-line mode) or newline (multi-line mode)
      if (key.return) {
        if (isMultiline) {
          // Shift+Enter or just Enter in multiline adds a newline
          // Submit with Ctrl+Enter (detected as meta+return in some terminals)
          // For now: empty line at end = submit, otherwise add newline
          if (key.ctrl || key.meta) {
            submit();
            return;
          }
          const newLines = [...lines];
          const before = currentLine.slice(0, cursorCol);
          const after = currentLine.slice(cursorCol);
          newLines[cursorRow] = before;
          newLines.splice(cursorRow + 1, 0, after);
          setLines(newLines);
          setCursorRow(cursorRow + 1);
          setCursorCol(0);
        } else {
          submit();
        }
        return;
      }

      // Toggle multi-line mode with Ctrl+J
      if (key.ctrl && input === 'j') {
        setIsMultiline(!isMultiline);
        return;
      }

      // Backspace
      if (key.backspace || key.delete) {
        if (cursorCol > 0) {
          const newLines = [...lines];
          newLines[cursorRow] =
            currentLine.slice(0, cursorCol - 1) + currentLine.slice(cursorCol);
          setLines(newLines);
          setCursorCol(cursorCol - 1);
        } else if (cursorRow > 0) {
          // Merge with previous line
          const newLines = [...lines];
          const prevLine = newLines[cursorRow - 1] ?? '';
          const newCol = prevLine.length;
          newLines[cursorRow - 1] = prevLine + currentLine;
          newLines.splice(cursorRow, 1);
          setLines(newLines);
          setCursorRow(cursorRow - 1);
          setCursorCol(newCol);
        }
        return;
      }

      // Arrow keys
      if (key.leftArrow) {
        if (cursorCol > 0) {
          setCursorCol(cursorCol - 1);
        } else if (cursorRow > 0) {
          setCursorRow(cursorRow - 1);
          setCursorCol((lines[cursorRow - 1] ?? '').length);
        }
        return;
      }
      if (key.rightArrow) {
        if (cursorCol < currentLine.length) {
          setCursorCol(cursorCol + 1);
        } else if (cursorRow < lines.length - 1) {
          setCursorRow(cursorRow + 1);
          setCursorCol(0);
        }
        return;
      }
      if (key.upArrow && cursorRow > 0) {
        setCursorRow(cursorRow - 1);
        setCursorCol(Math.min(cursorCol, (lines[cursorRow - 1] ?? '').length));
        return;
      }
      if (key.downArrow && cursorRow < lines.length - 1) {
        setCursorRow(cursorRow + 1);
        setCursorCol(Math.min(cursorCol, (lines[cursorRow + 1] ?? '').length));
        return;
      }

      // Ctrl+A: beginning of line
      if (key.ctrl && input === 'a') {
        setCursorCol(0);
        return;
      }
      // Ctrl+E: end of line
      if (key.ctrl && input === 'e') {
        setCursorCol(currentLine.length);
        return;
      }
      // Ctrl+U: clear line
      if (key.ctrl && input === 'u') {
        const newLines = [...lines];
        newLines[cursorRow] = currentLine.slice(cursorCol);
        setLines(newLines);
        setCursorCol(0);
        return;
      }

      // Tab: ignore (don't insert)
      if (key.tab) return;
      // Escape: ignore
      if (key.escape) return;

      // Regular character input
      if (input && !key.ctrl && !key.meta) {
        const newLines = [...lines];
        newLines[cursorRow] =
          currentLine.slice(0, cursorCol) + input + currentLine.slice(cursorCol);
        setLines(newLines);
        setCursorCol(cursorCol + input.length);
      }
    },
    { isActive: !isDisabled },
  );

  // Render the input area
  const displayLines = lines.map((line, row) => {
    if (row === cursorRow) {
      // Insert cursor character
      const before = line.slice(0, cursorCol);
      const cursorChar = line[cursorCol] ?? ' ';
      const after = line.slice(cursorCol + 1);
      return { before, cursorChar, after };
    }
    return { before: line, cursorChar: null, after: '' };
  });

  const borderColor = isDisabled ? 'gray' : 'cyan';
  const modeHint = isMultiline ? ' (multi-line: Ctrl+Enter to send)' : '';

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={borderColor}
        paddingX={1}
        flexDirection="column"
        minHeight={isMultiline ? 4 : 1}
      >
        {displayLines.map((dl, row) => (
          <Box key={row}>
            {row === 0 ? (
              <Text color={borderColor} bold>
                {'> '}
              </Text>
            ) : (
              <Text dimColor>{'  '}</Text>
            )}
            {dl.cursorChar !== null ? (
              <Text>
                {dl.before}
                <Text inverse>{dl.cursorChar}</Text>
                {dl.after}
              </Text>
            ) : (
              <Text>{dl.before}</Text>
            )}
          </Box>
        ))}
        {isDisabled && (
          <Text dimColor>Waiting for response...</Text>
        )}
        {!isDisabled && lines.length === 1 && lines[0] === '' && (
          <Text dimColor>
            Type your message...{modeHint}
          </Text>
        )}
      </Box>
      {!isDisabled && (
        <Box>
          <Text dimColor>
            {isMultiline
              ? ' Ctrl+Enter: send | Ctrl+J: single-line mode'
              : ' Enter: send | Ctrl+J: multi-line mode'}
          </Text>
        </Box>
      )}
    </Box>
  );
}
