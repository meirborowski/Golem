import type { GolemExtension } from '../core/extension.js';
import { builtinToolsExtension } from './builtin-tools.js';
import { builtinProvidersExtension } from './builtin-providers.js';
import { builtinCommandsExtension } from './builtin-commands.js';
import { builtinPromptSectionsExtension } from './builtin-prompt-sections.js';

/** All built-in extensions, in registration order. */
export const builtinExtensions: GolemExtension[] = [
  builtinProvidersExtension,
  builtinToolsExtension,
  builtinCommandsExtension,
  builtinPromptSectionsExtension,
];

export { builtinToolsExtension } from './builtin-tools.js';
export { builtinProvidersExtension } from './builtin-providers.js';
export { builtinCommandsExtension } from './builtin-commands.js';
export { builtinPromptSectionsExtension } from './builtin-prompt-sections.js';
