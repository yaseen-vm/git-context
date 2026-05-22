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
import { parseTestFrameworkConfig, summarizeTestFrameworkConfig } from './test-framework-parser.js';
import type {
  EditorConfig,
  ESLintConfig,
  PrettierConfig,
  TypeScriptConfig,
  PackageJsonConfig,
  CIConfig,
  TestFrameworkConfig,
  ConventionSummary,
  ConventionEngineResult,
} from './types.js';

export class ConventionEngine {
  private repoPath: string;
  private cachedEditorConfig: EditorConfig | null | undefined;
  private cachedESLintConfig: ESLintConfig | null | undefined;
  private cachedPrettierConfig: PrettierConfig | null | undefined;
  private cachedTypeScriptConfig: TypeScriptConfig | null | undefined;
  private cachedPackageJsonConfig: PackageJsonConfig | null | undefined;
  private cachedCIConfig: CIConfig | null | undefined;
  private cachedTestFrameworkConfig: TestFrameworkConfig | null | undefined;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  invalidateCache(): void {
    this.cachedEditorConfig = undefined;
    this.cachedESLintConfig = undefined;
    this.cachedPrettierConfig = undefined;
    this.cachedTypeScriptConfig = undefined;
    this.cachedPackageJsonConfig = undefined;
    this.cachedCIConfig = undefined;
    this.cachedTestFrameworkConfig = undefined;
  }

  analyze(): ConventionEngineResult {
    const editorConfig = this.getEditorConfig();
    const eslintConfig = this.getESLintConfig();
    const prettierConfig = this.getPrettierConfig();
    const typeScriptConfig = this.getTypeScriptConfig();
    const packageJsonConfig = this.getPackageJsonConfig();
    const ciConfig = this.getCIConfig();
    const testFrameworkConfig = this.getTestFrameworkConfig();

    const summaries: ConventionSummary[] = [
      { source: '.editorconfig', category: 'formatting', conventions: summarizeEditorConfig(editorConfig) },
      { source: 'ESLint', category: 'lint', conventions: summarizeESLintConfig(eslintConfig) },
      { source: 'Prettier', category: 'formatting', conventions: summarizePrettierConfig(prettierConfig) },
      { source: 'TypeScript', category: 'typescript', conventions: summarizeTypeScriptConfig(typeScriptConfig) },
      { source: 'package.json', category: 'package', conventions: summarizePackageJsonConfig(packageJsonConfig) },
      { source: 'CI', category: 'ci', conventions: summarizeCIConfig(ciConfig) },
      { source: 'Test Framework', category: 'test', conventions: summarizeTestFrameworkConfig(testFrameworkConfig) },
    ];

    return {
      editorConfig,
      lintFormat: { eslint: eslintConfig, prettier: prettierConfig },
      typeScript: typeScriptConfig,
      packageJson: packageJsonConfig,
      ci: ciConfig,
      testFramework: testFrameworkConfig,
      summaries,
    };
  }

  getEditorConfig(): EditorConfig | null {
    if (this.cachedEditorConfig === undefined) {
      this.cachedEditorConfig = parseEditorConfig(this.repoPath);
    }
    return this.cachedEditorConfig;
  }

  getFormattingConventions(): string[] {
    const editorConfig = this.getEditorConfig();
    return summarizeEditorConfig(editorConfig);
  }

  getESLintConfig(): ESLintConfig | null {
    if (this.cachedESLintConfig === undefined) {
      this.cachedESLintConfig = parseESLintConfig(this.repoPath);
    }
    return this.cachedESLintConfig;
  }

  getPrettierConfig(): PrettierConfig | null {
    if (this.cachedPrettierConfig === undefined) {
      this.cachedPrettierConfig = parsePrettierConfig(this.repoPath);
    }
    return this.cachedPrettierConfig;
  }

  getLintConventions(): string[] {
    const eslintConfig = this.getESLintConfig();
    return summarizeESLintConfig(eslintConfig);
  }

  getFormatConventions(): string[] {
    const prettierConfig = this.getPrettierConfig();
    return summarizePrettierConfig(prettierConfig);
  }

  getTypeScriptConfig(): TypeScriptConfig | null {
    if (this.cachedTypeScriptConfig === undefined) {
      this.cachedTypeScriptConfig = parseTypeScriptConfig(this.repoPath);
    }
    return this.cachedTypeScriptConfig;
  }

  getTypeScriptConventions(): string[] {
    const typeScriptConfig = this.getTypeScriptConfig();
    return summarizeTypeScriptConfig(typeScriptConfig);
  }

  getPackageJsonConfig(): PackageJsonConfig | null {
    if (this.cachedPackageJsonConfig === undefined) {
      this.cachedPackageJsonConfig = parsePackageJson(this.repoPath);
    }
    return this.cachedPackageJsonConfig;
  }

  getPackageConventions(): string[] {
    const packageJsonConfig = this.getPackageJsonConfig();
    return summarizePackageJsonConfig(packageJsonConfig);
  }

  getCIConfig(): CIConfig | null {
    if (this.cachedCIConfig === undefined) {
      this.cachedCIConfig = parseCIConfig(this.repoPath);
    }
    return this.cachedCIConfig;
  }

  getCIConventions(): string[] {
    const ciConfig = this.getCIConfig();
    return summarizeCIConfig(ciConfig);
  }

  getTestFrameworkConfig(): TestFrameworkConfig | null {
    if (this.cachedTestFrameworkConfig === undefined) {
      this.cachedTestFrameworkConfig = parseTestFrameworkConfig(this.repoPath);
    }
    return this.cachedTestFrameworkConfig;
  }

  getTestConventions(): string[] {
    const testFrameworkConfig = this.getTestFrameworkConfig();
    return summarizeTestFrameworkConfig(testFrameworkConfig);
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
export { parseTestFrameworkConfig, summarizeTestFrameworkConfig } from './test-framework-parser.js';
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
  TestFrameworkConfig,
  ConventionSummary,
  ConventionEngineResult,
} from './types.js';
