import path from 'path';
import type { FolderStructure, ModuleBoundary, EntryPoint, DirectoryInfo } from './types.js';

function formatPath(filePath: string, rootPath: string): string {
  const relative = path.relative(rootPath, filePath);
  return relative.replace(/\\/g, '/') || '.';
}

export function summarizeFolderStructure(structure: FolderStructure): string[] {
  const summary: string[] = [];

  summary.push(`Repository root: ${formatPath(structure.rootPath, structure.rootPath)}`);
  summary.push(`Total files: ${structure.totalFiles}`);
  summary.push(`Total directories: ${structure.totalDirectories}`);
  summary.push(`Maximum directory depth: ${structure.maxDepth}`);

  if (structure.moduleBoundaries.length > 0) {
    summary.push(`Module boundaries detected: ${structure.moduleBoundaries.length}`);
    for (const boundary of structure.moduleBoundaries) {
      summary.push(
        `  - ${boundary.name} (${boundary.type}) at ${formatPath(boundary.path, structure.rootPath)}`,
      );
    }
  }

  if (structure.entryPoints.length > 0) {
    summary.push(`Entry points found: ${structure.entryPoints.length}`);
    for (const entry of structure.entryPoints.slice(0, 10)) {
      summary.push(
        `  - ${entry.name} (${entry.type}) at ${formatPath(entry.path, structure.rootPath)}`,
      );
    }
    if (structure.entryPoints.length > 10) {
      summary.push(`  ... and ${structure.entryPoints.length - 10} more`);
    }
  }

  return summary;
}

export function summarizeModuleBoundaries(
  boundaries: ModuleBoundary[],
  rootPath: string,
): string[] {
  if (boundaries.length === 0) {
    return ['No module boundaries detected'];
  }

  const summary: string[] = [`Found ${boundaries.length} module boundary(ies):`];

  for (const boundary of boundaries) {
    summary.push(`  ${boundary.name}:`);
    summary.push(`    Type: ${boundary.type}`);
    summary.push(`    Path: ${formatPath(boundary.path, rootPath)}`);
    summary.push(`    Files: ${boundary.fileCount}`);
    if (boundary.entryPoints.length > 0) {
      summary.push(
        `    Entry points: ${boundary.entryPoints.map((ep) => path.basename(ep)).join(', ')}`,
      );
    }
  }

  return summary;
}

export function summarizeEntryPoints(entryPoints: EntryPoint[], rootPath: string): string[] {
  if (entryPoints.length === 0) {
    return ['No entry points detected'];
  }

  const summary: string[] = [`Found ${entryPoints.length} entry point(s):`];

  const grouped = new Map<EntryPoint['type'], EntryPoint[]>();
  for (const ep of entryPoints) {
    const existing = grouped.get(ep.type) || [];
    existing.push(ep);
    grouped.set(ep.type, existing);
  }

  for (const [type, points] of grouped) {
    summary.push(`  ${type}: ${points.length}`);
    for (const ep of points.slice(0, 5)) {
      summary.push(`    - ${formatPath(ep.path, rootPath)}`);
    }
    if (points.length > 5) {
      summary.push(`    ... and ${points.length - 5} more`);
    }
  }

  return summary;
}

export function generateDirectoryTree(
  dir: DirectoryInfo,
  rootPath: string,
  maxDepth: number = 3,
  currentDepth: number = 0,
): string[] {
  const lines: string[] = [];

  if (currentDepth > maxDepth) {
    return lines;
  }

  const indent = '  '.repeat(currentDepth);
  const relativePath = currentDepth === 0 ? '.' : dir.name;

  if (dir.subdirectoryCount > 0 || dir.fileCount > 0) {
    lines.push(`${indent}${relativePath}/`);
  }

  if (currentDepth < maxDepth) {
    for (const subDir of dir.subdirectories.slice(0, 10)) {
      lines.push(...generateDirectoryTree(subDir, rootPath, maxDepth, currentDepth + 1));
    }

    if (dir.subdirectories.length > 10) {
      lines.push(`${indent}  ... ${dir.subdirectories.length - 10} more directories`);
    }

    const importantFiles = dir.files
      .filter((f) =>
        [
          'package.json',
          'tsconfig.json',
          'README.md',
          'index.ts',
          'index.js',
          'app.ts',
          'app.js',
        ].includes(f.name),
      )
      .slice(0, 5);

    for (const file of importantFiles) {
      lines.push(`${indent}  ${file.name}`);
    }
  }

  return lines;
}
