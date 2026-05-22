export const VERSION = '0.1.0';

export { GitEngine, PRAnalyzer } from './git-engine/index.js';
export type { GitDiff, DiffFile, GitCommit, PRInfo } from './git-engine/index.js';

export { ConventionEngine } from './convention-engine/index.js';
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
} from './convention-engine/index.js';
