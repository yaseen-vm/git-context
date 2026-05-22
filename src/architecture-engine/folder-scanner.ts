import fs from 'fs';
import path from 'path';
import type {
  FileInfo,
  DirectoryInfo,
  FolderStructure,
  ModuleBoundary,
  EntryPoint,
} from './types.js';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  '.cache',
  '.temp',
  '.tmp',
  '__pycache__',
  '.venv',
  'vendor',
]);

const ENTRY_POINT_NAMES = new Set([
  'index.ts',
  'index.js',
  'index.mjs',
  'index.cjs',
  'main.ts',
  'main.js',
  'app.ts',
  'app.js',
  'server.ts',
  'server.js',
  'cli.ts',
  'cli.js',
]);

const MODULE_BOUNDARY_INDICATORS = ['package.json', 'tsconfig.json', 'jsconfig.json'];

function shouldIgnoreDir(dirName: string): boolean {
  return IGNORE_DIRS.has(dirName) || dirName.startsWith('.');
}

function getEntryPointType(name: string): EntryPoint['type'] | null {
  if (name.startsWith('index.')) return 'index';
  if (name.startsWith('main.')) return 'main';
  if (name.startsWith('app.')) return 'app';
  if (name.startsWith('server.')) return 'server';
  if (name.startsWith('cli.')) return 'cli';
  return null;
}

export function scanDirectory(
  dirPath: string,
  maxDepth: number = 10,
  currentDepth: number = 0,
): DirectoryInfo | null {
  if (currentDepth > maxDepth) return null;

  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) return null;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files: FileInfo[] = [];
    const subdirectories: DirectoryInfo[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!shouldIgnoreDir(entry.name)) {
          const subDir = scanDirectory(fullPath, maxDepth, currentDepth + 1);
          if (subDir) {
            subdirectories.push(subDir);
          }
        }
      } else {
        try {
          const fileStats = fs.statSync(fullPath);
          files.push({
            path: fullPath,
            name: entry.name,
            extension: path.extname(entry.name).toLowerCase(),
            size: fileStats.size,
            isDirectory: false,
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }

    return {
      path: dirPath,
      name: path.basename(dirPath),
      fileCount: files.length,
      subdirectoryCount: subdirectories.length,
      files,
      subdirectories,
      depth: currentDepth,
    };
  } catch {
    return null;
  }
}

export function findModuleBoundaries(dirInfo: DirectoryInfo, rootPath: string): ModuleBoundary[] {
  const boundaries: ModuleBoundary[] = [];

  function traverse(dir: DirectoryInfo) {
    const hasIndicator = MODULE_BOUNDARY_INDICATORS.some((indicator) =>
      dir.files.some((f) => f.name === indicator),
    );

    if (hasIndicator && dir.path !== rootPath) {
      const entryPoints = dir.files.filter((f) => ENTRY_POINT_NAMES.has(f.name)).map((f) => f.path);

      const packageJson = dir.files.find((f) => f.name === 'package.json');
      let type: ModuleBoundary['type'] = 'module';

      if (packageJson) {
        try {
          const pkgContent = JSON.parse(fs.readFileSync(packageJson.path, 'utf-8'));
          if (pkgContent.workspaces) {
            type = 'workspace';
          }
        } catch {
          // ignore parse errors
        }
      }

      const parentDir = path.basename(path.dirname(dir.path));
      if (parentDir === 'packages') {
        type = 'package';
      } else if (parentDir === 'apps') {
        type = 'app';
      }

      boundaries.push({
        path: dir.path,
        name: dir.name,
        type,
        entryPoints,
        fileCount: dir.fileCount,
      });
    }

    for (const subDir of dir.subdirectories) {
      traverse(subDir);
    }
  }

  traverse(dirInfo);
  return boundaries;
}

export function findEntryPoints(dirInfo: DirectoryInfo): EntryPoint[] {
  const entryPoints: EntryPoint[] = [];

  function traverse(dir: DirectoryInfo) {
    for (const file of dir.files) {
      const type = getEntryPointType(file.name);
      if (type) {
        entryPoints.push({
          path: file.path,
          name: file.name,
          type,
        });
      }
    }

    for (const subDir of dir.subdirectories) {
      traverse(subDir);
    }
  }

  traverse(dirInfo);
  return entryPoints;
}

function calculateStats(dirInfo: DirectoryInfo): {
  totalFiles: number;
  totalDirectories: number;
  maxDepth: number;
} {
  let totalFiles = dirInfo.fileCount;
  let totalDirectories = 1;
  let maxDepth = dirInfo.depth;

  for (const subDir of dirInfo.subdirectories) {
    const subStats = calculateStats(subDir);
    totalFiles += subStats.totalFiles;
    totalDirectories += subStats.totalDirectories;
    maxDepth = Math.max(maxDepth, subStats.maxDepth);
  }

  return { totalFiles, totalDirectories, maxDepth };
}

export function analyzeFolderStructure(repoPath: string): FolderStructure {
  const rootDir = scanDirectory(repoPath);

  if (!rootDir) {
    return {
      rootPath: repoPath,
      tree: {
        path: repoPath,
        name: path.basename(repoPath),
        fileCount: 0,
        subdirectoryCount: 0,
        files: [],
        subdirectories: [],
        depth: 0,
      },
      moduleBoundaries: [],
      entryPoints: [],
      totalFiles: 0,
      totalDirectories: 0,
      maxDepth: 0,
    };
  }

  const moduleBoundaries = findModuleBoundaries(rootDir, repoPath);
  const entryPoints = findEntryPoints(rootDir);
  const stats = calculateStats(rootDir);

  return {
    rootPath: repoPath,
    tree: rootDir,
    moduleBoundaries,
    entryPoints,
    ...stats,
  };
}
