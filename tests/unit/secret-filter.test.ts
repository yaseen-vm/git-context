import { describe, it, expect } from 'vitest';
import { SecretFilter } from '../../src/secret-filter/index.js';
import { isSecretFile, shouldExcludeFile, SECRET_PATTERNS } from '../../src/utils/index.js';

describe('isSecretFile', () => {
  it('detects .env files', () => {
    expect(isSecretFile('.env')).toBe(true);
    expect(isSecretFile('config/.env')).toBe(true);
    expect(isSecretFile('.env.production')).toBe(true);
    expect(isSecretFile('.env.local')).toBe(true);
  });

  it('detects PEM and key files', () => {
    expect(isSecretFile('server.pem')).toBe(true);
    expect(isSecretFile('private.key')).toBe(true);
    expect(isSecretFile('certs/server.pem')).toBe(true);
  });

  it('detects credential/secret JSON files', () => {
    expect(isSecretFile('credentials.json')).toBe(true);
    expect(isSecretFile('secrets.json')).toBe(true);
  });

  it('allows normal source files', () => {
    expect(isSecretFile('src/index.ts')).toBe(false);
    expect(isSecretFile('README.md')).toBe(false);
    expect(isSecretFile('package.json')).toBe(false);
  });
});

describe('SECRET_PATTERNS', () => {
  it('exports patterns as a non-empty array', () => {
    expect(SECRET_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe('SecretFilter.filterFiles', () => {
  it('separates secret files from allowed files', () => {
    const filter = new SecretFilter();
    const result = filter.filterFiles(['.env', 'src/app.ts', 'secrets.json']);
    expect(result.secrets).toContain('.env');
    expect(result.secrets).toContain('secrets.json');
    expect(result.allowed).toContain('src/app.ts');
  });

  it('separates generated/lock files into excluded', () => {
    const filter = new SecretFilter();
    const result = filter.filterFiles([
      'node_modules/lib/index.js',
      'dist/bundle.js',
      'package-lock.json',
      'src/main.ts',
    ]);
    expect(result.excluded).toContain('node_modules/lib/index.js');
    expect(result.excluded).toContain('dist/bundle.js');
    expect(result.excluded).toContain('package-lock.json');
    expect(result.allowed).toContain('src/main.ts');
  });

  it('applies custom excludePatterns', () => {
    const filter = new SecretFilter({ excludePatterns: ['*.spec.ts'] });
    const result = filter.filterFiles(['src/app.ts', 'src/app.spec.ts']);
    expect(result.allowed).toContain('src/app.ts');
    expect(result.excluded).toContain('src/app.spec.ts');
  });

  it('returns empty arrays for empty input', () => {
    const filter = new SecretFilter();
    const result = filter.filterFiles([]);
    expect(result.allowed).toHaveLength(0);
    expect(result.excluded).toHaveLength(0);
    expect(result.secrets).toHaveLength(0);
  });
});

describe('SecretFilter.filterContent', () => {
  it('redacts API keys', () => {
    const filter = new SecretFilter();
    const content = 'api_key = "abcdefghijklmnopqrstuvwxyz123456"';
    const result = filter.filterContent(content);
    expect(result).toContain('[REDACTED_API_KEY]');
    expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
  });

  it('redacts secret keys', () => {
    const filter = new SecretFilter();
    const content = 'secret_key: "mysecretkeyvalue12345678"';
    const result = filter.filterContent(content);
    expect(result).toContain('[REDACTED_API_KEY]');
  });

  it('redacts tokens', () => {
    const filter = new SecretFilter();
    const content = 'token = "abcdefghijklmnopqrstuvwxyz.123456"';
    const result = filter.filterContent(content);
    expect(result).toContain('[REDACTED_TOKEN]');
  });

  it('redacts GitHub PATs', () => {
    const filter = new SecretFilter();
    const content = 'auth: ghp_' + 'A'.repeat(36);
    const result = filter.filterContent(content);
    expect(result).toContain('[REDACTED_TOKEN]');
    expect(result).not.toContain('ghp_');
  });

  it('redacts passwords', () => {
    const filter = new SecretFilter();
    const content = 'password = "supersecret123"';
    const result = filter.filterContent(content);
    expect(result).toContain('[REDACTED_PASSWORD]');
    expect(result).not.toContain('supersecret123');
  });

  it('redacts private keys', () => {
    const filter = new SecretFilter();
    const content =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----';
    const result = filter.filterContent(content);
    expect(result).toContain('[REDACTED_PRIVATE_KEY]');
    expect(result).not.toContain('MIIEpAIBAAKCAQEA');
  });

  it('leaves clean content unchanged', () => {
    const filter = new SecretFilter();
    const content = 'const x = 42;\nexport default x;';
    expect(filter.filterContent(content)).toBe(content);
  });
});

describe('SecretFilter.isBinaryContent', () => {
  it('detects binary content by null bytes', () => {
    const filter = new SecretFilter();
    expect(filter.isBinaryContent('hello\0world')).toBe(true);
  });

  it('returns false for plain text', () => {
    const filter = new SecretFilter();
    expect(filter.isBinaryContent('plain text content')).toBe(false);
  });
});

describe('shouldExcludeFile', () => {
  it('excludes secret files', () => {
    expect(shouldExcludeFile('.env')).toBe(true);
    expect(shouldExcludeFile('private.key')).toBe(true);
  });

  it('excludes generated/build directories', () => {
    expect(shouldExcludeFile('dist/index.js')).toBe(true);
    expect(shouldExcludeFile('build/app.js')).toBe(true);
    expect(shouldExcludeFile('node_modules/pkg/index.js')).toBe(true);
    expect(shouldExcludeFile('.next/server/pages.js')).toBe(true);
  });

  it('excludes lock files', () => {
    expect(shouldExcludeFile('package-lock.json')).toBe(true);
    expect(shouldExcludeFile('yarn.lock')).toBe(true);
    expect(shouldExcludeFile('pnpm-lock.yaml')).toBe(true);
  });

  it('allows regular source files', () => {
    expect(shouldExcludeFile('src/index.ts')).toBe(false);
    expect(shouldExcludeFile('tests/unit/foo.test.ts')).toBe(false);
    expect(shouldExcludeFile('README.md')).toBe(false);
  });
});
