import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SecretFilter } from '../../src/secret-filter/index.js';
import {
  isSecretFile,
  shouldExcludeFile,
  SECRET_PATTERNS,
  isBinaryFile,
  isVendorFile,
  isGeneratedFile,
  isLockFile,
  BINARY_EXTENSIONS,
} from '../../src/utils/index.js';

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

describe('SecretFilter gitignore handling', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-context-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('respects root .gitignore patterns', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'logs/\n*.log\n');
    const filter = new SecretFilter({ respectGitignore: true, repoRoot: tmpDir });
    expect(filter.isIgnoredByGitignore('logs/app.log')).toBe(true);
    expect(filter.isIgnoredByGitignore('debug.log')).toBe(true);
    expect(filter.isIgnoredByGitignore('src/app.ts')).toBe(false);
  });

  it('respects root .ignore patterns', () => {
    fs.writeFileSync(path.join(tmpDir, '.ignore'), 'tmp/\n*.tmp\n');
    const filter = new SecretFilter({ respectGitignore: true, repoRoot: tmpDir });
    expect(filter.isIgnoredByGitignore('tmp/cache')).toBe(true);
    expect(filter.isIgnoredByGitignore('session.tmp')).toBe(true);
    expect(filter.isIgnoredByGitignore('src/index.ts')).toBe(false);
  });

  it('excludes gitignored files in filterFiles', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '*.log\n');
    const filter = new SecretFilter({ respectGitignore: true, repoRoot: tmpDir });
    const result = filter.filterFiles(['app.log', 'src/app.ts']);
    expect(result.excluded).toContain('app.log');
    expect(result.allowed).toContain('src/app.ts');
  });

  it('returns false when no repoRoot is provided', () => {
    const filter = new SecretFilter({ respectGitignore: true });
    expect(filter.isIgnoredByGitignore('logs/app.log')).toBe(false);
  });

  it('returns false when respectGitignore is false', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '*.log\n');
    const filter = new SecretFilter({ respectGitignore: false, repoRoot: tmpDir });
    expect(filter.isIgnoredByGitignore('debug.log')).toBe(false);
  });

  it('handles nested .gitignore files', () => {
    const subDir = path.join(tmpDir, 'packages', 'api');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, '.gitignore'), '*.generated.ts\n');
    const filter = new SecretFilter({ respectGitignore: true, repoRoot: tmpDir });
    expect(filter.isIgnoredByGitignore('packages/api/types.generated.ts')).toBe(true);
    expect(filter.isIgnoredByGitignore('packages/api/service.ts')).toBe(false);
  });
});

describe('isBinaryFile', () => {
  it('detects image files', () => {
    expect(isBinaryFile('logo.png')).toBe(true);
    expect(isBinaryFile('photo.jpg')).toBe(true);
    expect(isBinaryFile('icon.ico')).toBe(true);
    expect(isBinaryFile('animation.gif')).toBe(true);
  });

  it('detects compiled output files', () => {
    expect(isBinaryFile('App.class')).toBe(true);
    expect(isBinaryFile('module.pyc')).toBe(true);
    expect(isBinaryFile('app.wasm')).toBe(true);
  });

  it('detects archive files', () => {
    expect(isBinaryFile('release.zip')).toBe(true);
    expect(isBinaryFile('bundle.tar.gz')).toBe(true);
  });

  it('detects native binaries', () => {
    expect(isBinaryFile('app.exe')).toBe(true);
    expect(isBinaryFile('lib.dll')).toBe(true);
    expect(isBinaryFile('lib.so')).toBe(true);
  });

  it('detects font files', () => {
    expect(isBinaryFile('font.ttf')).toBe(true);
    expect(isBinaryFile('font.woff2')).toBe(true);
  });

  it('allows source and text files', () => {
    expect(isBinaryFile('src/app.ts')).toBe(false);
    expect(isBinaryFile('README.md')).toBe(false);
    expect(isBinaryFile('config.json')).toBe(false);
    expect(isBinaryFile('styles.css')).toBe(false);
  });

  it('is case-insensitive for extensions', () => {
    expect(isBinaryFile('IMAGE.PNG')).toBe(true);
    expect(isBinaryFile('Library.DLL')).toBe(true);
  });

  it('BINARY_EXTENSIONS contains expected entries', () => {
    expect(BINARY_EXTENSIONS.has('.png')).toBe(true);
    expect(BINARY_EXTENSIONS.has('.exe')).toBe(true);
    expect(BINARY_EXTENSIONS.has('.wasm')).toBe(true);
  });
});

describe('isVendorFile', () => {
  it('detects vendor directories', () => {
    expect(isVendorFile('vendor/github.com/pkg/lib.go')).toBe(true);
    expect(isVendorFile('third_party/openssl/src/ssl.c')).toBe(true);
    expect(isVendorFile('extern/zlib/zlib.h')).toBe(true);
  });

  it('allows non-vendor paths', () => {
    expect(isVendorFile('src/vendor-utils.ts')).toBe(false);
    expect(isVendorFile('services/payment.ts')).toBe(false);
  });
});

describe('isGeneratedFile', () => {
  it('detects build output directories', () => {
    expect(isGeneratedFile('dist/bundle.js')).toBe(true);
    expect(isGeneratedFile('build/index.html')).toBe(true);
    expect(isGeneratedFile('coverage/lcov.info')).toBe(true);
    expect(isGeneratedFile('out/release/app')).toBe(true);
  });

  it('detects framework caches', () => {
    expect(isGeneratedFile('.next/server/app.js')).toBe(true);
    expect(isGeneratedFile('.nuxt/dist/client.js')).toBe(true);
    expect(isGeneratedFile('.cache/babel-loader/hash')).toBe(true);
  });

  it('detects node_modules', () => {
    expect(isGeneratedFile('node_modules/lodash/index.js')).toBe(true);
  });

  it('detects compiled Python files', () => {
    expect(isGeneratedFile('module.pyc')).toBe(true);
    expect(isGeneratedFile('__pycache__/main.cpython-311.pyc')).toBe(true);
  });

  it('allows source files', () => {
    expect(isGeneratedFile('src/app.ts')).toBe(false);
    expect(isGeneratedFile('scripts/build.sh')).toBe(false);
  });
});

describe('isLockFile', () => {
  it('detects all common lock files', () => {
    expect(isLockFile('package-lock.json')).toBe(true);
    expect(isLockFile('yarn.lock')).toBe(true);
    expect(isLockFile('pnpm-lock.yaml')).toBe(true);
    expect(isLockFile('Gemfile.lock')).toBe(true);
    expect(isLockFile('composer.lock')).toBe(true);
    expect(isLockFile('poetry.lock')).toBe(true);
    expect(isLockFile('Cargo.lock')).toBe(true);
    expect(isLockFile('Pipfile.lock')).toBe(true);
  });

  it('allows regular files with lock in the name', () => {
    expect(isLockFile('src/lock-manager.ts')).toBe(false);
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

  it('excludes vendor directories', () => {
    expect(shouldExcludeFile('vendor/pkg/lib.go')).toBe(true);
    expect(shouldExcludeFile('third_party/lib/src.c')).toBe(true);
  });

  it('excludes lock files', () => {
    expect(shouldExcludeFile('package-lock.json')).toBe(true);
    expect(shouldExcludeFile('yarn.lock')).toBe(true);
    expect(shouldExcludeFile('pnpm-lock.yaml')).toBe(true);
  });

  it('excludes binary files', () => {
    expect(shouldExcludeFile('assets/logo.png')).toBe(true);
    expect(shouldExcludeFile('release/app.exe')).toBe(true);
    expect(shouldExcludeFile('fonts/inter.woff2')).toBe(true);
  });

  it('allows regular source files', () => {
    expect(shouldExcludeFile('src/index.ts')).toBe(false);
    expect(shouldExcludeFile('tests/unit/foo.test.ts')).toBe(false);
    expect(shouldExcludeFile('README.md')).toBe(false);
  });
});
