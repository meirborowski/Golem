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

export function createTools(
  fs: IFileSystem,
  exec: IExecutionEnvironment,
  context: AgentContext,
  model: LanguageModel,
) {
  return {
    readFile: createReadFileTool(fs, model, context),
    writeFile: createWriteFileTool(fs, context),
    listDirectory: createListDirectoryTool(fs),
    directoryTree: createDirectoryTreeTool(fs),
    maxDepth: createMaxDepthTool(fs),
    executeCommand: createExecuteCommandTool(exec, context.workingDirectory),
  };
}
