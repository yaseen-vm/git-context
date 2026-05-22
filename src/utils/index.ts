import path from 'path';

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

export interface ReviewContext {
  changes: FileChange[];
  relatedFiles: string[];
  history: CommitInfo[];
  conventions: ConventionInfo;
  architecture: ArchitectureInfo;
}

export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export interface ConventionInfo {
  editorConfig?: Record<string, unknown>;
  eslint?: Record<string, unknown>;
  prettier?: Record<string, unknown>;
  typescript?: Record<string, unknown>;
  packageJson?: Record<string, unknown>;
  ci?: Record<string, unknown>;
  testFramework?: Record<string, unknown>;
}

export interface ArchitectureInfo {
  structure: string[];
  frameworks: string[];
  patterns: string[];
}

export const SUPPORTED_FORMATS = ['markdown', 'json', 'prompt'] as const;
export type OutputFormat = (typeof SUPPORTED_FORMATS)[number];

export const REVIEW_FOCUSES = [
  'security',
  'performance',
  'architecture',
  'bug',
  'refactor',
] as const;
export type ReviewFocus = (typeof REVIEW_FOCUSES)[number];

export const SECRET_PATTERNS = [
  /\.env$/,
  /\.env\.\w+$/,
  /\.pem$/,
  /\.key$/,
  /credentials\.json$/,
  /secrets\.json$/,
] as const;

export const GENERATED_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /build/,
  /coverage/,
  /\.next/,
  /\.nuxt/,
] as const;

export const LOCK_FILE_PATTERNS = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /composer\.lock$/,
  /Gemfile\.lock$/,
  /poetry\.lock$/,
] as const;

export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to).replace(/\\/g, '/');
}

export function isSecretFile(filePath: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function isGeneratedFile(filePath: string): boolean {
  return GENERATED_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function isLockFile(filePath: string): boolean {
  return LOCK_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function shouldExcludeFile(filePath: string): boolean {
  return isSecretFile(filePath) || isGeneratedFile(filePath) || isLockFile(filePath);
}

export function truncateContent(content: string, maxLength: number = 50000): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + '\n... [truncated]';
}

export function formatTokenCount(count: number): string {
  if (count < 1000) return `${count} tokens`;
  return `${(count / 1000).toFixed(1)}k tokens`;
}
