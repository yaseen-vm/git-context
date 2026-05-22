import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MonorepoDetector } from '../../src/monorepo/index.js';

function mkRepo(base: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(base, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-ctx-mono-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── tool detection ────────────────────────────────────────────────────────

describe('MonorepoDetector — tool detection', () => {
  it('returns isMonorepo: false for plain repo', () => {
    mkRepo(tmpDir, { 'package.json': '{"name":"app"}' });
    const info = new MonorepoDetector(tmpDir).detect();
    expect(info.isMonorepo).toBe(false);
    expect(info.tools).toHaveLength(0);
  });

  it('detects Turborepo via turbo.json', () => {
    mkRepo(tmpDir, { 'turbo.json': '{}', 'package.json': '{"name":"root"}' });
    const info = new MonorepoDetector(tmpDir).detect();
    expect(info.isMonorepo).toBe(true);
    expect(info.tools).toContain('turborepo');
  });

  it('detects Nx via nx.json', () => {
    mkRepo(tmpDir, { 'nx.json': '{}', 'package.json': '{"name":"root"}' });
    const info = new MonorepoDetector(tmpDir).detect();
    expect(info.tools).toContain('nx');
  });

  it('detects Lerna via lerna.json', () => {
    mkRepo(tmpDir, {
      'lerna.json': '{"packages":["packages/*"]}',
      'package.json': '{"name":"root"}',
    });
    const info = new MonorepoDetector(tmpDir).detect();
    expect(info.tools).toContain('lerna');
  });

  it('detects Yarn workspaces via package.json workspaces array', () => {
    mkRepo(tmpDir, {
      'package.json': '{"name":"root","workspaces":["packages/*"]}',
      'yarn.lock': '',
    });
    const info = new MonorepoDetector(tmpDir).detect();
    expect(info.tools).toContain('yarn-workspaces');
    expect(info.workspaceGlobs).toContain('packages/*');
  });

  it('detects Yarn workspaces via nested packages field', () => {
    mkRepo(tmpDir, {
      'package.json': JSON.stringify({ name: 'root', workspaces: { packages: ['apps/*'] } }),
      'yarn.lock': '',
    });
    const info = new MonorepoDetector(tmpDir).detect();
    expect(info.tools).toContain('yarn-workspaces');
    expect(info.workspaceGlobs).toContain('apps/*');
  });

  it('detects PNPM workspaces via pnpm-workspace.yaml', () => {
    mkRepo(tmpDir, {
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n  - apps/*\n',
      'package.json': '{"name":"root"}',
    });
    const info = new MonorepoDetector(tmpDir).detect();
    expect(info.tools).toContain('pnpm-workspaces');
    expect(info.workspaceGlobs).toContain('packages/*');
    expect(info.workspaceGlobs).toContain('apps/*');
  });

  it('detects multiple tools simultaneously (turbo + yarn workspaces)', () => {
    mkRepo(tmpDir, {
      'turbo.json': '{}',
      'package.json': '{"name":"root","workspaces":["packages/*"]}',
      'yarn.lock': '',
    });
    const info = new MonorepoDetector(tmpDir).detect();
    expect(info.tools).toContain('turborepo');
    expect(info.tools).toContain('yarn-workspaces');
  });
});

// ─── workspace glob parsing ────────────────────────────────────────────────

describe('MonorepoDetector — parsePnpmWorkspaceYaml', () => {
  const detector = new MonorepoDetector('/irrelevant');

  it('parses single-quoted entries', () => {
    const yaml = "packages:\n  - 'packages/*'\n  - 'apps/*'\n";
    expect(detector.parsePnpmWorkspaceYaml(yaml)).toEqual(['packages/*', 'apps/*']);
  });

  it('parses unquoted entries', () => {
    const yaml = 'packages:\n  - packages/*\n  - libs/*\n';
    expect(detector.parsePnpmWorkspaceYaml(yaml)).toEqual(['packages/*', 'libs/*']);
  });

  it('stops at next top-level key', () => {
    const yaml = 'packages:\n  - packages/*\nother:\n  - something\n';
    expect(detector.parsePnpmWorkspaceYaml(yaml)).toEqual(['packages/*']);
  });

  it('returns empty array when no packages key', () => {
    expect(detector.parsePnpmWorkspaceYaml('name: root\n')).toEqual([]);
  });
});

// ─── package resolution ────────────────────────────────────────────────────

describe('MonorepoDetector — resolvePackages', () => {
  it('discovers packages matching wildcard glob', () => {
    mkRepo(tmpDir, {
      'packages/api/package.json': '{"name":"@scope/api"}',
      'packages/web/package.json': '{"name":"@scope/web"}',
    });
    const detector = new MonorepoDetector(tmpDir);
    const pkgs = detector.resolvePackages(['packages/*']);
    const names = pkgs.map((p) => p.name);
    expect(names).toContain('@scope/api');
    expect(names).toContain('@scope/web');
  });

  it('uses directory name as fallback when package.json has no name', () => {
    mkRepo(tmpDir, { 'packages/utils/package.json': '{}' });
    const detector = new MonorepoDetector(tmpDir);
    const pkgs = detector.resolvePackages(['packages/*']);
    expect(pkgs[0].name).toBe('utils');
  });

  it('sets correct relativePath', () => {
    mkRepo(tmpDir, { 'apps/dashboard/package.json': '{"name":"dashboard"}' });
    const detector = new MonorepoDetector(tmpDir);
    const pkgs = detector.resolvePackages(['apps/*']);
    expect(pkgs[0].relativePath).toBe('apps/dashboard');
  });

  it('skips directories without package.json', () => {
    mkRepo(tmpDir, {
      'packages/real/package.json': '{"name":"real"}',
      'packages/no-pkg/README.md': 'docs',
    });
    const detector = new MonorepoDetector(tmpDir);
    const pkgs = detector.resolvePackages(['packages/*']);
    expect(pkgs.map((p) => p.name)).toEqual(['real']);
  });

  it('deduplicates packages that match multiple globs', () => {
    mkRepo(tmpDir, { 'packages/shared/package.json': '{"name":"shared"}' });
    const detector = new MonorepoDetector(tmpDir);
    const pkgs = detector.resolvePackages(['packages/*', 'packages/*']);
    expect(pkgs).toHaveLength(1);
  });
});

// ─── full detect() integration ─────────────────────────────────────────────

describe('MonorepoDetector — detect() integration', () => {
  it('populates packages from workspace globs', () => {
    mkRepo(tmpDir, {
      'package.json': '{"name":"root","workspaces":["packages/*"]}',
      'yarn.lock': '',
      'packages/core/package.json': '{"name":"@app/core"}',
      'packages/utils/package.json': '{"name":"@app/utils"}',
    });
    const info = new MonorepoDetector(tmpDir).detect();
    expect(info.isMonorepo).toBe(true);
    expect(info.packages).toHaveLength(2);
    const names = info.packages.map((p) => p.name);
    expect(names).toContain('@app/core');
    expect(names).toContain('@app/utils');
  });

  it('exposes rootPath', () => {
    mkRepo(tmpDir, { 'turbo.json': '{}', 'package.json': '{"name":"root"}' });
    const info = new MonorepoDetector(tmpDir).detect();
    expect(info.rootPath).toBe(tmpDir);
  });

  it('deduplicates workspaceGlobs when multiple tools declare the same pattern', () => {
    mkRepo(tmpDir, {
      'lerna.json': '{"packages":["packages/*"]}',
      'package.json': '{"name":"root","workspaces":["packages/*"]}',
      'yarn.lock': '',
    });
    const info = new MonorepoDetector(tmpDir).detect();
    expect(info.workspaceGlobs.filter((g) => g === 'packages/*')).toHaveLength(1);
  });
});
