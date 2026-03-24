import { readFile, writeFile, editFile, listFiles, searchFiles, bash, git, think, fetchUrl, patch, todoManager, memory, multiEdit, codeOutline, rename, directoryTree, webSearch, diffFiles, agentDone } from '../tools/index.js';
import type { GolemExtension } from '../core/extension.js';

/**
 * Built-in tools extension. Bundles all 18 core tools.
 */
export const builtinToolsExtension: GolemExtension = {
  name: 'builtin-tools',
  tools: (cwd, config) => {
    const searxngBaseUrl =
      config.providers.searxng?.baseUrl ?? process.env['SEARXNG_BASE_URL'] ?? 'http://localhost:8080';

    return {
      readFile: readFile(cwd),
      writeFile: writeFile(cwd),
      editFile: editFile(cwd),
      listFiles: listFiles(cwd),
      searchFiles: searchFiles(cwd),
      bash: bash(cwd),
      git: git(cwd),
      think: think(),
      fetchUrl: fetchUrl(),
      patch: patch(cwd),
      todoManager: todoManager(cwd),
      memory: memory(cwd),
      multiEdit: multiEdit(cwd),
      codeOutline: codeOutline(cwd),
      rename: rename(cwd),
      directoryTree: directoryTree(cwd),
      webSearch: webSearch(searxngBaseUrl),
      diffFiles: diffFiles(cwd),
      agentDone: agentDone(),
    };
  },
};
