export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  isDirectory: boolean;
  children?: FileInfo[];
}

export interface DirectoryInfo {
  path: string;
  name: string;
  fileCount: number;
  subdirectoryCount: number;
  files: FileInfo[];
  subdirectories: DirectoryInfo[];
  depth: number;
}

export interface ModuleBoundary {
  path: string;
  name: string;
  type: 'module' | 'package' | 'app' | 'workspace';
  entryPoints: string[];
  fileCount: number;
}

export interface EntryPoint {
  path: string;
  name: string;
  type: 'main' | 'index' | 'app' | 'server' | 'cli';
}

export interface FolderStructure {
  rootPath: string;
  tree: DirectoryInfo;
  moduleBoundaries: ModuleBoundary[];
  entryPoints: EntryPoint[];
  totalFiles: number;
  totalDirectories: number;
  maxDepth: number;
}

export interface ArchitectureAnalysisResult {
  folderStructure: FolderStructure;
  moduleBoundaries: ModuleBoundary[];
  entryPoints: EntryPoint[];
  summary: string[];
}
