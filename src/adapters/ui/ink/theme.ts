export const theme = {
  brand: "#10b981",       // emerald green
  brandDim: "#059669",
  accent: "#06b6d4",      // cyan
  muted: "#6b7280",       // gray-500
  dimmed: "#4b5563",      // gray-600
  error: "#ef4444",       // red
  success: "#22c55e",     // green
  warning: "#eab308",     // yellow
  userText: "#06b6d4",    // cyan for user messages
  assistantText: "#e5e7eb", // light gray for assistant
  toolCall: "#a78bfa",    // purple for tool calls
  toolResult: "#6b7280",  // gray for tool results
} as const;

export const box = {
  topLeft: "\u256D",     // ╭
  topRight: "\u256E",    // ╮
  bottomLeft: "\u2570",  // ╰
  bottomRight: "\u256F", // ╯
  horizontal: "\u2500",  // ─
  vertical: "\u2502",    // │
} as const;

export const icons = {
  prompt: "\u276F",      // ❯
  tool: "\u26A1",        // ⚡
  error: "\u2718",       // ✘
  success: "\u2714",     // ✔
  arrow: "\u25B6",       // ▶
  dot: "\u25CF",         // ●
  cursor: "\u2588",      // █
} as const;
