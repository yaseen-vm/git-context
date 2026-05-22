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
  TestFrameworkConfig,
  ConventionSummary,
  ConventionEngineResult,
} from './convention-engine/index.js';

export {
  normalizeFilePath,
  getRelativePath,
  isSecretFile,
  isGeneratedFile,
  isVendorFile,
  isLockFile,
  isBinaryFile,
  shouldExcludeFile,
  truncateContent,
  formatTokenCount,
  SUPPORTED_FORMATS,
  REVIEW_FOCUSES,
  SECRET_PATTERNS,
  GENERATED_PATTERNS,
  VENDOR_PATTERNS,
  LOCK_FILE_PATTERNS,
  BINARY_EXTENSIONS,
} from './utils/index.js';
export type {
  FileChange,
  ReviewContext,
  CommitInfo,
  ConventionInfo,
  ArchitectureInfo,
  OutputFormat,
  ReviewFocus,
} from './utils/index.js';

export { PromptBuilder } from './prompt-builder/index.js';
export type { PromptBuilderOptions, PromptResult, PromptTemplate } from './prompt-builder/index.js';

export { SecretFilter } from './secret-filter/index.js';
export type { SecretFilterOptions, FilterResult } from './secret-filter/index.js';

export { MonorepoDetector } from './monorepo/index.js';
export type { MonorepoInfo, MonorepoTool, WorkspacePackage } from './monorepo/index.js';
