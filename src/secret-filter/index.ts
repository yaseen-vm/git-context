import { shouldExcludeFile, isSecretFile } from '../utils/index.js';

export interface SecretFilterOptions {
  respectGitignore?: boolean;
  excludePatterns?: string[];
}

export interface FilterResult {
  allowed: string[];
  excluded: string[];
  secrets: string[];
}

export class SecretFilter {
  private options: SecretFilterOptions;

  constructor(options: SecretFilterOptions = {}) {
    this.options = {
      respectGitignore: true,
      ...options,
    };
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
      } else {
        allowed.push(file);
      }
    }

    return { allowed, excluded, secrets };
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
      /(?:password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi,
      /(?:db[_-]?password|database[_-]?password)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi,
    ];

    let result = content;
    for (const pattern of patterns) {
      result = result.replace(pattern, (match) => {
        return match.replace(/['"]?([^\s'"]{8,})['"]?/, '[REDACTED_PASSWORD]');
      });
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
