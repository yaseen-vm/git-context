import {
  OutputFormat,
  ReviewFocus,
  ReviewContext,
  ConventionInfo,
  FileChange,
  RelatedFileContext,
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
    const deduplicatedRelated = context.relatedFiles.filter((f) => !changedSet.has(f.path));

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

    const limitedChanges = this.limitChangesByTokenBudget(sortedChanges, changeBudget);
    const limitedRelated = this.limitRelatedByTokenBudget(deduplicatedRelated, relatedBudget);
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

  private limitChangesByTokenBudget(changes: FileChange[], tokenBudget: number): FileChange[] {
    const result: FileChange[] = [];
    let used = 0;
    for (const change of changes) {
      const diffLength = change.diff?.length ?? (change.additions + change.deletions) * 5;
      const cost = this.estimateTokens(change.diff ?? ' '.repeat(diffLength));
      if (used + cost > tokenBudget && result.length > 0) {
        // Truncate the diff to fit remaining budget rather than dropping entirely
        const remaining = tokenBudget - used;
        if (remaining > 50) {
          const maxChars = remaining * 4;
          result.push({
            ...change,
            diff: change.diff
              ? truncateContent(change.diff, maxChars)
              : change.diff,
          });
        }
        break;
      }
      result.push(change);
      used += cost;
    }
    return result;
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

  private limitRelatedByTokenBudget(items: RelatedFileContext[], tokenBudget: number): RelatedFileContext[] {
    const result: RelatedFileContext[] = [];
    let used = 0;
    for (const item of items) {
      const content = item.snippet ?? item.path;
      const cost = this.estimateTokens(content);
      if (used + cost > tokenBudget && result.length > 0) break;
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
              sections.push(`### ${file.path}`);
              sections.push(`_${file.reason}_\n`);
              if (file.snippet) {
                const ext = file.path.split('.').pop() ?? '';
                sections.push(`\`\`\`${ext}`);
                sections.push(file.snippet.trim());
                sections.push('```');
              }
              sections.push('');
            }
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

  private buildSystemSection(context: ReviewContext, focus?: ReviewFocus): string {
    const lines: string[] = [];
    const role =
      this.template.systemPreamble ??
      'You are an expert code reviewer. Your job is to identify real problems, not nitpick style.';

    lines.push(role);
    lines.push('');

    if (context.conventions) {
      const convSummary = this.summarizeConventions(context.conventions);
      if (convSummary.length > 0) {
        lines.push('## Repository Conventions');
        lines.push(...convSummary);
        lines.push('');
      }
    }

    if (context.architecture) {
      const { frameworks, patterns, structure } = context.architecture;
      if (frameworks.length > 0 || patterns.length > 0 || structure.length > 0) {
        lines.push('## Architecture');
        if (frameworks.length > 0) lines.push(`Frameworks: ${frameworks.join(', ')}`);
        if (patterns.length > 0) lines.push(`Patterns: ${patterns.join(', ')}`);
        if (structure.length > 0) lines.push(`Structure: ${structure.slice(0, 5).join(', ')}`);
        lines.push('');
      }
    }

    if (focus) {
      lines.push(`Review focus: **${focus}**`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private getFocusChecklist(focus?: ReviewFocus): string[] {
    const checklists: Record<ReviewFocus, string[]> = {
      security: [
        'Check for: SQL/command/path injection vulnerabilities',
        'Check for: authentication and authorisation bypass',
        'Check for: secret or credential exposure in code or logs',
        'Check for: insecure deserialization and prototype pollution',
        'Check for: SSRF and open-redirect risks',
        'Check for: missing input validation at trust boundaries',
      ],
      performance: [
        'Check for: N+1 queries or repeated DB calls in loops',
        'Check for: synchronous I/O in async hot paths',
        'Check for: unbounded loops or quadratic complexity',
        'Check for: memory leaks (event listeners, closures, caches without eviction)',
        'Check for: missing caching for expensive computed values',
        'Check for: unnecessary re-renders or redundant work',
      ],
      architecture: [
        'Evaluate module boundary violations (layer leakage)',
        'Evaluate separation of concerns — is logic in the right layer?',
        'Evaluate dependency direction — no circular or upward imports',
        'Evaluate cohesion — does each module have a single clear responsibility?',
        'Evaluate coupling — are components unnecessarily tied to implementation details?',
      ],
      bug: [
        'Check for: off-by-one errors and boundary conditions',
        'Check for: missing null/undefined guards',
        'Check for: incorrect boolean logic or operator precedence',
        'Check for: unhandled promise rejections or missing await',
        'Check for: race conditions in async code',
        'Check for: error paths that silently swallow failures',
      ],
      refactor: [
        'Identify duplication that should be extracted',
        'Identify overly complex conditionals that can be simplified',
        'Identify names that do not reflect current intent',
        'Identify abstraction opportunities (DRY, SOLID)',
        'Identify dead code or redundant state',
      ],
    };
    return focus ? checklists[focus] : [];
  }

  private buildAIPrompt(context: ReviewContext, focus?: ReviewFocus): string {
    const parts: string[] = [];

    // SYSTEM section: role + conventions + architecture
    parts.push('<system>');
    parts.push(this.buildSystemSection(context, focus).trim());
    parts.push('</system>');
    parts.push('');

    // CONTEXT section: diffs + related files + history
    parts.push('<context>');
    parts.push('');

    if (context.changes.length > 0) {
      parts.push('## Changed Files\n');
      for (const change of context.changes) {
        parts.push(`### ${change.path} (${change.status}, +${change.additions}, -${change.deletions})`);
        if (change.diff) {
          parts.push('```diff');
          parts.push(change.diff.trim());
          parts.push('```');
        }
        parts.push('');
      }
    }

    if (context.relatedFiles.length > 0) {
      parts.push('## Related Files\n');
      for (const file of context.relatedFiles) {
        parts.push(`### ${file.path}`);
        parts.push(`_${file.reason}_\n`);
        if (file.snippet) {
          const ext = file.path.split('.').pop() ?? '';
          parts.push(`\`\`\`${ext}`);
          parts.push(file.snippet.trim());
          parts.push('```');
        }
        parts.push('');
      }
    }

    if (context.history.length > 0) {
      parts.push('## Recent History\n');
      for (const commit of context.history.slice(0, 5)) {
        parts.push(`- ${commit.hash.slice(0, 7)} ${commit.message} (${commit.author})`);
      }
      parts.push('');
    }

    parts.push('</context>');
    parts.push('');

    // TASK section: what to review + output format instructions
    parts.push('<task>');
    parts.push('');
    parts.push(this.getTaskDescription(focus));
    parts.push('');

    const checklist = this.getFocusChecklist(focus);
    if (checklist.length > 0) {
      parts.push('**Checklist:**');
      for (const item of checklist) {
        parts.push(`- [ ] ${item}`);
      }
      parts.push('');
    }

    parts.push('**Output format:** Respond as a numbered list. For each issue found:');
    parts.push('1. Location: file path and line number (if known)');
    parts.push('2. Severity: P0 (critical/data-loss), P1 (bug/security), P2 (warning/smell)');
    parts.push('3. Explanation: what the problem is and why it matters');
    parts.push('4. Suggested fix: concrete code or approach');
    parts.push('');
    parts.push('If no issues are found, say so explicitly.');
    parts.push('');
    parts.push('</task>');

    return parts.join('\n');
  }

  private summarizeConventions(conventions: ConventionInfo): string[] {
    const summary: string[] = [];

    if (conventions.typescript) {
      const ts = conventions.typescript as Record<string, unknown>;
      summary.push('**TypeScript**');
      if (ts.isStrict != null) summary.push(`- strict: ${ts.isStrict}`);
      if (ts.target) summary.push(`- target: ${ts.target}`);
      if (ts.module) summary.push(`- module: ${ts.module}`);
      if (ts.moduleResolution) summary.push(`- moduleResolution: ${ts.moduleResolution}`);
      if (ts.jsx) summary.push(`- jsx: ${ts.jsx}`);
      summary.push('');
    }

    if (conventions.eslint) {
      const eslint = conventions.eslint as Record<string, unknown>;
      summary.push('**ESLint**');
      const extendsArr = eslint.extends as string[] | undefined;
      if (Array.isArray(extendsArr) && extendsArr.length > 0) {
        summary.push(`- extends: ${extendsArr.join(', ')}`);
      }
      const rules = eslint.rules as Record<string, unknown> | undefined;
      if (rules && typeof rules === 'object') {
        const ruleEntries = Object.entries(rules).slice(0, 8);
        for (const [name, value] of ruleEntries) {
          const display = Array.isArray(value) ? String(value[0]) : String(value);
          summary.push(`- ${name}: ${display}`);
        }
      }
      if (eslint.hasTypeScriptSupport) summary.push('- TypeScript support: yes');
      if (eslint.hasReactSupport) summary.push('- React support: yes');
      summary.push('');
    }

    if (conventions.prettier) {
      const p = conventions.prettier as Record<string, unknown>;
      summary.push('**Prettier**');
      if (p.singleQuote != null) summary.push(`- singleQuote: ${p.singleQuote}`);
      if (p.tabWidth != null) summary.push(`- tabWidth: ${p.tabWidth}`);
      if (p.trailingComma != null) summary.push(`- trailingComma: ${p.trailingComma}`);
      if (p.hasSemi != null) summary.push(`- semi: ${p.hasSemi}`);
      if (p.printWidth != null) summary.push(`- printWidth: ${p.printWidth}`);
      summary.push('');
    }

    if (conventions.testFramework) {
      const tf = conventions.testFramework as Record<string, unknown>;
      summary.push('**Test Framework**');
      if (tf.framework) summary.push(`- framework: ${tf.framework}`);
      if (tf.hasCoverage != null) summary.push(`- coverage: ${tf.hasCoverage}`);
      if (tf.e2eFramework) summary.push(`- e2e: ${tf.e2eFramework}`);
      summary.push('');
    }

    if (conventions.editorConfig) {
      const ec = conventions.editorConfig as Record<string, unknown>;
      summary.push('**EditorConfig**');
      const global = ec.globalRules as Record<string, unknown> | undefined;
      if (global) {
        if (global.indentStyle) summary.push(`- indent_style: ${global.indentStyle}`);
        if (global.indentSize != null) summary.push(`- indent_size: ${global.indentSize}`);
        if (global.endOfLine) summary.push(`- end_of_line: ${global.endOfLine}`);
      }
      summary.push('');
    }

    if (conventions.ci) {
      const ci = conventions.ci as Record<string, unknown>;
      summary.push('**CI**');
      if (ci.provider) summary.push(`- provider: ${ci.provider}`);
      const workflows = ci.workflows as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(workflows) && workflows.length > 0) {
        for (const wf of workflows.slice(0, 3)) {
          const name = wf.name as string | undefined;
          const nodeVer = wf.nodeVersion as string | undefined;
          if (name) summary.push(`- workflow: ${name}${nodeVer ? ` (Node ${nodeVer})` : ''}`);
        }
      }
      summary.push('');
    }

    // Remove trailing empty string
    while (summary.length > 0 && summary[summary.length - 1] === '') {
      summary.pop();
    }

    return summary;
  }

  private truncateToTokenBudget(content: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    return truncateContent(content, maxChars);
  }
}
