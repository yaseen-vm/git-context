import fs from 'fs';
import path from 'path';
import ignore, { type Ignore } from 'ignore';
import { shouldExcludeFile, isSecretFile } from '../utils/index.js';

export interface SecretFilterOptions {
  respectGitignore?: boolean;
  excludePatterns?: string[];
  repoRoot?: string;
}

export interface FilterResult {
  allowed: string[];
  excluded: string[];
  secrets: string[];
}

export class SecretFilter {
  private options: SecretFilterOptions;
  private ignoreFilter: Ignore | null = null;

  constructor(options: SecretFilterOptions = {}) {
    this.options = {
      respectGitignore: true,
      ...options,
    };

    if (this.options.respectGitignore && this.options.repoRoot) {
      this.ignoreFilter = this.loadIgnoreRules(this.options.repoRoot);
    }
  }

  private loadIgnoreRules(repoRoot: string): Ignore {
    const ig = ignore();
    const ignoreFiles = ['.gitignore', '.ignore'];

    for (const ignoreFile of ignoreFiles) {
      const filePath = path.join(repoRoot, ignoreFile);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        ig.add(content);
      }
    }

    this.loadNestedGitignores(repoRoot, repoRoot, ig);

    return ig;
  }

  private loadNestedGitignores(repoRoot: string, dir: string, ig: Ignore): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const fullPath = path.join(dir, entry);

      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        const nestedGitignore = path.join(fullPath, '.gitignore');
        if (fs.existsSync(nestedGitignore)) {
          const content = fs.readFileSync(nestedGitignore, 'utf-8');
          const relDir = path.relative(repoRoot, fullPath).replace(/\\/g, '/');
          const prefixedRules = content
            .split('\n')
            .filter((line) => line.trim() && !line.startsWith('#'))
            .map((line) => {
              const trimmed = line.trim();
              return trimmed.startsWith('/')
                ? `${relDir}${trimmed}`
                : `${relDir}/${trimmed}`;
            })
            .join('\n');
          if (prefixedRules) ig.add(prefixedRules);
        }
        this.loadNestedGitignores(repoRoot, fullPath, ig);
      }
    }
  }

  filterFiles(files: string[]): FilterResult {
    const allowed: string[] = [];
    const excluded: string[] = [];
    const secrets: string[] = [];

    for (const file of files) {
      if (isSecretFile(file)) {
        secrets.push(file);
      } else if (shouldExcludeFile(file)) {
        excluded.push(file);
      } else if (this.matchesExcludePatterns(file)) {
        excluded.push(file);
      } else if (this.isIgnoredByGitignore(file)) {
        excluded.push(file);
      } else {
        allowed.push(file);
      }
    }

    return { allowed, excluded, secrets };
  }

  isIgnoredByGitignore(filePath: string): boolean {
    if (!this.ignoreFilter) return false;
    const normalized = filePath.replace(/\\/g, '/');
    return this.ignoreFilter.ignores(normalized);
  }

  filterContent(content: string): string {
    let filtered = content;

    filtered = this.redactApiKeys(filtered);
    filtered = this.redactTokens(filtered);
    filtered = this.redactPasswords(filtered);
    filtered = this.redactPrivateKeys(filtered);

    return filtered;
  }

  private matchesExcludePatterns(filePath: string): boolean {
    if (!this.options.excludePatterns) return false;

    return this.options.excludePatterns.some((pattern) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filePath);
    });
  }

  private redactApiKeys(content: string): string {
    const patterns = [
      /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
      /(?:secret[_-]?key|secretkey)\s*[:=]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
      /(?:access[_-]?key|accesskey)\s*[:=]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
    ];

    let result = content;
    for (const pattern of patterns) {
      result = result.replace(pattern, (match) => {
        return match.replace(/['"]?([a-zA-Z0-9_-]{20,})['"]?/, '[REDACTED_API_KEY]');
      });
    }

    return result;
  }

  private redactTokens(content: string): string {
    const patterns = [
      /(?:token|bearer)\s*[:=]\s*['"]?([a-zA-Z0-9_.-]{20,})['"]?/gi,
      /(?:jwt|jwt[_-]?token)\s*[:=]\s*['"]?([a-zA-Z0-9_.-]{20,})['"]?/gi,
      /ghp_[a-zA-Z0-9]{36}/g,
      /gho_[a-zA-Z0-9]{36}/g,
      /github_pat_[a-zA-Z0-9_]{22,}/g,
    ];

    let result = content;
    for (const pattern of patterns) {
      result = result.replace(pattern, '[REDACTED_TOKEN]');
    }

    return result;
  }

  private redactPasswords(content: string): string {
    const patterns = [
      /((?:password|passwd|pwd)\s*[:=]\s*)(['"]?)([^\s'"]{8,})\2/gi,
      /((?:db[_-]?password|database[_-]?password)\s*[:=]\s*)(['"]?)([^\s'"]{8,})\2/gi,
    ];

    let result = content;
    for (const pattern of patterns) {
      result = result.replace(pattern, '$1[REDACTED_PASSWORD]');
    }

    return result;
  }

  private redactPrivateKeys(content: string): string {
    const patterns = [
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    ];

    let result = content;
    for (const pattern of patterns) {
      result = result.replace(pattern, '[REDACTED_PRIVATE_KEY]');
    }

    return result;
  }

  isBinaryContent(content: string): boolean {
    const nullBytes = content.match(/\0/g);
    return nullBytes ? nullBytes.length > 0 : false;
  }
}
