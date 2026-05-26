import type { MonorepoInfo, WorkspacePackage } from './types.js';

export interface ScopeResult {
  /** The package that owns the majority of the changed files, or null for root-level changes. */
  primaryPackage: WorkspacePackage | null;
  /** All packages that have at least one changed file. */
  affectedPackages: WorkspacePackage[];
  /** Changed file paths that belong to the root (outside any package). */
  rootFiles: string[];
  /** Changed file paths scoped to the primary package. */
  scopedFiles: string[];
  /** Changed file paths in other affected packages (not the primary). */
  otherPackageFiles: string[];
}

export class WorkspaceScope {
  private info: MonorepoInfo;

  constructor(info: MonorepoInfo) {
    this.info = info;
  }

  /**
   * Given a list of changed file paths (relative to repo root), determine
   * which package owns each file and return a scoped view of the changes.
   *
   * If scopeOverride is provided it is matched against package names or
   * relative paths, allowing --scope CLI flag support.
   */
  scope(changedFiles: string[], scopeOverride?: string): ScopeResult {
    if (!this.info.isMonorepo || this.info.packages.length === 0) {
      return {
        primaryPackage: null,
        affectedPackages: [],
        rootFiles: changedFiles,
        scopedFiles: changedFiles,
        otherPackageFiles: [],
      };
    }

    const packageOf = (file: string): WorkspacePackage | null => {
      const normalized = file.replace(/\\/g, '/');
      // Sort by longest relativePath so most-specific package wins
      const sorted = [...this.info.packages].sort(
        (a, b) => b.relativePath.length - a.relativePath.length,
      );
      for (const pkg of sorted) {
        if (normalized.startsWith(pkg.relativePath + '/') || normalized === pkg.relativePath) {
          return pkg;
        }
      }
      return null;
    };

    const filesByPackage = new Map<string, { pkg: WorkspacePackage; files: string[] }>();
    const rootFiles: string[] = [];

    for (const file of changedFiles) {
      const pkg = packageOf(file);
      if (!pkg) {
        rootFiles.push(file);
      } else {
        if (!filesByPackage.has(pkg.relativePath)) {
          filesByPackage.set(pkg.relativePath, { pkg, files: [] });
        }
        filesByPackage.get(pkg.relativePath)!.files.push(file);
      }
    }

    const affectedPackages = [...filesByPackage.values()].map((e) => e.pkg);

    // Determine primary package: scope override > most changed files > first
    let primary: WorkspacePackage | null = null;

    if (scopeOverride) {
      primary =
        this.info.packages.find(
          (p) => p.name === scopeOverride || p.relativePath === scopeOverride,
        ) ?? null;
    }

    if (!primary && affectedPackages.length > 0) {
      primary = [...filesByPackage.values()].sort(
        (a, b) => b.files.length - a.files.length,
      )[0].pkg;
    }

    const scopedFiles = primary
      ? (filesByPackage.get(primary.relativePath)?.files ?? [])
      : rootFiles;

    const otherPackageFiles = [...filesByPackage.values()]
      .filter((e) => e.pkg.relativePath !== primary?.relativePath)
      .flatMap((e) => e.files);

    return {
      primaryPackage: primary,
      affectedPackages,
      rootFiles,
      scopedFiles,
      otherPackageFiles,
    };
  }

  /**
   * Returns files that belong to shared/root-level context: files in the repo root
   * and files in any package not considered primary.
   */
  getSharedContext(changedFiles: string[]): string[] {
    const result = this.scope(changedFiles);
    return [...result.rootFiles, ...result.otherPackageFiles];
  }
}
