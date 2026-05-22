import { describe, it, expect } from 'vitest';
import { WorkspaceScope } from '../../src/monorepo/index.js';
import type { MonorepoInfo, WorkspacePackage } from '../../src/monorepo/index.js';

const api: WorkspacePackage = { name: '@app/api', path: '/root/packages/api', relativePath: 'packages/api' };
const web: WorkspacePackage = { name: '@app/web', path: '/root/packages/web', relativePath: 'packages/web' };
const shared: WorkspacePackage = { name: '@app/shared', path: '/root/packages/shared', relativePath: 'packages/shared' };

const monoInfo: MonorepoInfo = {
  isMonorepo: true,
  tools: ['yarn-workspaces'],
  rootPath: '/root',
  packages: [api, web, shared],
  workspaceGlobs: ['packages/*'],
};

const plainInfo: MonorepoInfo = {
  isMonorepo: false,
  tools: [],
  rootPath: '/root',
  packages: [],
  workspaceGlobs: [],
};

describe('WorkspaceScope — non-monorepo passthrough', () => {
  it('returns all changed files as scopedFiles when not a monorepo', () => {
    const scope = new WorkspaceScope(plainInfo);
    const result = scope.scope(['src/app.ts', 'src/utils.ts']);
    expect(result.primaryPackage).toBeNull();
    expect(result.scopedFiles).toEqual(['src/app.ts', 'src/utils.ts']);
    expect(result.affectedPackages).toHaveLength(0);
  });
});

describe('WorkspaceScope — package assignment', () => {
  it('assigns files to the correct package by path prefix', () => {
    const scope = new WorkspaceScope(monoInfo);
    const result = scope.scope([
      'packages/api/src/auth.ts',
      'packages/web/pages/index.tsx',
    ]);
    expect(result.affectedPackages.map((p) => p.name)).toContain('@app/api');
    expect(result.affectedPackages.map((p) => p.name)).toContain('@app/web');
  });

  it('puts root-level files (outside all packages) in rootFiles', () => {
    const scope = new WorkspaceScope(monoInfo);
    const result = scope.scope(['turbo.json', 'packages/api/src/index.ts']);
    expect(result.rootFiles).toContain('turbo.json');
    expect(result.rootFiles).not.toContain('packages/api/src/index.ts');
  });

  it('picks the package with most changes as primary', () => {
    const scope = new WorkspaceScope(monoInfo);
    const result = scope.scope([
      'packages/api/src/a.ts',
      'packages/api/src/b.ts',
      'packages/web/pages/index.tsx',
    ]);
    expect(result.primaryPackage?.name).toBe('@app/api');
  });

  it('scoped files contain only primary package files', () => {
    const scope = new WorkspaceScope(monoInfo);
    const result = scope.scope([
      'packages/api/src/a.ts',
      'packages/web/pages/index.tsx',
    ]);
    expect(result.scopedFiles).toContain('packages/api/src/a.ts');
    expect(result.scopedFiles).not.toContain('packages/web/pages/index.tsx');
  });

  it('otherPackageFiles contains files from non-primary packages', () => {
    const scope = new WorkspaceScope(monoInfo);
    const result = scope.scope([
      'packages/api/src/a.ts',
      'packages/web/pages/index.tsx',
      'packages/shared/types.ts',
    ]);
    expect(result.otherPackageFiles).toContain('packages/web/pages/index.tsx');
    expect(result.otherPackageFiles).toContain('packages/shared/types.ts');
  });

  it('handles exact package path match (no trailing slash)', () => {
    const scope = new WorkspaceScope(monoInfo);
    const result = scope.scope(['packages/api']);
    expect(result.affectedPackages.map((p) => p.name)).toContain('@app/api');
  });
});

describe('WorkspaceScope — scopeOverride', () => {
  it('overrides primary by package name', () => {
    const scope = new WorkspaceScope(monoInfo);
    const result = scope.scope(
      ['packages/api/src/a.ts', 'packages/api/src/b.ts', 'packages/web/pages/index.tsx'],
      '@app/web',
    );
    expect(result.primaryPackage?.name).toBe('@app/web');
    expect(result.scopedFiles).toContain('packages/web/pages/index.tsx');
  });

  it('overrides primary by relativePath', () => {
    const scope = new WorkspaceScope(monoInfo);
    const result = scope.scope(
      ['packages/api/src/a.ts', 'packages/web/pages/index.tsx'],
      'packages/web',
    );
    expect(result.primaryPackage?.name).toBe('@app/web');
  });

  it('falls back to most-changed package when override name is unknown', () => {
    const scope = new WorkspaceScope(monoInfo);
    const result = scope.scope(
      ['packages/api/src/a.ts', 'packages/api/src/b.ts', 'packages/web/pages/index.tsx'],
      'nonexistent',
    );
    expect(result.primaryPackage?.name).toBe('@app/api');
  });
});

describe('WorkspaceScope — getSharedContext', () => {
  it('returns root files and non-primary package files', () => {
    const scope = new WorkspaceScope(monoInfo);
    const shared = scope.getSharedContext([
      'turbo.json',
      'packages/api/src/a.ts',
      'packages/api/src/b.ts',
      'packages/web/pages/index.tsx',
    ]);
    expect(shared).toContain('turbo.json');
    expect(shared).toContain('packages/web/pages/index.tsx');
    expect(shared).not.toContain('packages/api/src/a.ts');
  });

  it('returns all files as shared context for non-monorepo', () => {
    const scope = new WorkspaceScope(plainInfo);
    const files = ['src/a.ts', 'src/b.ts'];
    expect(scope.getSharedContext(files)).toEqual(files);
  });
});

describe('WorkspaceScope — all files in single package', () => {
  it('has empty otherPackageFiles and rootFiles', () => {
    const scope = new WorkspaceScope(monoInfo);
    const result = scope.scope(['packages/api/src/a.ts', 'packages/api/src/b.ts']);
    expect(result.otherPackageFiles).toHaveLength(0);
    expect(result.rootFiles).toHaveLength(0);
    expect(result.primaryPackage?.name).toBe('@app/api');
  });
});
