import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../../src/prompt-builder/index.js';
import type { PromptTemplate } from '../../src/prompt-builder/index.js';
import type { ReviewContext } from '../../src/utils/index.js';

const baseContext: ReviewContext = {
  changes: [
    { path: 'src/auth/login.ts', status: 'modified', additions: 20, deletions: 5 },
  ],
  relatedFiles: ['src/auth/middleware.ts', 'tests/auth/login.test.ts'],
  history: [
    { hash: 'abc1234', date: '2026-05-01', message: 'Fix token validation', author: 'alice' },
    { hash: 'def5678', date: '2026-04-28', message: 'Add session refresh', author: 'bob' },
  ],
  conventions: {
    typescript: { strict: true },
    eslint: { extends: ['eslint:recommended'] },
    prettier: { singleQuote: true },
    testFramework: { name: 'vitest' },
    editorConfig: { indent_size: 2 },
    ci: { provider: 'github' },
  },
  architecture: {
    frameworks: ['express'],
    patterns: ['repository pattern', 'JWT auth'],
    structure: ['src/', 'tests/', 'dist/'],
  },
};

const emptyContext: ReviewContext = {
  changes: [],
  relatedFiles: [],
  history: [],
  conventions: {},
  architecture: { frameworks: [], patterns: [], structure: [] },
};

describe('PromptBuilder constructor', () => {
  it('accepts format option', () => {
    const builder = new PromptBuilder({ format: 'markdown' });
    expect(builder).toBeDefined();
  });

  it('accepts optional focus and maxTokens', () => {
    const builder = new PromptBuilder({ format: 'json', focus: 'security', maxTokens: 2000 });
    expect(builder).toBeDefined();
  });

  it('accepts a custom template', () => {
    const template: PromptTemplate = {
      name: 'custom',
      systemPreamble: 'Custom preamble.',
    };
    const builder = new PromptBuilder({ format: 'markdown', template });
    expect(builder).toBeDefined();
  });
});

describe('PromptBuilder.getTaskDescription', () => {
  const builder = new PromptBuilder({ format: 'markdown' });

  it('returns general description when no focus given', () => {
    const desc = builder.getTaskDescription();
    expect(desc).toMatch(/comprehensive/i);
  });

  it('returns security description for security focus', () => {
    expect(builder.getTaskDescription('security')).toMatch(/security/i);
  });

  it('returns performance description', () => {
    expect(builder.getTaskDescription('performance')).toMatch(/performance/i);
  });

  it('returns architecture description', () => {
    expect(builder.getTaskDescription('architecture')).toMatch(/architect/i);
  });

  it('returns bug description', () => {
    expect(builder.getTaskDescription('bug')).toMatch(/bug|logic/i);
  });

  it('returns refactor description', () => {
    expect(builder.getTaskDescription('refactor')).toMatch(/refactor/i);
  });
});

describe('PromptBuilder.getTaskDescription with custom template', () => {
  it('uses custom task description when provided', () => {
    const template: PromptTemplate = {
      name: 'custom',
      taskDescriptions: { security: 'Only check for SQL injection.' },
    };
    const builder = new PromptBuilder({ format: 'markdown', template });
    expect(builder.getTaskDescription('security')).toBe('Only check for SQL injection.');
  });

  it('falls back to default when custom template has no override', () => {
    const template: PromptTemplate = { name: 'custom', taskDescriptions: {} };
    const builder = new PromptBuilder({ format: 'markdown', focus: 'bug', template });
    expect(builder.getTaskDescription('bug')).toMatch(/bug|logic/i);
  });
});

describe('PromptBuilder.estimateTokens', () => {
  const builder = new PromptBuilder({ format: 'markdown' });

  it('estimates tokens as ceil(chars / 4)', () => {
    expect(builder.estimateTokens('abcd')).toBe(1);
    expect(builder.estimateTokens('a'.repeat(400))).toBe(100);
    expect(builder.estimateTokens('a'.repeat(401))).toBe(101);
  });
});

describe('PromptBuilder.buildPrompt — token budget', () => {
  it('truncates output when estimateTokens exceeds maxTokens', async () => {
    const builder = new PromptBuilder({ format: 'markdown', maxTokens: 10 });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('truncated');
    // token estimate includes the "[truncated]" suffix so allow small overage
    expect(result.tokenEstimate).toBeLessThan(25);
  });

  it('does not truncate when within budget', async () => {
    const builder = new PromptBuilder({ format: 'markdown', maxTokens: 100000 });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).not.toContain('truncated');
  });
});

describe('PromptBuilder — markdown format', () => {
  it('includes # Code Review Context heading', async () => {
    const builder = new PromptBuilder({ format: 'markdown' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toMatch(/^# Code Review Context/);
    expect(result.format).toBe('markdown');
  });

  it('lists changed files with status and line counts', async () => {
    const builder = new PromptBuilder({ format: 'markdown' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('## Changed Files');
    expect(result.content).toContain('src/auth/login.ts');
    expect(result.content).toContain('modified');
    expect(result.content).toContain('+20');
    expect(result.content).toContain('-5');
  });

  it('lists related files', async () => {
    const builder = new PromptBuilder({ format: 'markdown' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('## Related Files');
    expect(result.content).toContain('src/auth/middleware.ts');
    expect(result.content).toContain('tests/auth/login.test.ts');
  });

  it('includes git history with truncated hash', async () => {
    const builder = new PromptBuilder({ format: 'markdown' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('## Recent History');
    expect(result.content).toContain('abc1234');
    expect(result.content).toContain('Fix token validation');
    expect(result.content).toContain('alice');
  });

  it('caps history at 10 commits', async () => {
    const manyCommits = Array.from({ length: 15 }, (_, i) => ({
      hash: `hash${i}`,
      date: '2026-01-01',
      message: `commit ${i}`,
      author: 'dev',
    }));
    const ctx = { ...baseContext, history: manyCommits };
    const builder = new PromptBuilder({ format: 'markdown' });
    const result = await builder.buildPrompt(ctx);
    expect((result.content.match(/- hash/g) ?? []).length).toBe(10);
  });

  it('includes team conventions', async () => {
    const builder = new PromptBuilder({ format: 'markdown' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('## Team Conventions');
    expect(result.content).toContain('TypeScript strict mode');
    expect(result.content).toContain('ESLint configured');
    expect(result.content).toContain('Prettier configured');
  });

  it('includes architecture notes with frameworks and patterns', async () => {
    const builder = new PromptBuilder({ format: 'markdown' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('## Architecture Notes');
    expect(result.content).toContain('express');
    expect(result.content).toContain('repository pattern');
    expect(result.content).toContain('JWT auth');
  });

  it('includes ## Task section', async () => {
    const builder = new PromptBuilder({ format: 'markdown' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('## Task');
    expect(result.content).toMatch(/comprehensive/i);
  });

  it('shows Review Focus line when focus is set', async () => {
    const builder = new PromptBuilder({ format: 'markdown', focus: 'security' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('**Review Focus:** security');
  });

  it('omits empty sections gracefully', async () => {
    const builder = new PromptBuilder({ format: 'markdown' });
    const result = await builder.buildPrompt(emptyContext);
    expect(result.content).not.toContain('## Changed Files');
    expect(result.content).not.toContain('## Related Files');
    expect(result.content).not.toContain('## Recent History');
  });

  it('returns tokenEstimate > 0', async () => {
    const builder = new PromptBuilder({ format: 'markdown' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });
});

describe('PromptBuilder — json format', () => {
  it('returns valid JSON string', async () => {
    const builder = new PromptBuilder({ format: 'json' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.format).toBe('json');
    expect(() => JSON.parse(result.content)).not.toThrow();
  });

  it('has consistent top-level schema keys', async () => {
    const builder = new PromptBuilder({ format: 'json' });
    const result = await builder.buildPrompt(baseContext);
    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveProperty('task', 'code-review');
    expect(parsed).toHaveProperty('focus');
    expect(parsed).toHaveProperty('context');
    expect(parsed).toHaveProperty('instructions');
  });

  it('context includes all required fields', async () => {
    const builder = new PromptBuilder({ format: 'json' });
    const result = await builder.buildPrompt(baseContext);
    const { context } = JSON.parse(result.content);
    expect(context).toHaveProperty('changes');
    expect(context).toHaveProperty('relatedFiles');
    expect(context).toHaveProperty('history');
    expect(context).toHaveProperty('conventions');
    expect(context).toHaveProperty('architecture');
  });

  it('architecture field has frameworks, patterns, structure', async () => {
    const builder = new PromptBuilder({ format: 'json' });
    const result = await builder.buildPrompt(baseContext);
    const { context } = JSON.parse(result.content);
    expect(context.architecture).toHaveProperty('frameworks');
    expect(context.architecture).toHaveProperty('patterns');
    expect(context.architecture).toHaveProperty('structure');
  });

  it('defaults focus to "general" when not specified', async () => {
    const builder = new PromptBuilder({ format: 'json' });
    const result = await builder.buildPrompt(baseContext);
    expect(JSON.parse(result.content).focus).toBe('general');
  });

  it('uses provided focus', async () => {
    const builder = new PromptBuilder({ format: 'json', focus: 'performance' });
    const result = await builder.buildPrompt(baseContext);
    expect(JSON.parse(result.content).focus).toBe('performance');
  });

  it('caps history at 10 commits', async () => {
    const manyCommits = Array.from({ length: 15 }, (_, i) => ({
      hash: `hash${i}`, date: '2026-01-01', message: `commit ${i}`, author: 'dev',
    }));
    const ctx = { ...baseContext, history: manyCommits };
    const builder = new PromptBuilder({ format: 'json' });
    const result = await builder.buildPrompt(ctx);
    expect(JSON.parse(result.content).context.history).toHaveLength(10);
  });

  it('serialises FileChange objects correctly', async () => {
    const builder = new PromptBuilder({ format: 'json' });
    const result = await builder.buildPrompt(baseContext);
    const [first] = JSON.parse(result.content).context.changes;
    expect(first.path).toBe('src/auth/login.ts');
    expect(first.status).toBe('modified');
    expect(first.additions).toBe(20);
    expect(first.deletions).toBe(5);
  });

  it('returns tokenEstimate > 0', async () => {
    const builder = new PromptBuilder({ format: 'json' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });
});

describe('PromptBuilder — prompt format', () => {
  it('returns format: prompt', async () => {
    const builder = new PromptBuilder({ format: 'prompt' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.format).toBe('prompt');
  });

  it('starts with an expert reviewer preamble', async () => {
    const builder = new PromptBuilder({ format: 'prompt' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toMatch(/expert code reviewer/i);
  });

  it('uses custom systemPreamble from template', async () => {
    const template = { name: 'custom', systemPreamble: 'You are a security auditor.' };
    const builder = new PromptBuilder({ format: 'prompt', template });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('You are a security auditor.');
    expect(result.content).not.toMatch(/expert code reviewer/i);
  });

  it('includes ## Changed Files section with per-file status', async () => {
    const builder = new PromptBuilder({ format: 'prompt' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('## Changed Files');
    expect(result.content).toContain('### src/auth/login.ts');
    expect(result.content).toContain('modified');
    expect(result.content).toContain('+20');
  });

  it('includes related files section', async () => {
    const builder = new PromptBuilder({ format: 'prompt' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('## Related Files for Context');
    expect(result.content).toContain('src/auth/middleware.ts');
  });

  it('includes recent changes section capped at 5 commits', async () => {
    const manyCommits = Array.from({ length: 10 }, (_, i) => ({
      hash: `hash${i}`, date: '2026-01-01', message: `commit ${i}`, author: 'dev',
    }));
    const ctx = { ...baseContext, history: manyCommits };
    const builder = new PromptBuilder({ format: 'prompt' });
    const result = await builder.buildPrompt(ctx);
    expect(result.content).toContain('## Recent Changes to These Files');
    expect((result.content.match(/- commit/g) ?? []).length).toBe(5);
  });

  it('includes conventions when present', async () => {
    const builder = new PromptBuilder({ format: 'prompt' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('## Team Conventions');
    expect(result.content).toContain('TypeScript strict mode');
  });

  it('includes ## Your Task with focus-specific instructions', async () => {
    const builder = new PromptBuilder({ format: 'prompt', focus: 'security' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('## Your Task');
    expect(result.content).toMatch(/security/i);
  });

  it('emits focus line when focus is set', async () => {
    const builder = new PromptBuilder({ format: 'prompt', focus: 'refactor' });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('**refactor**');
  });

  it('omits related files section when empty', async () => {
    const builder = new PromptBuilder({ format: 'prompt' });
    const result = await builder.buildPrompt(emptyContext);
    expect(result.content).not.toContain('## Related Files');
  });

  it('is ready for direct paste into an LLM — no JSON wrapping', async () => {
    const builder = new PromptBuilder({ format: 'prompt' });
    const result = await builder.buildPrompt(baseContext);
    expect(() => JSON.parse(result.content)).toThrow();
  });
});

describe('PromptBuilder — review focus modes', () => {
  const focuses = ['security', 'performance', 'architecture', 'bug', 'refactor'] as const;

  for (const focus of focuses) {
    it(`renders correct task description for focus: ${focus}`, async () => {
      const builder = new PromptBuilder({ format: 'markdown', focus });
      const result = await builder.buildPrompt(baseContext);
      const desc = builder.getTaskDescription(focus);
      expect(result.content).toContain(desc);
    });

    it(`includes focus line in markdown for ${focus}`, async () => {
      const builder = new PromptBuilder({ format: 'markdown', focus });
      const result = await builder.buildPrompt(baseContext);
      expect(result.content).toContain(`**Review Focus:** ${focus}`);
    });

    it(`json output sets focus field to ${focus}`, async () => {
      const builder = new PromptBuilder({ format: 'json', focus });
      const result = await builder.buildPrompt(baseContext);
      expect(JSON.parse(result.content).focus).toBe(focus);
    });

    it(`prompt output emphasises ${focus} focus`, async () => {
      const builder = new PromptBuilder({ format: 'prompt', focus });
      const result = await builder.buildPrompt(baseContext);
      expect(result.content).toContain(`**${focus}**`);
    });
  }

  it('architecture focus surfaces Architecture Notes before Changed Files', async () => {
    const builder = new PromptBuilder({ format: 'markdown', focus: 'architecture' });
    const result = await builder.buildPrompt(baseContext);
    const archIdx = result.content.indexOf('## Architecture Notes');
    const changedIdx = result.content.indexOf('## Changed Files');
    expect(archIdx).toBeLessThan(changedIdx);
  });

  it('security focus surfaces conventions before history', async () => {
    const builder = new PromptBuilder({ format: 'markdown', focus: 'security' });
    const result = await builder.buildPrompt(baseContext);
    const convIdx = result.content.indexOf('## Team Conventions');
    const historyIdx = result.content.indexOf('## Recent History');
    expect(convIdx).toBeLessThan(historyIdx);
  });

  it('bug focus surfaces history before conventions', async () => {
    const builder = new PromptBuilder({ format: 'markdown', focus: 'bug' });
    const result = await builder.buildPrompt(baseContext);
    const historyIdx = result.content.indexOf('## Recent History');
    const convIdx = result.content.indexOf('## Team Conventions');
    expect(historyIdx).toBeLessThan(convIdx);
  });

  it('all focuses still include all sections', async () => {
    for (const focus of focuses) {
      const builder = new PromptBuilder({ format: 'markdown', focus });
      const result = await builder.buildPrompt(baseContext);
      expect(result.content).toContain('## Changed Files');
      expect(result.content).toContain('## Team Conventions');
      expect(result.content).toContain('## Task');
    }
  });
});

describe('PromptBuilder template system — sectionOrder', () => {
  it('respects custom section order', async () => {
    const template: PromptTemplate = {
      name: 'reversed',
      sectionOrder: ['task', 'architecture', 'conventions', 'history', 'related-files', 'changed-files'],
    };
    const builder = new PromptBuilder({ format: 'markdown', template });
    const result = await builder.buildPrompt(baseContext);
    const taskIdx = result.content.indexOf('## Task');
    const changedIdx = result.content.indexOf('## Changed Files');
    expect(taskIdx).toBeLessThan(changedIdx);
  });

  it('uses custom systemPreamble in markdown', async () => {
    const template: PromptTemplate = { name: 'preamble', systemPreamble: 'PROJECT-PREAMBLE' };
    const builder = new PromptBuilder({ format: 'markdown', template });
    const result = await builder.buildPrompt(baseContext);
    expect(result.content).toContain('PROJECT-PREAMBLE');
  });
});
