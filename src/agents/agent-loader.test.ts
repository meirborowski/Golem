import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadAgent, loadAgents, listAgentNames } from './agent-loader.js';

const makeTempDir = (suffix: string): string => {
  const dir = join(tmpdir(), `golem-agent-loader-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const FULL_AGENT_MD = `---
name: test-agent
description: A test agent
tools: [readFile, writeFile]
maxTurns: 10
maxConsecutiveErrors: 2
continuationPrompt: Keep going.
stopCondition: agent-done-only
---

# Identity

You are a test assistant.

# Guidelines

- Be helpful.
- Be concise.

# Tools

- readFile: Read files
- writeFile: Write files

# Behavior

Answer questions directly.
`;

const MINIMAL_AGENT_MD = `---
name: minimal
description: Minimal agent
---

# Identity

Just an agent.
`;

describe('agent-loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir('test');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadAgent', () => {
    it('loads a full agent config from project .golem/agents/', () => {
      const agentDir = join(tempDir, '.golem', 'agents');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, 'test-agent.md'), FULL_AGENT_MD, 'utf-8');

      const agent = loadAgent('test-agent', tempDir);
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('test-agent');
      expect(agent!.description).toBe('A test agent');
      expect(agent!.tools).toEqual(['readFile', 'writeFile']);
      expect(agent!.maxTurns).toBe(10);
      expect(agent!.maxConsecutiveErrors).toBe(2);
      expect(agent!.continuationPrompt).toBe('Keep going.');
      expect(agent!.stopCondition).toBe('agent-done-only');
    });

    it('parses markdown sections correctly', () => {
      const agentDir = join(tempDir, '.golem', 'agents');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, 'test-agent.md'), FULL_AGENT_MD, 'utf-8');

      const agent = loadAgent('test-agent', tempDir)!;
      expect(agent.sections['identity']).toBe('You are a test assistant.');
      expect(agent.sections['guidelines']).toContain('- Be helpful.');
      expect(agent.sections['guidelines']).toContain('- Be concise.');
      expect(agent.sections['tools']).toContain('- readFile: Read files');
      expect(agent.sections['behavior']).toBe('Answer questions directly.');
    });

    it('applies defaults for missing frontmatter fields', () => {
      const agentDir = join(tempDir, '.golem', 'agents');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, 'minimal.md'), MINIMAL_AGENT_MD, 'utf-8');

      const agent = loadAgent('minimal', tempDir)!;
      expect(agent.name).toBe('minimal');
      expect(agent.tools).toEqual([]);
      expect(agent.maxTurns).toBe(20);
      expect(agent.maxConsecutiveErrors).toBe(3);
      expect(agent.stopCondition).toBe('default');
      expect(agent.continuationPrompt).toContain('Continue working');
    });

    it('returns null for non-existent agent', () => {
      const agent = loadAgent('nonexistent', tempDir);
      expect(agent).toBeNull();
    });

    it('uses filename as name when frontmatter name is missing', () => {
      const agentDir = join(tempDir, '.golem', 'agents');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(
        join(agentDir, 'my-agent.md'),
        '---\ndescription: No name field\n---\n\n# Identity\n\nHello.',
        'utf-8',
      );

      const agent = loadAgent('my-agent', tempDir)!;
      expect(agent.name).toBe('my-agent');
    });

    it('handles tools: null in frontmatter', () => {
      const agentDir = join(tempDir, '.golem', 'agents');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(
        join(agentDir, 'all-tools.md'),
        '---\nname: all-tools\ndescription: All tools\ntools: null\n---\n\n# Identity\n\nHi.',
        'utf-8',
      );

      const agent = loadAgent('all-tools', tempDir)!;
      expect(agent.tools).toEqual([]);
    });

    it('handles invalid stopCondition by defaulting', () => {
      const agentDir = join(tempDir, '.golem', 'agents');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(
        join(agentDir, 'bad-stop.md'),
        '---\nname: bad-stop\ndescription: Bad stop\nstopCondition: invalid\n---\n\n# Identity\n\nHi.',
        'utf-8',
      );

      const agent = loadAgent('bad-stop', tempDir)!;
      expect(agent.stopCondition).toBe('default');
    });

    it('loads bundled default agent', () => {
      // loadAgent should find the bundled default.md (no project or global agents)
      const agent = loadAgent('default', tempDir);
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe('default');
      expect(agent!.description).toBe('General-purpose coding assistant');
    });
  });

  describe('loadAgents', () => {
    it('includes bundled default agent', () => {
      const agents = loadAgents(tempDir);
      expect(agents.has('default')).toBe(true);
    });

    it('project agents override bundled agents', () => {
      const agentDir = join(tempDir, '.golem', 'agents');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(
        join(agentDir, 'default.md'),
        '---\nname: default\ndescription: Custom default\n---\n\n# Identity\n\nCustom.',
        'utf-8',
      );

      const agents = loadAgents(tempDir);
      expect(agents.get('default')!.description).toBe('Custom default');
    });

    it('discovers multiple agents', () => {
      const agentDir = join(tempDir, '.golem', 'agents');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, 'reviewer.md'), MINIMAL_AGENT_MD.replace('minimal', 'reviewer'), 'utf-8');
      writeFileSync(join(agentDir, 'planner.md'), MINIMAL_AGENT_MD.replace('minimal', 'planner'), 'utf-8');

      const agents = loadAgents(tempDir);
      expect(agents.has('reviewer')).toBe(true);
      expect(agents.has('planner')).toBe(true);
      expect(agents.has('default')).toBe(true);
    });
  });

  describe('listAgentNames', () => {
    it('returns sorted list of agent names', () => {
      const agentDir = join(tempDir, '.golem', 'agents');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, 'zebra.md'), MINIMAL_AGENT_MD.replace('minimal', 'zebra'), 'utf-8');
      writeFileSync(join(agentDir, 'alpha.md'), MINIMAL_AGENT_MD.replace('minimal', 'alpha'), 'utf-8');

      const names = listAgentNames(tempDir);
      expect(names).toContain('alpha');
      expect(names).toContain('zebra');
      expect(names).toContain('default');
      expect(names.indexOf('alpha')).toBeLessThan(names.indexOf('zebra'));
    });
  });
});
