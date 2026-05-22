import { Project, SourceFile } from 'ts-morph';
import path from 'path';
import fs from 'fs';

export interface ProjectLoaderResult {
  project: Project;
  hasTsConfig: boolean;
}

export function loadProject(repoPath: string): ProjectLoaderResult {
  const tsConfigPath = findTsConfig(repoPath);

  if (tsConfigPath) {
    const project = new Project({
      tsConfigFilePath: tsConfigPath,
      skipAddingFilesFromTsConfig: true,
    });
    return { project, hasTsConfig: true };
  }

  const project = new Project({
    compilerOptions: {
      target: 2, // ES2022
      module: 99, // ESNext
      moduleResolution: 2, // Node
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true,
    },
    skipAddingFilesFromTsConfig: true,
  });

  return { project, hasTsConfig: false };
}

function findTsConfig(repoPath: string): string | null {
  const candidates = ['tsconfig.json', 'jsconfig.json'];

  for (const candidate of candidates) {
    const fullPath = path.join(repoPath, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

export interface SourceFileMapping {
  sourceFile: SourceFile;
  relativePath: string;
}

export function addSourceFiles(
  project: Project,
  repoPath: string,
  filePaths: string[],
): SourceFileMapping[] {
  const sourceFiles: SourceFileMapping[] = [];
  const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  for (const filePath of filePaths) {
    const ext = path.extname(filePath);
    if (!supportedExtensions.includes(ext)) continue;

    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath);

    try {
      if (!fs.existsSync(absolutePath)) continue;

      const content = fs.readFileSync(absolutePath, 'utf-8');
      const relativePath = path.relative(repoPath, absolutePath).replace(/\\/g, '/');

      // Use absolute path for ts-morph to ensure correct resolution
      const sourceFile = project.createSourceFile(absolutePath, content, {
        overwrite: true,
      });
      sourceFiles.push({ sourceFile, relativePath });
    } catch {
      continue;
    }
  }

  return sourceFiles;
}
