import { parseEditorConfig, summarizeEditorConfig } from './editorconfig-parser.js';
import {
  parseESLintConfig,
  parsePrettierConfig,
  summarizeESLintConfig,
  summarizePrettierConfig,
} from './eslint-prettier-parser.js';
import { parseTypeScriptConfig, summarizeTypeScriptConfig } from './typescript-config-parser.js';
import type {
  EditorConfig,
  EditorConfigRule,
  EditorConfigSection,
  ESLintConfig,
  PrettierConfig,
  LintFormatConfig,
  TypeScriptConfig,
  ConventionSummary,
  ConventionEngineResult,
} from './types.js';

export class ConventionEngine {
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  analyze(): ConventionEngineResult {
    const editorConfig = parseEditorConfig(this.repoPath);
    const eslintConfig = parseESLintConfig(this.repoPath);
    const prettierConfig = parsePrettierConfig(this.repoPath);
    const typeScriptConfig = parseTypeScriptConfig(this.repoPath);
    const summaries: ConventionSummary[] = [];

    const editorConfigConventions = summarizeEditorConfig(editorConfig);
    summaries.push({
      source: '.editorconfig',
      category: 'formatting',
      conventions: editorConfigConventions,
    });

    const eslintConventions = summarizeESLintConfig(eslintConfig);
    summaries.push({
      source: 'ESLint',
      category: 'lint',
      conventions: eslintConventions,
    });

    const prettierConventions = summarizePrettierConfig(prettierConfig);
    summaries.push({
      source: 'Prettier',
      category: 'formatting',
      conventions: prettierConventions,
    });

    const typeScriptConventions = summarizeTypeScriptConfig(typeScriptConfig);
    summaries.push({
      source: 'TypeScript',
      category: 'typescript',
      conventions: typeScriptConventions,
    });

    return {
      editorConfig,
      lintFormat: {
        eslint: eslintConfig,
        prettier: prettierConfig,
      },
      typeScript: typeScriptConfig,
      summaries,
    };
  }

  getEditorConfig(): EditorConfig | null {
    return parseEditorConfig(this.repoPath);
  }

  getFormattingConventions(): string[] {
    const editorConfig = parseEditorConfig(this.repoPath);
    return summarizeEditorConfig(editorConfig);
  }

  getESLintConfig(): ESLintConfig | null {
    return parseESLintConfig(this.repoPath);
  }

  getPrettierConfig(): PrettierConfig | null {
    return parsePrettierConfig(this.repoPath);
  }

  getLintConventions(): string[] {
    const eslintConfig = parseESLintConfig(this.repoPath);
    return summarizeESLintConfig(eslintConfig);
  }

  getFormatConventions(): string[] {
    const prettierConfig = parsePrettierConfig(this.repoPath);
    return summarizePrettierConfig(prettierConfig);
  }

  getTypeScriptConfig(): TypeScriptConfig | null {
    return parseTypeScriptConfig(this.repoPath);
  }

  getTypeScriptConventions(): string[] {
    const typeScriptConfig = parseTypeScriptConfig(this.repoPath);
    return summarizeTypeScriptConfig(typeScriptConfig);
  }
}

export { parseEditorConfig, summarizeEditorConfig } from './editorconfig-parser.js';
export {
  parseESLintConfig,
  parsePrettierConfig,
  summarizeESLintConfig,
  summarizePrettierConfig,
} from './eslint-prettier-parser.js';
export { parseTypeScriptConfig, summarizeTypeScriptConfig } from './typescript-config-parser.js';
export type {
  EditorConfig,
  EditorConfigRule,
  EditorConfigSection,
  ESLintConfig,
  PrettierConfig,
  LintFormatConfig,
  TypeScriptConfig,
  ConventionSummary,
  ConventionEngineResult,
} from './types.js';
