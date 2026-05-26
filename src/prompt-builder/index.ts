import {
  OutputFormat,
  ReviewFocus,
  ReviewContext,
  ConventionInfo,
  truncateContent,
} from '../utils/index.js';

export interface PromptTemplate {
  name: string;
  systemPreamble?: string;
  sectionOrder?: string[];
  taskDescriptions?: Partial<Record<ReviewFocus | 'general', string>>;
}

export interface PromptBuilderOptions {
  format: OutputFormat;
  focus?: ReviewFocus;
  maxTokens?: number;
  template?: PromptTemplate;
}

export interface PromptResult {
  content: string;
  format: OutputFormat;
  tokenEstimate: number;
}

const DEFAULT_SECTION_ORDER = [
  'changed-files',
  'related-files',
  'history',
  'conventions',
  'architecture',
  'task',
];

// Focus-specific section orders surface the most relevant context first.
const FOCUS_SECTION_ORDERS: Record<ReviewFocus, string[]> = {
  security: ['changed-files', 'related-files', 'conventions', 'history', 'architecture', 'task'],
  performance: ['changed-files', 'related-files', 'architecture', 'history', 'conventions', 'task'],
  architecture: ['architecture', 'changed-files', 'related-files', 'conventions', 'history', 'task'],
  bug: ['changed-files', 'history', 'related-files', 'conventions', 'architecture', 'task'],
  refactor: ['changed-files', 'related-files', 'conventions', 'architecture', 'history', 'task'],
};

const DEFAULT_TASK_DESCRIPTIONS: Record<ReviewFocus | 'general', string> = {
  security:
    'Identify security vulnerabilities, potential exploits, and security best practices violations. Look for injection risks, authentication issues, data exposure, and other security concerns.',
  performance:
    'Identify performance bottlenecks, inefficient algorithms, unnecessary computations, memory leaks, and optimization opportunities.',
  architecture:
    'Evaluate the architectural design, module boundaries, separation of concerns, dependency management, and overall code organization.',
  bug: 'Identify potential bugs, logic errors, edge cases, error handling issues, and race conditions.',
  refactor:
    'Suggest refactoring opportunities to improve code readability, maintainability, and adherence to DRY/SOLID principles.',
  general:
    'Provide a comprehensive code review covering correctness, readability, maintainability, and best practices.',
};

export class PromptBuilder {
  private options: PromptBuilderOptions;
  private template: PromptTemplate;

  constructor(options: PromptBuilderOptions) {
    this.options = options;
    this.template = options.template ?? { name: 'default' };
  }

  async buildPrompt(context: ReviewContext): Promise<PromptResult> {
    const { format, focus, maxTokens } = this.options;

    const optimized = maxTokens ? this.optimizeContext(context, maxTokens) : context;

    let content: string;

    switch (format) {
      case 'json':
        content = this.buildJsonOutput(optimized, focus);
        break;
      case 'prompt':
        content = this.buildAIPrompt(optimized, focus);
        break;
      case 'markdown':
      default:
        content = this.buildMarkdownOutput(optimized, focus);
        break;
    }

    if (maxTokens && this.estimateTokens(content) > maxTokens) {
      content = this.truncateToTokenBudget(content, maxTokens);
    }

    return {
      content,
      format,
      tokenEstimate: this.estimateTokens(content),
    };
  }

  /**
   * Reduces context to fit within the token budget before building output.
   * Strategy:
   *  1. Deduplicate related files against changed files (highest signal kept, overlap removed)
   *  2. Prioritize changed files with most additions/deletions (high-signal first)
   *  3. Limit history and related files proportionally to remaining budget
   *  4. Drop low-signal items when budget is very tight
   */
  optimizeContext(context: ReviewContext, maxTokens: number): ReviewContext {
    const changedSet = new Set(context.changes.map((c) => c.path));

    // Deduplicate: remove related files that are already in changed files
    const deduplicatedRelated = context.relatedFiles.filter((f) => !changedSet.has(f));

    // Prioritize changed files by total line impact (additions + deletions)
    const sortedChanges = [...context.changes].sort(
      (a, b) => b.additions + b.deletions - (a.additions + a.deletions),
    );

    // Estimate base token cost of fixed content (task description + headings ≈ 200 tokens)
    const fixedTokens = 200;
    const available = Math.max(0, maxTokens - fixedTokens);

    // Allocate budget proportionally: 40% changes, 25% related, 20% history, 15% conventions+arch
    const changeBudget = Math.floor(available * 0.4);
    const relatedBudget = Math.floor(available * 0.25);
    const historyBudget = Math.floor(available * 0.2);

    const keptPaths = new Set(
      this.limitByTokenBudget(sortedChanges.map((c) => c.path), changeBudget),
    );
    const limitedChanges = sortedChanges.filter((c) => keptPaths.has(c.path));
    const limitedRelated = this.limitByTokenBudget(deduplicatedRelated, relatedBudget);
    const limitedHistory = context.history.slice(
      0,
      Math.max(1, Math.floor(historyBudget / 20)),
    );

    return {
      ...context,
      changes: limitedChanges,
      relatedFiles: limitedRelated,
      history: limitedHistory,
    };
  }

  private limitByTokenBudget(items: string[], tokenBudget: number): string[] {
    const result: string[] = [];
    let used = 0;
    for (const item of items) {
      const cost = this.estimateTokens(item);
      if (used + cost > tokenBudget) break;
      result.push(item);
      used += cost;
    }
    return result;
  }

  getTaskDescription(focus?: ReviewFocus): string {
    const key = focus ?? 'general';
    return (
      this.template.taskDescriptions?.[key] ??
      DEFAULT_TASK_DESCRIPTIONS[key]
    );
  }

  estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  private getSectionOrder(): string[] {
    if (this.template.sectionOrder) return this.template.sectionOrder;
    const focus = this.options.focus;
    return focus ? FOCUS_SECTION_ORDERS[focus] : DEFAULT_SECTION_ORDER;
  }

  private buildMarkdownOutput(context: ReviewContext, focus?: ReviewFocus): string {
    const sections: string[] = [];
    const order = this.getSectionOrder();
    const preamble = this.template.systemPreamble;

    sections.push('# Code Review Context\n');

    if (preamble) {
      sections.push(`${preamble}\n`);
    }

    if (focus) {
      sections.push(`**Review Focus:** ${focus}\n`);
    }

    for (const section of order) {
      switch (section) {
        case 'changed-files':
          if (context.changes.length > 0) {
            sections.push('## Changed Files\n');
            for (const change of context.changes) {
              sections.push(
                `### ${change.path} (${change.status}, +${change.additions}, -${change.deletions})`,
              );
              if (change.diff) {
                sections.push('```diff');
                sections.push(change.diff.trim());
                sections.push('```');
              }
              sections.push('');
            }
          }
          break;

        case 'related-files':
          if (context.relatedFiles.length > 0) {
            sections.push('## Related Files\n');
            for (const file of context.relatedFiles) {
              sections.push(`- ${file}`);
            }
            sections.push('');
          }
          break;

        case 'history':
          if (context.history.length > 0) {
            sections.push('## Recent History\n');
            for (const commit of context.history.slice(0, 10)) {
              sections.push(`- ${commit.hash.slice(0, 7)} ${commit.message} (${commit.author})`);
            }
            sections.push('');
          }
          break;

        case 'conventions':
          if (context.conventions) {
            sections.push('## Team Conventions\n');
            for (const conv of this.summarizeConventions(context.conventions)) {
              sections.push(`- ${conv}`);
            }
            sections.push('');
          }
          break;

        case 'architecture':
          if (context.architecture) {
            sections.push('## Architecture Notes\n');
            if (context.architecture.frameworks.length > 0) {
              sections.push(`**Frameworks:** ${context.architecture.frameworks.join(', ')}`);
            }
            for (const pattern of context.architecture.patterns) {
              sections.push(`- ${pattern}`);
            }
            if (context.architecture.structure.length > 0) {
              sections.push('');
              sections.push('**Structure:**');
              for (const dir of context.architecture.structure.slice(0, 8)) {
                sections.push(`- ${dir}`);
              }
            }
            sections.push('');
          }
          break;

        case 'task':
          sections.push('## Task\n');
          sections.push(this.getTaskDescription(focus));
          break;
      }
    }

    return sections.join('\n');
  }

  private buildJsonOutput(context: ReviewContext, focus?: ReviewFocus): string {
    const output = {
      task: 'code-review',
      focus: focus ?? 'general',
      context: {
        changes: context.changes,
        relatedFiles: context.relatedFiles,
        history: context.history.slice(0, 10),
        conventions: this.summarizeConventions(context.conventions),
        architecture: {
          frameworks: context.architecture?.frameworks ?? [],
          patterns: context.architecture?.patterns ?? [],
          structure: context.architecture?.structure ?? [],
        },
      },
      instructions: this.getTaskDescription(focus),
    };

    return JSON.stringify(output, null, 2);
  }

  private buildAIPrompt(context: ReviewContext, focus?: ReviewFocus): string {
    const parts: string[] = [];
    const preamble =
      this.template.systemPreamble ??
      'You are an expert code reviewer. Analyze the following code changes and provide feedback.';

    parts.push(`${preamble}\n`);

    if (focus) {
      parts.push(`Focus specifically on: **${focus}**\n`);
    }

    parts.push('## Changed Files\n');
    for (const change of context.changes) {
      parts.push(`### ${change.path}`);
      parts.push(`Status: ${change.status} | +${change.additions} -${change.deletions}`);
      if (change.diff) {
        parts.push('```diff');
        parts.push(change.diff.trim());
        parts.push('```');
      }
      parts.push('');
    }

    if (context.relatedFiles.length > 0) {
      parts.push('## Related Files for Context\n');
      for (const file of context.relatedFiles) {
        parts.push(`- ${file}`);
      }
      parts.push('');
    }

    if (context.history.length > 0) {
      parts.push('## Recent Changes to These Files\n');
      for (const commit of context.history.slice(0, 5)) {
        parts.push(`- ${commit.message} (${commit.author})`);
      }
      parts.push('');
    }

    if (context.conventions) {
      const convSummary = this.summarizeConventions(context.conventions);
      if (convSummary.length > 0) {
        parts.push('## Team Conventions\n');
        for (const conv of convSummary) {
          parts.push(`- ${conv}`);
        }
        parts.push('');
      }
    }

    parts.push('## Your Task\n');
    parts.push(this.getTaskDescription(focus));

    return parts.join('\n');
  }

  private summarizeConventions(conventions: ConventionInfo): string[] {
    const summary: string[] = [];

    if (conventions.typescript) {
      summary.push('TypeScript strict mode enabled');
    }
    if (conventions.eslint) {
      summary.push('ESLint configured');
    }
    if (conventions.prettier) {
      summary.push('Prettier configured');
    }
    if (conventions.testFramework) {
      summary.push('Test framework configured');
    }
    if (conventions.editorConfig) {
      summary.push('EditorConfig present');
    }
    if (conventions.ci) {
      summary.push('CI pipeline configured');
    }

    return summary;
  }

  private truncateToTokenBudget(content: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    return truncateContent(content, maxChars);
  }
}
