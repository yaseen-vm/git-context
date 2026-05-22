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
    const sourceDir = path.dirname(sourceFile.getFilePath());

    // Handle relative imports (./foo, ../bar)
    if (moduleSpecifier.startsWith('.')) {
      return this.resolveRelativeImport(moduleSpecifier, sourceDir);
    }

    // Handle absolute imports (tsconfig paths like @/foo)
    if (this.isPathAlias(moduleSpecifier)) {
      return this.resolvePathAlias(moduleSpecifier);
    }

    // Handle absolute path imports
    if (moduleSpecifier.startsWith('/')) {
      return this.resolveAbsoluteImport(moduleSpecifier);
    }

    // External module (node_modules)
    return null;
  }

  private resolveRelativeImport(moduleSpecifier: string, sourceDir: string): string | null {
    const resolved = path.resolve(sourceDir, moduleSpecifier);
    const relativePath = path.relative(this.repoPath, resolved).replace(/\\/g, '/');
    return this.resolveFilePath(relativePath);
  }

  private resolveAbsoluteImport(moduleSpecifier: string): string | null {
    const relativePath = path.relative(this.repoPath, moduleSpecifier).replace(/\\/g, '/');
    return this.resolveFilePath(relativePath);
  }

  private isPathAlias(moduleSpecifier: string): boolean {
    // Check if the project has tsconfig with paths
    if (!this.hasTsConfig) return false;

    try {
      const tsConfigPath = path.join(this.repoPath, 'tsconfig.json');
      const jsConfigPath = path.join(this.repoPath, 'jsconfig.json');

      let configPath = tsConfigPath;
      if (!require('fs').existsSync(tsConfigPath) && require('fs').existsSync(jsConfigPath)) {
        configPath = jsConfigPath;
      }

      if (!require('fs').existsSync(configPath)) return false;

      const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
      const paths = config.compilerOptions?.paths;

      if (!paths) return false;

      // Check if moduleSpecifier matches any path alias
      for (const alias of Object.keys(paths)) {
        const prefix = alias.replace(/\*$/, '');
        if (moduleSpecifier.startsWith(prefix)) {
          return true;
        }
      }
    } catch {
      return false;
    }

    return false;
  }

  private resolvePathAlias(moduleSpecifier: string): string | null {
    try {
      const tsConfigPath = path.join(this.repoPath, 'tsconfig.json');
      const jsConfigPath = path.join(this.repoPath, 'jsconfig.json');

      let configPath = tsConfigPath;
      if (!require('fs').existsSync(tsConfigPath) && require('fs').existsSync(jsConfigPath)) {
        configPath = jsConfigPath;
      }

      if (!require('fs').existsSync(configPath)) return null;

      const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
      const paths = config.compilerOptions?.paths;

      if (!paths) return null;

      for (const [alias, targets] of Object.entries(paths)) {
        const prefix = alias.replace(/\*$/, '');
        if (moduleSpecifier.startsWith(prefix)) {
          const suffix = moduleSpecifier.slice(prefix.length);
          const target = (targets as string[])[0];
          if (target) {
            const resolvedPath = target.replace(/\*$/, suffix);
            const relativePath = path
              .relative(this.repoPath, path.resolve(this.repoPath, resolvedPath))
              .replace(/\\/g, '/');
            return this.resolveFilePath(relativePath);
          }
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private resolveFilePath(relativePath: string): string | null {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    const indexFiles = extensions.map((ext) => `/index${ext}`);

    // If path already has extension, check if it exists
    if (path.extname(relativePath)) {
      if (this.fileExists(relativePath)) {
        return relativePath;
      }
      return null;
    }

    // Try adding extensions
    for (const ext of extensions) {
      const withExt = `${relativePath}${ext}`;
      if (this.fileExists(withExt)) {
        return withExt;
      }
    }

    // Try index files
    for (const indexFile of indexFiles) {
      const indexPath = `${relativePath}${indexFile}`;
      if (this.fileExists(indexPath)) {
        return indexPath;
      }
    }

    return null;
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
