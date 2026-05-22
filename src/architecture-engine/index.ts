import { analyzeFolderStructure } from './folder-scanner.js';
import { analyzeDocumentation } from './documentation-parser.js';
import { analyzeServiceRelationships, getServiceDependencyGraph } from './service-mapper.js';
import { detectPatterns } from './pattern-detector.js';
import {
  summarizeFolderStructure,
  summarizeModuleBoundaries,
  summarizeEntryPoints,
  generateDirectoryTree,
} from './summarizer.js';
import type {
  ModuleBoundary,
  EntryPoint,
  FolderStructure,
  ArchitectureAnalysisResult,
} from './types.js';
import type { DocumentationAnalysis } from './documentation-parser.js';
import type { ServiceMap } from './service-mapper.js';
import type { PatternDetectionResult } from './pattern-detector.js';

export class ArchitectureEngine {
  private repoPath: string;
  private cachedFolderStructure: FolderStructure | null = null;
  private cachedDocumentation: DocumentationAnalysis | null = null;
  private cachedServiceMap: ServiceMap | null = null;
  private cachedPatterns: PatternDetectionResult | null = null;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  invalidateCache(): void {
    this.cachedFolderStructure = null;
    this.cachedDocumentation = null;
    this.cachedServiceMap = null;
    this.cachedPatterns = null;
  }

  async analyze(): Promise<ArchitectureAnalysisResult> {
    const folderStructure = await this.getFolderStructure();
    const documentation = this.getDocumentation();
    const serviceMap = this.getServiceMap();
    const patterns = this.getPatterns();
    const summary: string[] = [];

    summary.push('## Folder Structure');
    summary.push(...summarizeFolderStructure(folderStructure));

    summary.push('');
    summary.push('## Module Boundaries');
    summary.push(...summarizeModuleBoundaries(folderStructure.moduleBoundaries, this.repoPath));

    summary.push('');
    summary.push('## Entry Points');
    summary.push(...summarizeEntryPoints(folderStructure.entryPoints, this.repoPath));

    summary.push('');
    summary.push('## Documentation');
    summary.push(...documentation.summary);

    summary.push('');
    summary.push('## Service Relationships');
    summary.push(...serviceMap.summary);

    summary.push('');
    summary.push('## Frameworks and Patterns');
    summary.push(...patterns.summary);

    return {
      folderStructure,
      moduleBoundaries: folderStructure.moduleBoundaries,
      entryPoints: folderStructure.entryPoints,
      summary,
    };
  }

  async getFolderStructure(): Promise<FolderStructure> {
    if (!this.cachedFolderStructure) {
      this.cachedFolderStructure = await analyzeFolderStructure(this.repoPath);
    }
    return this.cachedFolderStructure;
  }

  async getModuleBoundaries(): Promise<ModuleBoundary[]> {
    const structure = await this.getFolderStructure();
    return structure.moduleBoundaries;
  }

  async getEntryPoints(): Promise<EntryPoint[]> {
    const structure = await this.getFolderStructure();
    return structure.entryPoints;
  }

  async getDirectoryTree(maxDepth: number = 3): Promise<string[]> {
    const structure = await this.getFolderStructure();
    return generateDirectoryTree(structure.tree, this.repoPath, maxDepth);
  }

  getDocumentation(): DocumentationAnalysis {
    if (!this.cachedDocumentation) {
      this.cachedDocumentation = analyzeDocumentation(this.repoPath);
    }
    return this.cachedDocumentation;
  }

  getServiceMap(): ServiceMap {
    if (!this.cachedServiceMap) {
      this.cachedServiceMap = analyzeServiceRelationships(this.repoPath);
    }
    return this.cachedServiceMap;
  }

  getServiceDependencyGraph(): string[] {
    const serviceMap = this.getServiceMap();
    return getServiceDependencyGraph(serviceMap.services);
  }

  getPatterns(): PatternDetectionResult {
    if (!this.cachedPatterns) {
      this.cachedPatterns = detectPatterns(this.repoPath);
    }
    return this.cachedPatterns;
  }

  async getSummary(): Promise<string[]> {
    const result = await this.analyze();
    return result.summary;
  }
}

export { analyzeFolderStructure } from './folder-scanner.js';
export {
  analyzeDocumentation,
  findDocumentationFiles,
  parseDocumentationFile,
} from './documentation-parser.js';
export {
  summarizeFolderStructure,
  summarizeModuleBoundaries,
  summarizeEntryPoints,
  generateDirectoryTree,
} from './summarizer.js';
export type {
  FileInfo,
  DirectoryInfo,
  ModuleBoundary,
  EntryPoint,
  FolderStructure,
  ArchitectureAnalysisResult,
} from './types.js';
export type {
  DocumentationFile,
  DocumentationSection,
  DocumentationAnalysis,
} from './documentation-parser.js';
export { analyzeServiceRelationships, getServiceDependencyGraph } from './service-mapper.js';
export type { Service, ServiceRelationship, ServiceMap } from './service-mapper.js';
export { detectPatterns } from './pattern-detector.js';
export type {
  FrameworkDetection,
  ArchitecturePattern,
  StateManagementPattern,
  PatternDetectionResult,
} from './pattern-detector.js';
