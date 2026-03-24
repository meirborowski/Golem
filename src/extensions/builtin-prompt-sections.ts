import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectProject } from '../utils/detect-project.js';
import { loadMemoryForPrompt } from '../core/memory.js';
import type { GolemExtension, SystemPromptSection } from '../core/extension.js';

const PROJECT_DOC_FILES = ['GOLEM.md', 'CLAUDE.md', 'README.md'];
const MAX_DOC_CHARS = 8000;

function loadProjectDoc(cwd: string): { file: string; content: string } | null {
  for (const filename of PROJECT_DOC_FILES) {
    const filePath = join(cwd, filename);
    if (existsSync(filePath)) {
      try {
        let content = readFileSync(filePath, 'utf-8').trim();
        if (content.length > MAX_DOC_CHARS) {
          content = content.slice(0, MAX_DOC_CHARS) + '\n\n[... truncated]';
        }
        return { file: filename, content };
      } catch {
        // Skip unreadable files
      }
    }
  }
  return null;
}

/**
 * Built-in system prompt sections extension.
 * Contributes: working directory, project info, project docs, memory.
 *
 * NOTE: Agent sections (identity, guidelines, behavior) and tool descriptions
 * are handled by the ConversationEngine directly since they depend on runtime agent state.
 */
export const builtinPromptSectionsExtension: GolemExtension = {
  name: 'builtin-prompt-sections',
  systemPromptSections: (config) => {
    const sections: SystemPromptSection[] = [];

    // Working directory
    sections.push({
      title: 'Working Directory',
      content: `Current directory: ${config.cwd}`,
      order: 20,
    });

    // Project info
    const project = detectProject(config.cwd);
    if (project) {
      const lines = [`Type: ${project.type} (${project.language})`];
      if (project.name) lines.push(`Name: ${project.name}`);
      if (project.frameworks.length > 0) {
        lines.push(`Frameworks: ${project.frameworks.join(', ')}`);
      }
      sections.push({
        title: 'Project Info',
        content: lines.join('\n'),
        order: 25,
      });
    }

    // Project documentation
    const doc = loadProjectDoc(config.cwd);
    if (doc) {
      sections.push({
        title: `Project Documentation (from ${doc.file})`,
        content: doc.content,
        order: 30,
      });
    }

    // Persistent memory
    const memoryContent = loadMemoryForPrompt(config.cwd);
    if (memoryContent) {
      sections.push({
        title: 'Remembered Context',
        content: memoryContent,
        order: 35,
      });
    }

    return sections;
  },
};
