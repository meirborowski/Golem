import type { LanguageModel } from "ai";
import type { IFileSystem } from "#core/interfaces/IFileSystem.js";
import type { IExecutionEnvironment } from "#core/interfaces/IExecutionEnvironment.js";
import type { AgentContext } from "#core/entities/AgentContext.js";
import { createReadFileTool } from "./readFile.js";
import { createWriteFileTool } from "./writeFile.js";
import { createListDirectoryTool } from "./listDirectory.js";
import { createDirectoryTreeTool } from "./directoryTree.js";
import { createMaxDepthTool } from "./maxDepth.js";
import { createExecuteCommandTool } from "./executeCommand.js";
import { createSearchFilesTool } from "./searchFiles.js";
import { createEditFileTool } from "./editFile.js";
import { createFindFilesTool } from "./findFiles.js";
import { createDeleteFileTool } from "./deleteFile.js";
import { createGitStatusTool } from "./gitStatus.js";
import { createGitDiffTool } from "./gitDiff.js";
import { createGitLogTool } from "./gitLog.js";
import { createGitCommitTool } from "./gitCommit.js";
import { createMoveFileTool } from "./moveFile.js";
import { createGetSymbolDefinitionTool } from "./getSymbolDefinition.js";
import { createReadMultipleFilesTool } from "./readMultipleFiles.js";
import { createCreateDirectoryTool } from "./createDirectory.js";
import { createWebFetchTool } from "./webFetch.js";
import { createApplyDiffTool } from "./applyDiff.js";
import { createGitBranchTool } from "./gitBranch.js";
import { createGitStashTool } from "./gitStash.js";
import { createThinkTool } from "./think.js";
import { createSearchReplaceTool } from "./searchReplace.js";
import { createGitShowTool } from "./gitShow.js";
import { createGitBlameTool } from "./gitBlame.js";
import { createRunTestsTool } from "./runTests.js";
import { createListSymbolsTool } from "./listSymbols.js";
import { createDiagnosticsTool } from "./diagnostics.js";

export function createTools(
  fs: IFileSystem,
  exec: IExecutionEnvironment,
  context: AgentContext,
  model: LanguageModel,
) {
  const cwd = context.workingDirectory;

  return {
    // File reading
    readFile: createReadFileTool(fs, model, context),
    readMultipleFiles: createReadMultipleFilesTool(fs, model, context),

    // File writing & editing
    writeFile: createWriteFileTool(fs, context),
    editFile: createEditFileTool(fs, context),
    deleteFile: createDeleteFileTool(fs, context),
    moveFile: createMoveFileTool(fs, context),
    applyDiff: createApplyDiffTool(fs, context),

    // Directory operations
    listDirectory: createListDirectoryTool(fs),
    directoryTree: createDirectoryTreeTool(fs),
    maxDepth: createMaxDepthTool(fs),
    createDirectory: createCreateDirectoryTool(fs),

    // Search & navigation
    searchFiles: createSearchFilesTool(fs),
    findFiles: createFindFilesTool(fs),
    getSymbolDefinition: createGetSymbolDefinitionTool(fs),
    listSymbols: createListSymbolsTool(fs),
    searchReplace: createSearchReplaceTool(fs, context),

    // Shell execution
    executeCommand: createExecuteCommandTool(exec, cwd),

    // Testing & diagnostics
    runTests: createRunTestsTool(exec, fs, cwd),
    diagnostics: createDiagnosticsTool(exec, fs, cwd),

    // Git
    gitStatus: createGitStatusTool(exec, cwd),
    gitDiff: createGitDiffTool(exec, cwd),
    gitLog: createGitLogTool(exec, cwd),
    gitCommit: createGitCommitTool(exec, cwd),
    gitBranch: createGitBranchTool(exec, cwd),
    gitStash: createGitStashTool(exec, cwd),
    gitShow: createGitShowTool(exec, cwd),
    gitBlame: createGitBlameTool(exec, cwd),

    // Web
    webFetch: createWebFetchTool(),

    // Reasoning
    think: createThinkTool(),
  };
}
