export interface EditorConfigRule {
  indentStyle: 'tab' | 'space' | null;
  indentSize: number | null;
  charset: string | null;
  endOfLine: 'lf' | 'crlf' | 'cr' | null;
  insertFinalNewline: boolean | null;
  trimTrailingWhitespace: boolean | null;
}

export interface EditorConfigSection {
  pattern: string;
  rules: EditorConfigRule;
}

export interface EditorConfig {
  root: boolean;
  globalRules: EditorConfigRule;
  sections: EditorConfigSection[];
}

export interface ESLintConfig {
  configFile: string | null;
  extends: string[];
  plugins: string[];
  rules: Record<string, unknown>;
  hasTypeScriptSupport: boolean;
  hasReactSupport: boolean;
  hasPrettierIntegration: boolean;
}

export interface PrettierConfig {
  configFile: string | null;
  options: Record<string, unknown>;
  hasSemi: boolean | null;
  singleQuote: boolean | null;
  tabWidth: number | null;
  trailingComma: string | null;
  printWidth: number | null;
}

export interface LintFormatConfig {
  eslint: ESLintConfig | null;
  prettier: PrettierConfig | null;
}

export interface TypeScriptConfig {
  configFile: string | null;
  isStrict: boolean;
  target: string | null;
  module: string | null;
  moduleResolution: string | null;
  paths: Record<string, string[]>;
  baseUrl: string | null;
  jsx: string | null;
  esModuleInterop: boolean | null;
  skipLibCheck: boolean | null;
  forceConsistentCasingInFileNames: boolean | null;
  declaration: boolean | null;
  declarationMap: boolean | null;
  sourceMap: boolean | null;
  lib: string[];
  include: string[];
  exclude: string[];
}

export interface PackageJsonConfig {
  name: string | null;
  version: string | null;
  type: string | null;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  hasBuildScript: boolean;
  hasTestScript: boolean;
  hasLintScript: boolean;
  hasFormatScript: boolean;
  hasTypecheckScript: boolean;
  detectedFramework: string | null;
  detectedBuildTool: string | null;
  detectedTestFramework: string | null;
}

export interface CIWorkflow {
  name: string;
  filePath: string;
  provider: 'github' | 'gitlab';
  triggers: string[];
  jobs: string[];
  steps: string[];
  hasTestStep: boolean;
  hasLintStep: boolean;
  hasBuildStep: boolean;
  hasDeployStep: boolean;
  nodeVersion: string | null;
}

export interface CIConfig {
  provider: 'github' | 'gitlab' | null;
  workflows: CIWorkflow[];
  hasGitHubActions: boolean;
  hasGitLabCI: boolean;
}

export interface TestFrameworkConfig {
  framework: string | null;
  configFile: string | null;
  configFiles: string[];
  hasCoverage: boolean;
  coverageProvider: string | null;
  testPattern: string | null;
  testPathPattern: string | null;
  setupFiles: string[];
  hasTypeScriptSupport: boolean;
  hasReactTestingLibrary: boolean;
  hasE2E: boolean;
  e2eFramework: string | null;
}

export interface ConventionSummary {
  source: string;
  category: 'formatting' | 'lint' | 'typescript' | 'package' | 'ci' | 'test';
  conventions: string[];
}

export interface ConventionEngineResult {
  editorConfig: EditorConfig | null;
  lintFormat: LintFormatConfig;
  typeScript: TypeScriptConfig | null;
  packageJson: PackageJsonConfig | null;
  ci: CIConfig | null;
  testFramework: TestFrameworkConfig | null;
  summaries: ConventionSummary[];
}
