import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CrossPackageResolver } from '../../src/monorepo/index.js';
import type { MonorepoInfo } from '../../src/monorepo/index.js';

function mkRepo(base: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(base, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-ctx-xpkg-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeInfo(packages: { name: string; rel: string }[]): MonorepoInfo {
  return {
    isMonorepo: true,
    tools: ['yarn-workspaces'],
    rootPath: tmpDir,
    packages: packages.map((p) => ({
      name: p.name,
      path: path.join(tmpDir, p.rel),
      relativePath: p.rel,
    })),
    workspaceGlobs: ['packages/*'],
  };
}

// ─── extractSpecifiersFromSource ───────────────────────────────────────────

describe('CrossPackageResolver.extractSpecifiersFromSource', () => {
  const resolver = new CrossPackageResolver({ isMonorepo: false, tools: [], rootPath: '/', packages: [], workspaceGlobs: [] });

  it('extracts static import specifiers', () => {
    const src = `import { foo } from '@app/shared';\nimport bar from '@app/utils';`;
    const specs = resolver.extractSpecifiersFromSource(src);
    expect(specs).toContain('@app/shared');
    expect(specs).toContain('@app/utils');
  });

  it('extracts re-export specifiers', () => {
    const src = `export { foo } from '@app/core';`;
    expect(resolver.extractSpecifiersFromSource(src)).toContain('@app/core');
  });

  it('extracts dynamic import()', () => {
    const src = `const mod = await import('@app/lazy');`;
    expect(resolver.extractSpecifiersFromSource(src)).toContain('@app/lazy');
  });

  it('extracts require()', () => {
    const src = `const x = require('@app/compat');`;
    expect(resolver.extractSpecifiersFromSource(src)).toContain('@app/compat');
  });

  it('ignores relative imports', () => {
    const src = `import { x } from './local';\nimport y from '../parent';`;
    const specs = resolver.extractSpecifiersFromSource(src);
    expect(specs).not.toContain('./local');
    expect(specs).not.toContain('../parent');
  });
});

// ─── resolveImports ────────────────────────────────────────────────────────

describe('CrossPackageResolver.resolveImports', () => {
  it('resolves exact package name match', () => {
    const info = makeInfo([{ name: '@app/shared', rel: 'packages/shared' }]);
    const resolver = new CrossPackageResolver(info);
    const result = resolver.resolveImports(['@app/shared', 'react']);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].specifier).toBe('@app/shared');
    expect(result.resolved[0].resolvedPackage.name).toBe('@app/shared');
  });

  it('resolves sub-path import to the owning package', () => {
    const info = makeInfo([{ name: '@app/shared', rel: 'packages/shared' }]);
    const resolver = new CrossPackageResolver(info);
    const result = resolver.resolveImports(['@app/shared/utils']);
    expect(result.resolved[0].resolvedPackage.name).toBe('@app/shared');
    expect(result.resolved[0].specifier).toBe('@app/shared/utils');
  });

  it('classifies known-scope-but-unknown-name as unresolved', () => {
    const info = makeInfo([{ name: '@app/api', rel: 'packages/api' }]);
    const resolver = new CrossPackageResolver(info);
    const result = resolver.resolveImports(['@app/unknown-pkg']);
    expect(result.unresolved).toContain('@app/unknown-pkg');
  });

  it('classifies npm packages as external', () => {
    const info = makeInfo([{ name: '@app/api', rel: 'packages/api' }]);
    const resolver = new CrossPackageResolver(info);
    const result = resolver.resolveImports(['react', 'lodash', 'fs']);
    expect(result.external).toContain('react');
    expect(result.external).toContain('lodash');
  });

  it('resolves entry point from package.json main field', () => {
    mkRepo(tmpDir, {
      'packages/shared/package.json': JSON.stringify({ name: '@app/shared', main: 'dist/index.js' }),
      'packages/shared/dist/index.js': 'export {}',
    });
    const info = makeInfo([{ name: '@app/shared', rel: 'packages/shared' }]);
    const resolver = new CrossPackageResolver(info);
    const result = resolver.resolveImports(['@app/shared']);
    expect(result.resolved[0].entryPoint).toBe('packages/shared/dist/index.js');
  });

  it('returns null entryPoint when main file does not exist', () => {
    mkRepo(tmpDir, {
      'packages/shared/package.json': JSON.stringify({ name: '@app/shared', main: 'dist/missing.js' }),
    });
    const info = makeInfo([{ name: '@app/shared', rel: 'packages/shared' }]);
    const resolver = new CrossPackageResolver(info);
    const result = resolver.resolveImports(['@app/shared']);
    expect(result.resolved[0].entryPoint).toBeNull();
  });

  it('returns null entryPoint for sub-path imports', () => {
    mkRepo(tmpDir, {
      'packages/shared/package.json': JSON.stringify({ name: '@app/shared', main: 'index.js' }),
    });
    const info = makeInfo([{ name: '@app/shared', rel: 'packages/shared' }]);
    const resolver = new CrossPackageResolver(info);
    const result = resolver.resolveImports(['@app/shared/utils']);
    expect(result.resolved[0].entryPoint).toBeNull();
  });
});

// ─── findCrossPackageImports ───────────────────────────────────────────────

describe('CrossPackageResolver.findCrossPackageImports', () => {
  it('finds imports of other workspace packages in source files', () => {
    mkRepo(tmpDir, {
      'packages/api/package.json': '{"name":"@app/api"}',
      'packages/api/src/service.ts': `import { connect } from '@app/db';\nimport { logger } from '@app/shared';`,
      'packages/db/package.json': '{"name":"@app/db"}',
      'packages/shared/package.json': '{"name":"@app/shared"}',
    });
    const info = makeInfo([
      { name: '@app/api', rel: 'packages/api' },
      { name: '@app/db', rel: 'packages/db' },
      { name: '@app/shared', rel: 'packages/shared' },
    ]);
    const resolver = new CrossPackageResolver(info);
    const api = info.packages.find((p) => p.name === '@app/api')!;
    const imports = resolver.findCrossPackageImports(api);
    const names = imports.map((i) => i.resolvedPackage.name);
    expect(names).toContain('@app/db');
    expect(names).toContain('@app/shared');
    expect(names).not.toContain('@app/api');
  });

  it('returns empty array when package has no cross-package imports', () => {
    mkRepo(tmpDir, {
      'packages/utils/package.json': '{"name":"@app/utils"}',
      'packages/utils/index.ts': `export const x = 1;`,
    });
    const info = makeInfo([{ name: '@app/utils', rel: 'packages/utils' }]);
    const resolver = new CrossPackageResolver(info);
    const utils = info.packages[0];
    expect(resolver.findCrossPackageImports(utils)).toHaveLength(0);
  });
});

// ─── getTransitiveDependencies ─────────────────────────────────────────────

describe('CrossPackageResolver.getTransitiveDependencies', () => {
  it('resolves transitive cross-package dependencies', () => {
    mkRepo(tmpDir, {
      'packages/api/package.json': '{"name":"@app/api"}',
      'packages/api/index.ts': `import '@app/db';`,
      'packages/db/package.json': '{"name":"@app/db"}',
      'packages/db/index.ts': `import '@app/shared';`,
      'packages/shared/package.json': '{"name":"@app/shared"}',
      'packages/shared/index.ts': `export const x = 1;`,
    });
    const info = makeInfo([
      { name: '@app/api', rel: 'packages/api' },
      { name: '@app/db', rel: 'packages/db' },
      { name: '@app/shared', rel: 'packages/shared' },
    ]);
    const resolver = new CrossPackageResolver(info);
    const api = info.packages.find((p) => p.name === '@app/api')!;
    const deps = resolver.getTransitiveDependencies(api);
    const names = deps.map((p) => p.name);
    expect(names).toContain('@app/db');
    expect(names).toContain('@app/shared');
  });

  it('handles circular dependencies without infinite loop', () => {
    mkRepo(tmpDir, {
      'packages/a/package.json': '{"name":"@app/a"}',
      'packages/a/index.ts': `import '@app/b';`,
      'packages/b/package.json': '{"name":"@app/b"}',
      'packages/b/index.ts': `import '@app/a';`,
    });
    const info = makeInfo([
      { name: '@app/a', rel: 'packages/a' },
      { name: '@app/b', rel: 'packages/b' },
    ]);
    const resolver = new CrossPackageResolver(info);
    const a = info.packages.find((p) => p.name === '@app/a')!;
    expect(() => resolver.getTransitiveDependencies(a)).not.toThrow();
  });
});
