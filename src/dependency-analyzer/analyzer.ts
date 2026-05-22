import { Project, SourceFile } from 'ts-morph';
import path from 'path';
import { loadProject, addSourceFiles } from './project-loader.js';
import type {
  ImportInfo,
  FileAnalysis,
  ReExportInfo,
  DependencyGraph,
  RelatedFile,
} from './types.js';

export class DependencyAnalyzer {
  private project: Project;
  private repoPath: string;
  private hasTsConfig: boolean;
  private graph: DependencyGraph;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    const result = loadProject(repoPath);
    this.project = result.project;
    this.hasTsConfig = result.hasTsConfig;
    this.graph = {
      files: new Map(),
      importers: new Map(),
      imports: new Map(),
    };
  }

  isReady(): boolean {
    return this.project !== null;
  }

  hasTypeScriptConfig(): boolean {
    return this.hasTsConfig;
  }

  analyzeFiles(filePaths: string[]): FileAnalysis[] {
    const sourceFileMappings = addSourceFiles(this.project, this.repoPath, filePaths);
    const analyses: FileAnalysis[] = [];

    for (const { sourceFile, relativePath } of sourceFileMappings) {
      const analysis = this.analyzeSourceFile(sourceFile, relativePath);
      analyses.push(analysis);
      this.graph.files.set(analysis.filePath, analysis);
      this.updateGraph(analysis);
    }

    return analyses;
  }

  private analyzeSourceFile(sourceFile: SourceFile, relativePath: string): FileAnalysis {
    const imports = this.extractImports(sourceFile);
    const exports = this.extractExports(sourceFile);
    const reExports = this.extractReExports(sourceFile);

    return {
      filePath: relativePath,
      imports,
      exports,
      reExports,
    };
  }

  private extractImports(sourceFile: SourceFile): ImportInfo[] {
    const importInfos: ImportInfo[] = [];

    for (const importDecl of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      const resolvedPath = this.resolveModule(moduleSpecifier, sourceFile);
      const namedImports = importDecl.getNamedImports().map((n) => n.getName());
      const defaultImport = importDecl.getDefaultImport()?.getText() || null;
      const namespaceImport = importDecl.getNamespaceImport()?.getText() || null;
      const isTypeOnly = importDecl.isTypeOnly();

      importInfos.push({
        moduleSpecifier,
        resolvedPath,
        isTypeOnly,
        namedImports,
        defaultImport,
        namespaceImport,
      });
    }

    return importInfos;
  }

  private extractExports(sourceFile: SourceFile): string[] {
    const exportNames: string[] = [];

    for (const exportDecl of sourceFile.getExportDeclarations()) {
      for (const namedExport of exportDecl.getNamedExports()) {
        exportNames.push(namedExport.getName());
      }
    }

    for (const exportAssignment of sourceFile.getExportAssignments()) {
      exportNames.push('default');
    }

    const exportedDecls = sourceFile.getExportedDeclarations();
    for (const [name] of exportedDecls) {
      if (!exportNames.includes(name)) {
        exportNames.push(name);
      }
    }

    return exportNames;
  }

  private extractReExports(sourceFile: SourceFile): ReExportInfo[] {
    const reExports: ReExportInfo[] = [];

    for (const exportDecl of sourceFile.getExportDeclarations()) {
      const moduleSpecifier = exportDecl.getModuleSpecifier();
      if (!moduleSpecifier) continue;

      const namedExports = exportDecl.getNamedExports().map((n) => n.getName());
      const isWildcard = exportDecl.isNamespaceExport();

      reExports.push({
        moduleSpecifier: moduleSpecifier.getLiteralValue(),
        namedExports,
        isWildcard,
      });
    }

    return reExports;
  }

  private resolveModule(moduleSpecifier: string, sourceFile: SourceFile): string | null {
    if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
      return null;
    }

    const sourceDir = path.dirname(sourceFile.getFilePath());
    const resolved = path.resolve(sourceDir, moduleSpecifier);
    const relativePath = path.relative(this.repoPath, resolved).replace(/\\/g, '/');

    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    const indexFiles = extensions.map((ext) => `/index${ext}`);

    if (path.extname(relativePath)) {
      return relativePath;
    }

    for (const ext of extensions) {
      const withExt = `${relativePath}${ext}`;
      if (this.fileExists(withExt)) {
        return withExt;
      }
    }

    for (const indexFile of indexFiles) {
      const indexPath = `${relativePath}${indexFile}`;
      if (this.fileExists(indexPath)) {
        return indexPath;
      }
    }

    return relativePath;
  }

  private fileExists(filePath: string): boolean {
    try {
      const absolutePath = path.resolve(this.repoPath, filePath);
      return require('fs').existsSync(absolutePath);
    } catch {
      return false;
    }
  }

  private updateGraph(analysis: FileAnalysis): void {
    const { filePath, imports } = analysis;

    if (!this.graph.imports.has(filePath)) {
      this.graph.imports.set(filePath, new Set());
    }

    for (const imp of imports) {
      if (!imp.resolvedPath) continue;

      this.graph.imports.get(filePath)!.add(imp.resolvedPath);

      if (!this.graph.importers.has(imp.resolvedPath)) {
        this.graph.importers.set(imp.resolvedPath, new Set());
      }
      this.graph.importers.get(imp.resolvedPath)!.add(filePath);
    }
  }

  getGraph(): DependencyGraph {
    return this.graph;
  }

  getImportsOf(filePath: string): Set<string> {
    return this.graph.imports.get(filePath) || new Set();
  }

  getImportersOf(filePath: string): Set<string> {
    return this.graph.importers.get(filePath) || new Set();
  }

  findRelatedFiles(filePath: string, maxHops: number = 2): RelatedFile[] {
    const visited = new Map<string, number>();
    const related: RelatedFile[] = [];
    const queue: Array<{ file: string; hops: number }> = [{ file: filePath, hops: 0 }];

    while (queue.length > 0) {
      const { file, hops } = queue.shift()!;

      if (hops > maxHops) continue;
      if (visited.has(file) && visited.get(file)! <= hops) continue;

      visited.set(file, hops);

      if (file !== filePath) {
        related.push({
          path: file,
          relation: 'import',
          hops,
        });
      }

      const imports = this.getImportsOf(file);
      const importers = this.getImportersOf(file);

      for (const imp of imports) {
        if (!visited.has(imp)) {
          queue.push({ file: imp, hops: hops + 1 });
        }
      }

      for (const importer of importers) {
        if (!visited.has(importer)) {
          queue.push({ file: importer, hops: hops + 1 });
        }
      }
    }

    return related;
  }
}
