import fs from 'fs';
import path from 'path';
import type { MonorepoInfo, WorkspacePackage } from './types.js';

export interface CrossPackageImport {
  /** The raw import specifier as it appears in source, e.g. "@app/shared". */
  specifier: string;
  /** The workspace package that owns this specifier. */
  resolvedPackage: WorkspacePackage;
  /** Entry-point file path relative to repo root (from main/module in package.json), if discoverable. */
  entryPoint: string | null;
}

export interface ResolveResult {
  /** Imports that were resolved to a workspace package. */
  resolved: CrossPackageImport[];
  /** Specifiers that look like workspace packages but could not be resolved. */
  unresolved: string[];
  /** Specifiers that are clearly external (npm) packages, not workspace members. */
  external: string[];
}

export class CrossPackageResolver {
  private info: MonorepoInfo;
  /** Map from package name → WorkspacePackage for O(1) lookup. */
  private nameMap: Map<string, WorkspacePackage>;

  constructor(info: MonorepoInfo) {
    this.info = info;
    this.nameMap = new Map(info.packages.map((p) => [p.name, p]));
  }

  /**
   * Resolves an array of import specifiers against the workspace package registry.
   * Specifiers that match a workspace package name are returned as resolved;
   * others are classified as external.
   */
  resolveImports(specifiers: string[]): ResolveResult {
    const resolved: CrossPackageImport[] = [];
    const unresolved: string[] = [];
    const external: string[] = [];

    for (const specifier of specifiers) {
      const pkg = this.findPackageForSpecifier(specifier);
      if (pkg) {
        const entryPoint = this.resolveEntryPoint(pkg, specifier);
        resolved.push({ specifier, resolvedPackage: pkg, entryPoint });
      } else if (this.looksLikeWorkspacePackage(specifier)) {
        unresolved.push(specifier);
      } else {
        external.push(specifier);
      }
    }

    return { resolved, unresolved, external };
  }

  /**
   * Finds all workspace packages imported by files in the given package.
   * Scans source files for import/require statements and resolves them.
   */
  findCrossPackageImports(pkg: WorkspacePackage): CrossPackageImport[] {
    const specifiers = this.extractSpecifiersFromPackage(pkg);
    const { resolved } = this.resolveImports(specifiers);
    // Exclude self-imports
    return resolved.filter((r) => r.resolvedPackage.name !== pkg.name);
  }

  /**
   * Returns all workspace packages that are reachable (direct or transitive)
   * from the given starting package.
   */
  getTransitiveDependencies(pkg: WorkspacePackage, visited = new Set<string>()): WorkspacePackage[] {
    if (visited.has(pkg.name)) return [];
    visited.add(pkg.name);

    const direct = this.findCrossPackageImports(pkg).map((i) => i.resolvedPackage);
    const transitive: WorkspacePackage[] = [...direct];

    for (const dep of direct) {
      transitive.push(...this.getTransitiveDependencies(dep, visited));
    }

    return [...new Map(transitive.map((p) => [p.name, p])).values()];
  }

  private findPackageForSpecifier(specifier: string): WorkspacePackage | null {
    // Exact match: import "@app/api"
    if (this.nameMap.has(specifier)) return this.nameMap.get(specifier)!;

    // Sub-path match: import "@app/api/utils" → package "@app/api"
    for (const [name, pkg] of this.nameMap) {
      if (specifier.startsWith(name + '/')) return pkg;
    }

    return null;
  }

  private looksLikeWorkspacePackage(specifier: string): boolean {
    // Scoped packages not in the registry but matching a known scope
    const knownScopes = new Set<string>();
    for (const name of this.nameMap.keys()) {
      if (name.startsWith('@')) {
        const scope = name.split('/')[0];
        knownScopes.add(scope);
      }
    }
    if (specifier.startsWith('@')) {
      const scope = specifier.split('/')[0];
      return knownScopes.has(scope);
    }
    return false;
  }

  private resolveEntryPoint(pkg: WorkspacePackage, specifier: string): string | null {
    const pkgJsonPath = path.join(pkg.path, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return null;

    let pkgJson: Record<string, unknown>;
    try {
      pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return null;
    }

    // For sub-path imports, return null (would need exports map resolution)
    if (specifier !== pkg.name) return null;

    const entry =
      (pkgJson['module'] as string | undefined) ??
      (pkgJson['main'] as string | undefined) ??
      'index.js';

    const fullPath = path.join(pkg.path, entry);
    if (!fs.existsSync(fullPath)) return null;

    return path.join(pkg.relativePath, entry).replace(/\\/g, '/');
  }

  private extractSpecifiersFromPackage(pkg: WorkspacePackage): string[] {
    const specifiers = new Set<string>();
    this.walkSourceFiles(pkg.path, (filePath) => {
      const content = this.readFileSafe(filePath);
      if (content) {
        for (const spec of this.extractSpecifiersFromSource(content)) {
          specifiers.add(spec);
        }
      }
    });
    return [...specifiers];
  }

  extractSpecifiersFromSource(source: string): string[] {
    const specifiers: string[] = [];
    // Match: import ... from '...' / import('...') / require('...')
    const patterns = [
      /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g,
      /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const spec = match[1];
        // Skip relative imports
        if (!spec.startsWith('.')) {
          specifiers.push(spec);
        }
      }
    }
    return specifiers;
  }

  private walkSourceFiles(dir: string, callback: (filePath: string) => void): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build') {
        continue;
      }
      const full = path.join(dir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        this.walkSourceFiles(full, callback);
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
        callback(full);
      }
    }
  }

  private readFileSafe(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
}
