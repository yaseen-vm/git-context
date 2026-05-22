import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ExecCommandOptions {
  timeout?: number;
  cwd?: string;
}

export interface ExecCommandResult {
  stdout: string;
  stderr: string;
}

export async function execCommand(
  command: string,
  options: ExecCommandOptions = {},
): Promise<ExecCommandResult> {
  const { timeout = 30000, cwd } = options;

  const sanitizedCommand = sanitizeCommand(command);

  return execAsync(sanitizedCommand, {
    timeout,
    cwd,
    maxBuffer: 1024 * 1024 * 10,
  });
}

function sanitizeCommand(command: string): string {
  const parts = command.split(' ');
  const sanitized = parts.map((part) => {
    if (/^[a-zA-Z0-9._\-/@:]+$/.test(part)) {
      return part;
    }
    return `"${part.replace(/"/g, '\\"')}"`;
  });
  return sanitized.join(' ');
}

export function validatePrNumber(prNumber: number): void {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error(`Invalid PR number: ${prNumber}. Must be a positive integer.`);
  }
}

export function validateRepoName(name: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid repository name: ${name}. Contains invalid characters.`);
  }
}

export function validateOwnerName(name: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid owner name: ${name}. Contains invalid characters.`);
  }
}

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
  /\.git\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
  /\.next\//,
  /\.nuxt\//,
  /(^|\/)out\//,
  /(^|\/)\.cache\//,
  /(^|\/)__pycache__\//,
  /\.pyc$/,
  /\.class$/,
] as const;

export const VENDOR_PATTERNS = [
  /(^|\/)vendor\//,
  /(^|\/)third_party\//,
  /(^|\/)extern\//,
] as const;

export const LOCK_FILE_PATTERNS = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /composer\.lock$/,
  /Gemfile\.lock$/,
  /poetry\.lock$/,
  /cargo\.lock$/i,
  /pipfile\.lock$/i,
] as const;

export const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.tiff', '.tif', '.avif', '.heic',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv',
  '.mp3', '.wav', '.ogg', '.flac', '.aac',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.lib', '.a',
  '.wasm', '.bin', '.dat', '.db', '.sqlite', '.sqlite3',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.jar', '.war', '.ear', '.class',
  '.pyc', '.pyo', '.pyd',
]);

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

export function isVendorFile(filePath: string): boolean {
  return VENDOR_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function isLockFile(filePath: string): boolean {
  return LOCK_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function shouldExcludeFile(filePath: string): boolean {
  return (
    isSecretFile(filePath) ||
    isGeneratedFile(filePath) ||
    isVendorFile(filePath) ||
    isLockFile(filePath) ||
    isBinaryFile(filePath)
  );
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

export function findConfigFile(repoPath: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(repoPath, candidate))) {
      return candidate;
    }
  }
  return null;
}

export function readJsonFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON file ${filePath}: ${message}`, { cause: error });
  }
}
