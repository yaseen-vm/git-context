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

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  analyze(): ArchitectureAnalysisResult {
    const folderStructure = analyzeFolderStructure(this.repoPath);
    const documentation = analyzeDocumentation(this.repoPath);
    const serviceMap = analyzeServiceRelationships(this.repoPath);
    const patterns = detectPatterns(this.repoPath);
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

  getFolderStructure(): FolderStructure {
    return analyzeFolderStructure(this.repoPath);
  }

  getModuleBoundaries(): ModuleBoundary[] {
    const structure = analyzeFolderStructure(this.repoPath);
    return structure.moduleBoundaries;
  }

  getEntryPoints(): EntryPoint[] {
    const structure = analyzeFolderStructure(this.repoPath);
    return structure.entryPoints;
  }

  getDirectoryTree(maxDepth: number = 3): string[] {
    const structure = analyzeFolderStructure(this.repoPath);
    return generateDirectoryTree(structure.tree, this.repoPath, maxDepth);
  }

  getDocumentation(): DocumentationAnalysis {
    return analyzeDocumentation(this.repoPath);
  }

  getServiceMap(): ServiceMap {
    return analyzeServiceRelationships(this.repoPath);
  }

  getServiceDependencyGraph(): string[] {
    const serviceMap = analyzeServiceRelationships(this.repoPath);
    return getServiceDependencyGraph(serviceMap.services);
  }

  getPatterns(): PatternDetectionResult {
    return detectPatterns(this.repoPath);
  }

  getSummary(): string[] {
    const result = this.analyze();
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
