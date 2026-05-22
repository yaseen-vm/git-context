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
