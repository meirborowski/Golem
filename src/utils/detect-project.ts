import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ProjectInfo {
  type: string;
  name?: string;
  description?: string;
  language: string;
  frameworks: string[];
}

interface ManifestDetector {
  file: string;
  type: string;
  language: string;
  detect: (content: string) => Partial<ProjectInfo>;
}

const detectors: ManifestDetector[] = [
  {
    file: 'package.json',
    type: 'node',
    language: 'JavaScript/TypeScript',
    detect: (content: string) => {
      try {
        const pkg = JSON.parse(content);
        const frameworks: string[] = [];
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['react']) frameworks.push('React');
        if (deps['next']) frameworks.push('Next.js');
        if (deps['vue']) frameworks.push('Vue');
        if (deps['svelte']) frameworks.push('Svelte');
        if (deps['express']) frameworks.push('Express');
        if (deps['fastify']) frameworks.push('Fastify');
        return { name: pkg.name, description: pkg.description, frameworks };
      } catch {
        return {};
      }
    },
  },
  {
    file: 'Cargo.toml',
    type: 'rust',
    language: 'Rust',
    detect: () => ({ frameworks: [] }),
  },
  {
    file: 'go.mod',
    type: 'go',
    language: 'Go',
    detect: () => ({ frameworks: [] }),
  },
  {
    file: 'pyproject.toml',
    type: 'python',
    language: 'Python',
    detect: () => ({ frameworks: [] }),
  },
  {
    file: 'requirements.txt',
    type: 'python',
    language: 'Python',
    detect: () => ({ frameworks: [] }),
  },
  {
    file: 'pom.xml',
    type: 'java',
    language: 'Java',
    detect: () => ({ frameworks: [] }),
  },
];

export function detectProject(cwd: string): ProjectInfo | null {
  for (const detector of detectors) {
    const filePath = join(cwd, detector.file);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      const info = detector.detect(content);
      return {
        type: detector.type,
        language: detector.language,
        frameworks: [],
        ...info,
      };
    }
  }
  return null;
}
