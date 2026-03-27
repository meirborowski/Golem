import chalk from "chalk";

export const theme = {
  brand: "#10b981",       // emerald green
  brandDim: "#059669",
  accent: "#06b6d4",      // cyan
  muted: "#6b7280",       // gray-500
  dimmed: "#4b5563",      // gray-600
  error: "#ef4444",       // red
  success: "#22c55e",     // green
  warning: "#eab308",     // yellow
  userText: "#f9fafb",    // near-white for user messages
  assistantText: "#e5e7eb", // light gray for assistant
  toolCall: "#a78bfa",    // purple for tool calls
  toolResult: "#6b7280",  // gray for tool results
  toolLabel: "#a78bfa",   // purple for tool name labels
  toolArg: "#9ca3af",     // gray-400 for tool arguments
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

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

export const toolDisplayNames: Record<string, string> = {
  readFile: "Read file",
  writeFile: "Write file",
  editFile: "Edit file",
  applyDiff: "Apply diff",
  deleteFile: "Delete file",
  moveFile: "Move file",
  listDirectory: "List directory",
  directoryTree: "Directory tree",
  createDirectory: "Create directory",
  searchFiles: "Search files",
  findFiles: "Find files",
  getSymbolDefinition: "Get symbol",
  readMultipleFiles: "Read files",
  executeCommand: "Run command",
  gitStatus: "Git status",
  gitDiff: "Git diff",
  gitLog: "Git log",
  gitCommit: "Git commit",
  gitBranch: "Git branch",
  gitStash: "Git stash",
  webFetch: "Fetch URL",
};

export const toolKeyArgExtractors: Record<string, (args: Record<string, unknown>) => string> = {
  readFile: (a) => String(a.path ?? ""),
  writeFile: (a) => String(a.path ?? ""),
  editFile: (a) => String(a.path ?? ""),
  applyDiff: (a) => String(a.path ?? ""),
  deleteFile: (a) => String(a.path ?? ""),
  moveFile: (a) => `${a.source ?? ""} → ${a.destination ?? ""}`,
  listDirectory: (a) => String(a.path ?? "."),
  directoryTree: (a) => String(a.path ?? "."),
  createDirectory: (a) => String(a.path ?? ""),
  executeCommand: (a) => truncate(String(a.command ?? ""), 60),
  searchFiles: (a) => String(a.pattern ?? ""),
  findFiles: (a) => String(a.pattern ?? ""),
  getSymbolDefinition: (a) => String(a.symbol ?? ""),
  readMultipleFiles: (a) => {
    const paths = a.paths as string[] | undefined;
    return paths ? truncate(paths.join(", "), 60) : "";
  },
  gitCommit: (a) => truncate(String(a.message ?? ""), 40),
  gitDiff: (a) => String(a.path ?? ""),
  gitBranch: (a) => String(a.action ?? ""),
  webFetch: (a) => truncate(String(a.url ?? ""), 50),
};

export const markdownTheme = {
  firstHeading: chalk.hex(theme.brand).bold.underline,
  heading: chalk.hex(theme.brand).bold,
  strong: chalk.bold,
  em: chalk.italic,
  codespan: chalk.hex(theme.accent),
  code: chalk.hex(theme.assistantText),
  blockquote: chalk.hex(theme.muted).italic,
  del: chalk.dim.strikethrough,
  link: chalk.hex(theme.accent),
  href: chalk.hex(theme.accent).underline,
  hr: chalk.hex(theme.dimmed),
  listitem: (text: string) => text,
  list(body: string, ordered: boolean, indent: string) {
    body = body.trim();
    if (ordered) {
      let num = 0;
      body = body.split("\n").filter(Boolean).map((line) => {
        if (line.match(new RegExp("^(?:" + indent + ")*\\*"))) {
          num++;
          return line.replace("* ", `${num}. `);
        }
        return "   " + line;
      }).join("\n");
    } else {
      body = body.split("\n").filter(Boolean).map((line) => {
        if (line.match(new RegExp("^(?:" + indent + ")*\\*"))) {
          return line.replace("* ", "\u2022 ");
        }
        return "  " + line;
      }).join("\n");
    }
    return body;
  },
  table: chalk.reset,
  paragraph: chalk.reset,
  html: chalk.hex(theme.muted),
  showSectionPrefix: false,
  reflowText: true,
  width: process.stdout.columns || 80,
  tab: 2,
  emoji: true,
  unescape: true,
};
