import {
  OutputFormat,
  ReviewFocus,
  ReviewContext,
  ConventionInfo,
  truncateContent,
} from '../utils/index.js';

export interface PromptBuilderOptions {
  format: OutputFormat;
  focus?: ReviewFocus;
  maxTokens?: number;
}

export interface PromptResult {
  content: string;
  format: OutputFormat;
  tokenEstimate: number;
}

export class PromptBuilder {
  private options: PromptBuilderOptions;

  constructor(options: PromptBuilderOptions) {
    this.options = options;
  }

  async buildPrompt(context: ReviewContext): Promise<PromptResult> {
    const { format, focus, maxTokens } = this.options;

    let content: string;

    switch (format) {
      case 'json':
        content = this.buildJsonPrompt(context, focus);
        break;
      case 'prompt':
        content = this.buildAIPrompt(context, focus);
        break;
      case 'markdown':
      default:
        content = this.buildMarkdownPrompt(context, focus);
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

  private buildMarkdownPrompt(context: ReviewContext, focus?: ReviewFocus): string {
    const sections: string[] = [];

    sections.push('# Code Review Context\n');

    if (focus) {
      sections.push(`**Review Focus:** ${focus}\n`);
    }

    if (context.changes.length > 0) {
      sections.push('## Changed Files\n');
      for (const change of context.changes) {
        sections.push(
          `- ${change.path} (${change.status}, +${change.additions}, -${change.deletions})`,
        );
      }
      sections.push('');
    }

    if (context.relatedFiles.length > 0) {
      sections.push('## Related Files\n');
      for (const file of context.relatedFiles) {
        sections.push(`- ${file}`);
      }
      sections.push('');
    }

    if (context.history.length > 0) {
      sections.push('## Recent History\n');
      for (const commit of context.history.slice(0, 10)) {
        sections.push(`- ${commit.hash.slice(0, 7)} ${commit.message} (${commit.author})`);
      }
      sections.push('');
    }

    if (context.conventions) {
      sections.push('## Team Conventions\n');
      const conventions = this.summarizeConventions(context.conventions);
      for (const conv of conventions) {
        sections.push(`- ${conv}`);
      }
      sections.push('');
    }

    if (context.architecture) {
      sections.push('## Architecture Notes\n');
      for (const pattern of context.architecture.patterns) {
        sections.push(`- ${pattern}`);
      }
      sections.push('');
    }

    sections.push('## Task\n');
    sections.push(this.getTaskDescription(focus));

    return sections.join('\n');
  }

  private buildJsonPrompt(context: ReviewContext, focus?: ReviewFocus): string {
    const output = {
      task: 'code-review',
      focus: focus || 'general',
      context: {
        changes: context.changes,
        relatedFiles: context.relatedFiles,
        history: context.history.slice(0, 10),
        conventions: this.summarizeConventions(context.conventions),
        architecture: context.architecture?.patterns || [],
      },
      instructions: this.getTaskDescription(focus),
    };

    return JSON.stringify(output, null, 2);
  }

  private buildAIPrompt(context: ReviewContext, focus?: ReviewFocus): string {
    const parts: string[] = [];

    parts.push(
      'You are an expert code reviewer. Analyze the following code changes and provide feedback.\n',
    );

    if (focus) {
      parts.push(`Focus specifically on: ${focus}\n`);
    }

    parts.push('## Changed Files\n');
    for (const change of context.changes) {
      parts.push(`### ${change.path}`);
      parts.push(`Status: ${change.status} | +${change.additions} -${change.deletions}\n`);
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

    parts.push('## Your Task\n');
    parts.push(this.getTaskDescription(focus));

    return parts.join('\n');
  }

  private getTaskDescription(focus?: ReviewFocus): string {
    switch (focus) {
      case 'security':
        return 'Identify security vulnerabilities, potential exploits, and security best practices violations. Look for injection risks, authentication issues, data exposure, and other security concerns.';
      case 'performance':
        return 'Identify performance bottlenecks, inefficient algorithms, unnecessary computations, memory leaks, and optimization opportunities.';
      case 'architecture':
        return 'Evaluate the architectural design, module boundaries, separation of concerns, dependency management, and overall code organization.';
      case 'bug':
        return 'Identify potential bugs, logic errors, edge cases, error handling issues, and race conditions.';
      case 'refactor':
        return 'Suggest refactoring opportunities to improve code readability, maintainability, and adherence to DRY/SOLID principles.';
      default:
        return 'Provide a comprehensive code review covering correctness, readability, maintainability, and best practices.';
    }
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

    return summary;
  }

  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  private truncateToTokenBudget(content: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    return truncateContent(content, maxChars);
  }
}
