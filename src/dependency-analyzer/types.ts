export interface ImportInfo {
  moduleSpecifier: string;
  resolvedPath: string | null;
  isTypeOnly: boolean;
  namedImports: string[];
  defaultImport: string | null;
  namespaceImport: string | null;
}

export interface FileAnalysis {
  filePath: string;
  imports: ImportInfo[];
  exports: string[];
  reExports: ReExportInfo[];
}

export interface ReExportInfo {
  moduleSpecifier: string;
  namedExports: string[];
  isWildcard: boolean;
}

export interface DependencyGraph {
  files: Map<string, FileAnalysis>;
  importers: Map<string, Set<string>>;
  imports: Map<string, Set<string>>;
}

export interface RelatedFile {
  path: string;
  relation: 'import' | 'importer' | 'test' | 'config' | 'utility' | 'barrel';
  hops: number;
  snippet?: string;
  reason: string;
}
