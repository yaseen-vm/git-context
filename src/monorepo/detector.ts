import fs from 'fs';
import path from 'path';
import type { MonorepoInfo, MonorepoTool, WorkspacePackage } from './types.js';

export class MonorepoDetector {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  detect(): MonorepoInfo {
    const tools: MonorepoTool[] = [];
    let workspaceGlobs: string[] = [];

    if (this.exists('turbo.json')) tools.push('turborepo');
    if (this.exists('nx.json')) tools.push('nx');
    if (this.exists('lerna.json')) tools.push('lerna');

    const yarnGlobs = this.readYarnWorkspaces();
    if (yarnGlobs.length > 0) {
      tools.push('yarn-workspaces');
      workspaceGlobs = [...workspaceGlobs, ...yarnGlobs];
    }

    const npmGlobs = this.readNpmWorkspaces();
    if (npmGlobs.length > 0 && !tools.includes('yarn-workspaces')) {
      tools.push('npm-workspaces');
      workspaceGlobs = [...workspaceGlobs, ...npmGlobs];
    }

    const pnpmGlobs = this.readPnpmWorkspaces();
    if (pnpmGlobs.length > 0) {
      tools.push('pnpm-workspaces');
      workspaceGlobs = [...workspaceGlobs, ...pnpmGlobs];
    }

    // Lerna can declare packages too
    if (tools.includes('lerna') && workspaceGlobs.length === 0) {
      workspaceGlobs = this.readLernaPackages();
    }

    // Deduplicate globs
    workspaceGlobs = [...new Set(workspaceGlobs)];

    const isMonorepo = tools.length > 0;
    const packages = isMonorepo ? this.resolvePackages(workspaceGlobs) : [];

    return {
      isMonorepo,
      tools,
      rootPath: this.rootPath,
      packages,
      workspaceGlobs,
    };
  }

  private exists(filename: string): boolean {
    return fs.existsSync(path.join(this.rootPath, filename));
  }

  private readJson(filename: string): Record<string, unknown> | null {
    const filePath = path.join(this.rootPath, filename);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private readYarnWorkspaces(): string[] {
    const pkg = this.readJson('package.json');
    if (!pkg) return [];
    const workspaces = pkg['workspaces'];
    if (Array.isArray(workspaces)) return workspaces as string[];
    if (workspaces && typeof workspaces === 'object' && 'packages' in workspaces) {
      const pkgs = (workspaces as Record<string, unknown>)['packages'];
      if (Array.isArray(pkgs)) return pkgs as string[];
    }
    return [];
  }

  private readNpmWorkspaces(): string[] {
    // npm workspaces use the same package.json `workspaces` field as Yarn
    // Only counted as npm-workspaces if no yarn.lock is present
    if (fs.existsSync(path.join(this.rootPath, 'yarn.lock'))) return [];
    return this.readYarnWorkspaces();
  }

  private readPnpmWorkspaces(): string[] {
    const filePath = path.join(this.rootPath, 'pnpm-workspace.yaml');
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    return this.parsePnpmWorkspaceYaml(content);
  }

  parsePnpmWorkspaceYaml(content: string): string[] {
    const globs: string[] = [];
    let inPackages = false;

    for (const raw of content.split('\n')) {
      const line = raw.trimEnd();
      if (/^packages\s*:/.test(line)) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        // Stop at next top-level key
        if (/^\S/.test(line) && line.trim() !== '') {
          inPackages = false;
          continue;
        }
        const match = line.match(/^\s+-\s+['"]?([^'"]+)['"]?\s*$/);
        if (match) globs.push(match[1].trim());
      }
    }

    return globs;
  }

  private readLernaPackages(): string[] {
    const lerna = this.readJson('lerna.json');
    if (!lerna) return [];
    const pkgs = lerna['packages'];
    if (Array.isArray(pkgs)) return pkgs as string[];
    return ['packages/*'];
  }

  resolvePackages(globs: string[]): WorkspacePackage[] {
    const packages: WorkspacePackage[] = [];
    const seen = new Set<string>();

    for (const glob of globs) {
      const resolved = this.expandGlob(glob);
      for (const pkgPath of resolved) {
        if (seen.has(pkgPath)) continue;
        seen.add(pkgPath);
        const pkgJson = this.readPackageJson(pkgPath);
        const name = (pkgJson?.['name'] as string) ?? path.basename(pkgPath);
        packages.push({
          name,
          path: pkgPath,
          relativePath: path.relative(this.rootPath, pkgPath).replace(/\\/g, '/'),
        });
      }
    }

    return packages;
  }

  private expandGlob(glob: string): string[] {
    // Handle patterns like: packages/*, apps/*, *, packages/my-pkg
    const parts = glob.replace(/\\/g, '/').split('/');
    const dirs: string[] = [];
    this.expandParts(this.rootPath, parts, 0, dirs);
    return dirs;
  }

  private expandParts(current: string, parts: string[], index: number, result: string[]): void {
    if (index >= parts.length) {
      // Leaf reached — check it is a directory with a package.json
      if (fs.existsSync(path.join(current, 'package.json'))) {
        result.push(current);
      }
      return;
    }

    const part = parts[index];

    if (part === '**') {
      // Recurse into all subdirectories
      this.expandParts(current, parts, index + 1, result);
      try {
        for (const entry of fs.readdirSync(current)) {
          const full = path.join(current, entry);
          if (fs.statSync(full).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
            this.expandParts(full, parts, index, result);
          }
        }
      } catch { /* ignore permission errors */ }
    } else if (part === '*') {
      // Expand to all immediate subdirectories
      try {
        for (const entry of fs.readdirSync(current)) {
          const full = path.join(current, entry);
          try {
            if (fs.statSync(full).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
              this.expandParts(full, parts, index + 1, result);
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    } else {
      // Literal segment
      this.expandParts(path.join(current, part), parts, index + 1, result);
    }
  }

  private readPackageJson(dirPath: string): Record<string, unknown> | null {
    const filePath = path.join(dirPath, 'package.json');
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
