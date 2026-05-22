import { parseEditorConfig, summarizeEditorConfig } from './editorconfig-parser.js';
import {
  parseESLintConfig,
  parsePrettierConfig,
  summarizeESLintConfig,
  summarizePrettierConfig,
} from './eslint-prettier-parser.js';
import { parseTypeScriptConfig, summarizeTypeScriptConfig } from './typescript-config-parser.js';
import { parsePackageJson, summarizePackageJsonConfig } from './package-json-parser.js';
import { parseCIConfig, summarizeCIConfig } from './ci-config-parser.js';
import type {
  EditorConfig,
  EditorConfigRule,
  EditorConfigSection,
  ESLintConfig,
  PrettierConfig,
  LintFormatConfig,
  TypeScriptConfig,
  PackageJsonConfig,
  CIConfig,
  CIWorkflow,
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
    const packageJsonConfig = parsePackageJson(this.repoPath);
    const ciConfig = parseCIConfig(this.repoPath);
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

    const packageJsonConventions = summarizePackageJsonConfig(packageJsonConfig);
    summaries.push({
      source: 'package.json',
      category: 'package',
      conventions: packageJsonConventions,
    });

    const ciConventions = summarizeCIConfig(ciConfig);
    summaries.push({
      source: 'CI',
      category: 'ci',
      conventions: ciConventions,
    });

    return {
      editorConfig,
      lintFormat: {
        eslint: eslintConfig,
        prettier: prettierConfig,
      },
      typeScript: typeScriptConfig,
      packageJson: packageJsonConfig,
      ci: ciConfig,
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

  getPackageJsonConfig(): PackageJsonConfig | null {
    return parsePackageJson(this.repoPath);
  }

  getPackageConventions(): string[] {
    const packageJsonConfig = parsePackageJson(this.repoPath);
    return summarizePackageJsonConfig(packageJsonConfig);
  }

  getCIConfig(): CIConfig | null {
    return parseCIConfig(this.repoPath);
  }

  getCIConventions(): string[] {
    const ciConfig = parseCIConfig(this.repoPath);
    return summarizeCIConfig(ciConfig);
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
export { parsePackageJson, summarizePackageJsonConfig } from './package-json-parser.js';
export { parseCIConfig, summarizeCIConfig } from './ci-config-parser.js';
export type {
  EditorConfig,
  EditorConfigRule,
  EditorConfigSection,
  ESLintConfig,
  PrettierConfig,
  LintFormatConfig,
  TypeScriptConfig,
  PackageJsonConfig,
  CIConfig,
  CIWorkflow,
  ConventionSummary,
  ConventionEngineResult,
} from './types.js';
