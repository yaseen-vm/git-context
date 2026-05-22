import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ArchitectureEngine } from '../../src/architecture-engine/index.js';
import {
  scanDirectory,
  findModuleBoundaries,
  findEntryPoints,
  analyzeFolderStructure,
} from '../../src/architecture-engine/folder-scanner.js';
import {
  summarizeFolderStructure,
  summarizeModuleBoundaries,
  summarizeEntryPoints,
} from '../../src/architecture-engine/summarizer.js';
import {
  findDocumentationFiles,
  parseDocumentationFile,
  analyzeDocumentation,
} from '../../src/architecture-engine/documentation-parser.js';
import {
  analyzeServiceRelationships,
  getServiceDependencyGraph,
} from '../../src/architecture-engine/service-mapper.js';
import { detectPatterns } from '../../src/architecture-engine/pattern-detector.js';

describe('ArchitectureEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-engine-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Issue #21: Folder structure analysis', () => {
    describe('Directory scanning', () => {
      it('should scan an empty directory', async () => {
        const result = await scanDirectory(tmpDir);
        expect(result).not.toBeNull();
        expect(result!.path).toBe(tmpDir);
        expect(result!.files).toHaveLength(0);
        expect(result!.subdirectories).toHaveLength(0);
        expect(result!.fileCount).toBe(0);
        expect(result!.subdirectoryCount).toBe(0);
      });

      it('should scan directory with files', async () => {
        fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'export {};');
        fs.writeFileSync(path.join(tmpDir, 'utils.ts'), 'export {};');
        fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');

        const result = await scanDirectory(tmpDir);
        expect(result).not.toBeNull();
        expect(result!.files).toHaveLength(3);
        expect(result!.fileCount).toBe(3);
      });

      it('should scan directory with subdirectories', async () => {
        fs.mkdirSync(path.join(tmpDir, 'src'));
        fs.mkdirSync(path.join(tmpDir, 'tests'));
        fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export {};');

        const result = await scanDirectory(tmpDir);
        expect(result).not.toBeNull();
        expect(result!.subdirectories).toHaveLength(2);
        expect(result!.subdirectoryCount).toBe(2);
      });

      it('should ignore node_modules', async () => {
        fs.mkdirSync(path.join(tmpDir, 'node_modules'));
        fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg.js'), '');

        const result = await scanDirectory(tmpDir);
        expect(result).not.toBeNull();
        expect(result!.subdirectories).toHaveLength(0);
      });

      it('should ignore .git directory', async () => {
        fs.mkdirSync(path.join(tmpDir, '.git'));

        const result = await scanDirectory(tmpDir);
        expect(result).not.toBeNull();
        expect(result!.subdirectories).toHaveLength(0);
      });

      it('should ignore dist and build directories', async () => {
        fs.mkdirSync(path.join(tmpDir, 'dist'));
        fs.mkdirSync(path.join(tmpDir, 'build'));

        const result = await scanDirectory(tmpDir);
        expect(result).not.toBeNull();
        expect(result!.subdirectories).toHaveLength(0);
      });

      it('should track file extensions', async () => {
        fs.writeFileSync(path.join(tmpDir, 'index.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'utils.js'), '');
        fs.writeFileSync(path.join(tmpDir, 'style.css'), '');

        const result = await scanDirectory(tmpDir);
        expect(result).not.toBeNull();
        const extensions = result!.files.map((f) => f.extension).sort();
        expect(extensions).toContain('.ts');
        expect(extensions).toContain('.js');
        expect(extensions).toContain('.css');
      });

      it('should track file sizes', async () => {
        fs.writeFileSync(path.join(tmpDir, 'small.txt'), 'hi');
        fs.writeFileSync(path.join(tmpDir, 'large.txt'), 'a'.repeat(1000));

        const result = await scanDirectory(tmpDir);
        expect(result).not.toBeNull();
        const smallFile = result!.files.find((f) => f.name === 'small.txt');
        const largeFile = result!.files.find((f) => f.name === 'large.txt');
        expect(smallFile!.size).toBe(2);
        expect(largeFile!.size).toBe(1000);
      });

      it('should handle nested directory structure', async () => {
        fs.mkdirSync(path.join(tmpDir, 'src', 'modules', 'auth'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'src', 'modules', 'auth', 'login.ts'), '');

        const result = await scanDirectory(tmpDir);
        expect(result).not.toBeNull();
        expect(result!.subdirectories).toHaveLength(1);

        const srcDir = result!.subdirectories[0];
        expect(srcDir.name).toBe('src');
        expect(srcDir.depth).toBe(1);

        const modulesDir = srcDir.subdirectories[0];
        expect(modulesDir.name).toBe('modules');
        expect(modulesDir.depth).toBe(2);
      });
    });

    describe('Module boundary detection', () => {
      it('should detect module with package.json', async () => {
        fs.mkdirSync(path.join(tmpDir, 'packages', 'core'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'packages', 'core', 'package.json'), '{}');
        fs.writeFileSync(path.join(tmpDir, 'packages', 'core', 'index.ts'), '');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const boundaries = findModuleBoundaries(rootDir!, tmpDir);
        expect(boundaries).toHaveLength(1);
        expect(boundaries[0].name).toBe('core');
        expect(boundaries[0].type).toBe('package');
      });

      it('should detect module with tsconfig.json', async () => {
        fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'src', 'utils', 'tsconfig.json'), '{}');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const boundaries = findModuleBoundaries(rootDir!, tmpDir);
        expect(boundaries).toHaveLength(1);
        expect(boundaries[0].name).toBe('utils');
        expect(boundaries[0].type).toBe('module');
      });

      it('should detect entry points in modules', async () => {
        fs.mkdirSync(path.join(tmpDir, 'packages', 'core'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'packages', 'core', 'package.json'), '{}');
        fs.writeFileSync(path.join(tmpDir, 'packages', 'core', 'index.ts'), 'export {};');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const boundaries = findModuleBoundaries(rootDir!, tmpDir);
        expect(boundaries).toHaveLength(1);
        expect(boundaries[0].entryPoints).toHaveLength(1);
      });

      it('should not detect root as module boundary', async () => {
        fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
        fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const boundaries = findModuleBoundaries(rootDir!, tmpDir);
        expect(boundaries).toHaveLength(0);
      });

      it('should detect multiple module boundaries', async () => {
        fs.mkdirSync(path.join(tmpDir, 'packages', 'core'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir, 'packages', 'utils'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'packages', 'core', 'package.json'), '{}');
        fs.writeFileSync(path.join(tmpDir, 'packages', 'utils', 'package.json'), '{}');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const boundaries = findModuleBoundaries(rootDir!, tmpDir);
        expect(boundaries).toHaveLength(2);
      });
    });

    describe('Entry point detection', () => {
      it('should detect index.ts entry point', async () => {
        fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'export {};');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const entryPoints = findEntryPoints(rootDir!);
        expect(entryPoints).toHaveLength(1);
        expect(entryPoints[0].name).toBe('index.ts');
        expect(entryPoints[0].type).toBe('index');
      });

      it('should detect main.ts entry point', async () => {
        fs.writeFileSync(path.join(tmpDir, 'main.ts'), '');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const entryPoints = findEntryPoints(rootDir!);
        expect(entryPoints).toHaveLength(1);
        expect(entryPoints[0].type).toBe('main');
      });

      it('should detect app.ts entry point', async () => {
        fs.writeFileSync(path.join(tmpDir, 'app.ts'), '');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const entryPoints = findEntryPoints(rootDir!);
        expect(entryPoints).toHaveLength(1);
        expect(entryPoints[0].type).toBe('app');
      });

      it('should detect server.ts entry point', async () => {
        fs.writeFileSync(path.join(tmpDir, 'server.ts'), '');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const entryPoints = findEntryPoints(rootDir!);
        expect(entryPoints).toHaveLength(1);
        expect(entryPoints[0].type).toBe('server');
      });

      it('should detect cli.ts entry point', async () => {
        fs.writeFileSync(path.join(tmpDir, 'cli.ts'), '');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const entryPoints = findEntryPoints(rootDir!);
        expect(entryPoints).toHaveLength(1);
        expect(entryPoints[0].type).toBe('cli');
      });

      it('should detect multiple entry points', async () => {
        fs.writeFileSync(path.join(tmpDir, 'index.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'cli.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'server.ts'), '');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const entryPoints = findEntryPoints(rootDir!);
        expect(entryPoints).toHaveLength(3);
      });

      it('should detect entry points in subdirectories', async () => {
        fs.mkdirSync(path.join(tmpDir, 'src'));
        fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'src', 'app.ts'), '');

        const rootDir = await scanDirectory(tmpDir);
        expect(rootDir).not.toBeNull();

        const entryPoints = findEntryPoints(rootDir!);
        expect(entryPoints).toHaveLength(2);
      });
    });

    describe('Full folder structure analysis', () => {
      it('should analyze empty repository', async () => {
        const structure = await analyzeFolderStructure(tmpDir);

        expect(structure.rootPath).toBe(tmpDir);
        expect(structure.totalFiles).toBe(0);
        expect(structure.totalDirectories).toBe(1);
        expect(structure.moduleBoundaries).toHaveLength(0);
        expect(structure.entryPoints).toHaveLength(0);
      });

      it('should analyze repository with src structure', async () => {
        fs.mkdirSync(path.join(tmpDir, 'src', 'modules'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
        fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
        fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'src', 'modules', 'auth.ts'), '');

        const structure = await analyzeFolderStructure(tmpDir);

        expect(structure.totalFiles).toBe(4);
        expect(structure.totalDirectories).toBe(3);
        expect(structure.entryPoints).toHaveLength(1);
      });

      it('should calculate max depth correctly', async () => {
        fs.mkdirSync(path.join(tmpDir, 'a', 'b', 'c', 'd'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'a', 'b', 'c', 'd', 'deep.ts'), '');

        const structure = await analyzeFolderStructure(tmpDir);

        expect(structure.maxDepth).toBe(4);
      });

      it('should analyze monorepo structure', async () => {
        fs.mkdirSync(path.join(tmpDir, 'packages', 'core'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir, 'packages', 'utils'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir, 'apps', 'web'), { recursive: true });
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({ workspaces: ['packages/*', 'apps/*'] }),
        );
        fs.writeFileSync(path.join(tmpDir, 'packages', 'core', 'package.json'), '{}');
        fs.writeFileSync(path.join(tmpDir, 'packages', 'core', 'index.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'packages', 'utils', 'package.json'), '{}');
        fs.writeFileSync(path.join(tmpDir, 'packages', 'utils', 'index.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'apps', 'web', 'package.json'), '{}');
        fs.writeFileSync(path.join(tmpDir, 'apps', 'web', 'app.ts'), '');

        const structure = await analyzeFolderStructure(tmpDir);

        expect(structure.moduleBoundaries.length).toBeGreaterThanOrEqual(2);
        expect(structure.entryPoints.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe('ArchitectureEngine class', () => {
      it('should provide full analysis', async () => {
        fs.writeFileSync(path.join(tmpDir, 'index.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');

        const engine = new ArchitectureEngine(tmpDir);
        const result = await engine.analyze();

        expect(result.folderStructure).toBeDefined();
        expect(result.moduleBoundaries).toBeDefined();
        expect(result.entryPoints).toBeDefined();
        expect(result.summary.length).toBeGreaterThan(0);
      });

      it('should provide folder structure', async () => {
        fs.writeFileSync(path.join(tmpDir, 'index.ts'), '');

        const engine = new ArchitectureEngine(tmpDir);
        const structure = await engine.getFolderStructure();

        expect(structure.rootPath).toBe(tmpDir);
        expect(structure.totalFiles).toBe(1);
      });

      it('should provide module boundaries', async () => {
        fs.mkdirSync(path.join(tmpDir, 'packages', 'core'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'packages', 'core', 'package.json'), '{}');

        const engine = new ArchitectureEngine(tmpDir);
        const boundaries = await engine.getModuleBoundaries();

        expect(boundaries).toHaveLength(1);
        expect(boundaries[0].name).toBe('core');
      });

      it('should provide entry points', async () => {
        fs.writeFileSync(path.join(tmpDir, 'index.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'cli.ts'), '');

        const engine = new ArchitectureEngine(tmpDir);
        const entryPoints = await engine.getEntryPoints();

        expect(entryPoints).toHaveLength(2);
      });

      it('should provide directory tree', async () => {
        fs.mkdirSync(path.join(tmpDir, 'src'));
        fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');

        const engine = new ArchitectureEngine(tmpDir);
        const tree = await engine.getDirectoryTree();

        expect(tree.length).toBeGreaterThan(0);
        expect(tree[0]).toContain('.');
      });

      it('should provide summary', async () => {
        fs.writeFileSync(path.join(tmpDir, 'index.ts'), '');

        const engine = new ArchitectureEngine(tmpDir);
        const summary = await engine.getSummary();

        expect(summary.length).toBeGreaterThan(0);
        expect(summary.some((s) => s.includes('Total files'))).toBe(true);
      });
    });

    describe('Summarizers', () => {
      it('should summarize folder structure', async () => {
        fs.writeFileSync(path.join(tmpDir, 'index.ts'), '');

        const structure = await analyzeFolderStructure(tmpDir);
        const summary = summarizeFolderStructure(structure);

        expect(summary.some((s) => s.includes('Total files: 1'))).toBe(true);
        expect(summary.some((s) => s.includes('Total directories: 1'))).toBe(true);
      });

      it('should summarize empty module boundaries', () => {
        const summary = summarizeModuleBoundaries([], tmpDir);
        expect(summary).toContain('No module boundaries detected');
      });

      it('should summarize module boundaries', async () => {
        fs.mkdirSync(path.join(tmpDir, 'packages', 'core'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'packages', 'core', 'package.json'), '{}');

        const structure = await analyzeFolderStructure(tmpDir);
        const summary = summarizeModuleBoundaries(structure.moduleBoundaries, tmpDir);

        expect(summary.some((s) => s.includes('Found 1 module boundary'))).toBe(true);
        expect(summary.some((s) => s.includes('core'))).toBe(true);
      });

      it('should summarize empty entry points', () => {
        const summary = summarizeEntryPoints([], tmpDir);
        expect(summary).toContain('No entry points detected');
      });

      it('should summarize entry points', async () => {
        fs.writeFileSync(path.join(tmpDir, 'index.ts'), '');

        const structure = await analyzeFolderStructure(tmpDir);
        const summary = summarizeEntryPoints(structure.entryPoints, tmpDir);

        expect(summary.some((s) => s.includes('Found 1 entry point'))).toBe(true);
        expect(summary.some((s) => s.includes('index'))).toBe(true);
      });
    });
  });

  describe('Issue #22: Documentation parsing', () => {
    describe('Finding documentation files', () => {
      it('should find README.md', () => {
        fs.writeFileSync(path.join(tmpDir, 'README.md'), '# My Project');

        const files = findDocumentationFiles(tmpDir);
        expect(files).toHaveLength(1);
        expect(files[0]).toContain('README.md');
      });

      it('should find multiple documentation files', () => {
        fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Project');
        fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# Contributing');
        fs.writeFileSync(path.join(tmpDir, 'ARCHITECTURE.md'), '# Architecture');

        const files = findDocumentationFiles(tmpDir);
        expect(files).toHaveLength(3);
      });

      it('should find documentation in subdirectories', () => {
        fs.mkdirSync(path.join(tmpDir, 'docs'));
        fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Project');
        fs.writeFileSync(path.join(tmpDir, 'docs', 'guide.md'), '# Guide');

        const files = findDocumentationFiles(tmpDir);
        expect(files).toHaveLength(2);
      });

      it('should not find documentation in node_modules', () => {
        fs.mkdirSync(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg', 'README.md'), '');

        const files = findDocumentationFiles(tmpDir);
        expect(files).toHaveLength(0);
      });

      it('should find license files', () => {
        fs.writeFileSync(path.join(tmpDir, 'LICENSE'), 'MIT');

        const files = findDocumentationFiles(tmpDir);
        expect(files).toHaveLength(1);
      });
    });

    describe('Parsing documentation files', () => {
      it('should parse README with sections', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'README.md'),
          `# My Project

A great project.

## Installation

Run npm install.

## Usage

Use it like this.`,
        );

        const doc = parseDocumentationFile(path.join(tmpDir, 'README.md'));
        expect(doc).not.toBeNull();
        expect(doc!.name).toBe('README.md');
        expect(doc!.type).toBe('readme');
        expect(doc!.sections).toHaveLength(3);
        expect(doc!.sections[0].title).toBe('My Project');
        expect(doc!.sections[1].title).toBe('Installation');
        expect(doc!.sections[2].title).toBe('Usage');
      });

      it('should count words', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'README.md'),
          `# Project

This is a test project with some content.`,
        );

        const doc = parseDocumentationFile(path.join(tmpDir, 'README.md'));
        expect(doc).not.toBeNull();
        expect(doc!.wordCount).toBeGreaterThan(0);
      });

      it('should detect CONTRIBUTING type', () => {
        fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# How to contribute');

        const doc = parseDocumentationFile(path.join(tmpDir, 'CONTRIBUTING.md'));
        expect(doc).not.toBeNull();
        expect(doc!.type).toBe('contributing');
      });

      it('should detect ARCHITECTURE type', () => {
        fs.writeFileSync(path.join(tmpDir, 'ARCHITECTURE.md'), '# Architecture');

        const doc = parseDocumentationFile(path.join(tmpDir, 'ARCHITECTURE.md'));
        expect(doc).not.toBeNull();
        expect(doc!.type).toBe('architecture');
      });

      it('should return null for non-existent file', () => {
        const doc = parseDocumentationFile(path.join(tmpDir, 'nonexistent.md'));
        expect(doc).toBeNull();
      });
    });

    describe('Documentation analysis', () => {
      it('should extract project description from README', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'README.md'),
          `# My Project

A great tool for doing things.

## Features

- Feature 1
- Feature 2`,
        );

        const analysis = analyzeDocumentation(tmpDir);
        expect(analysis.projectDescription).toContain('A great tool');
      });

      it('should extract setup instructions', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'README.md'),
          `# Project

## Installation

npm install my-project

## Usage

Run the tool.`,
        );

        const analysis = analyzeDocumentation(tmpDir);
        expect(analysis.setupInstructions).toContain('npm install');
      });

      it('should extract key concepts', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'README.md'),
          `# Project

## Features

- Fast processing
- Easy to use
- Extensible`,
        );

        const analysis = analyzeDocumentation(tmpDir);
        expect(analysis.keyConcepts.length).toBeGreaterThan(0);
      });

      it('should provide summary', () => {
        fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Project\n\nA great project.');

        const analysis = analyzeDocumentation(tmpDir);
        expect(analysis.summary.length).toBeGreaterThan(0);
        expect(analysis.summary.some((s) => s.includes('Documentation files found'))).toBe(true);
      });

      it('should handle no documentation', () => {
        const analysis = analyzeDocumentation(tmpDir);
        expect(analysis.files).toHaveLength(0);
        expect(analysis.projectDescription).toBeNull();
      });
    });

    describe('ArchitectureEngine documentation integration', () => {
      it('should include documentation in analysis', () => {
        fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Project\n\nA test project.');

        const engine = new ArchitectureEngine(tmpDir);
        const docs = engine.getDocumentation();

        expect(docs.files).toHaveLength(1);
        expect(docs.projectDescription).toContain('A test project');
      });

      it('should include documentation in summary', async () => {
        fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Project');

        const engine = new ArchitectureEngine(tmpDir);
        const summary = await engine.getSummary();

        expect(summary.some((s) => s.includes('Documentation'))).toBe(true);
      });
    });
  });

  describe('Issue #23: Service relationship mapping', () => {
    describe('Service discovery', () => {
      it('should discover services directory', () => {
        fs.mkdirSync(path.join(tmpDir, 'services'));
        fs.writeFileSync(path.join(tmpDir, 'services', 'auth.ts'), 'export class Auth {}');

        const serviceMap = analyzeServiceRelationships(tmpDir);
        expect(serviceMap.services.has('services')).toBe(true);
        expect(serviceMap.services.get('services')!.type).toBe('service');
      });

      it('should discover controllers directory', () => {
        fs.mkdirSync(path.join(tmpDir, 'controllers'));
        fs.writeFileSync(
          path.join(tmpDir, 'controllers', 'user.ts'),
          'export class UserController {}',
        );

        const serviceMap = analyzeServiceRelationships(tmpDir);
        expect(serviceMap.services.has('controllers')).toBe(true);
        expect(serviceMap.services.get('controllers')!.type).toBe('controller');
      });

      it('should discover models directory', () => {
        fs.mkdirSync(path.join(tmpDir, 'models'));
        fs.writeFileSync(path.join(tmpDir, 'models', 'user.ts'), 'export interface User {}');

        const serviceMap = analyzeServiceRelationships(tmpDir);
        expect(serviceMap.services.has('models')).toBe(true);
        expect(serviceMap.services.get('models')!.type).toBe('model');
      });

      it('should discover utils directory', () => {
        fs.mkdirSync(path.join(tmpDir, 'utils'));
        fs.writeFileSync(path.join(tmpDir, 'utils', 'helpers.ts'), 'export function helper() {}');

        const serviceMap = analyzeServiceRelationships(tmpDir);
        expect(serviceMap.services.has('utils')).toBe(true);
        expect(serviceMap.services.get('utils')!.type).toBe('utility');
      });

      it('should discover multiple services', () => {
        fs.mkdirSync(path.join(tmpDir, 'services'));
        fs.mkdirSync(path.join(tmpDir, 'controllers'));
        fs.mkdirSync(path.join(tmpDir, 'models'));
        fs.writeFileSync(path.join(tmpDir, 'services', 'auth.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'controllers', 'user.ts'), '');
        fs.writeFileSync(path.join(tmpDir, 'models', 'user.ts'), '');

        const serviceMap = analyzeServiceRelationships(tmpDir);
        expect(serviceMap.services.size).toBeGreaterThanOrEqual(3);
      });
    });

    describe('Relationship detection', () => {
      it('should detect imports between services', () => {
        fs.mkdirSync(path.join(tmpDir, 'services'));
        fs.mkdirSync(path.join(tmpDir, 'utils'));
        fs.writeFileSync(path.join(tmpDir, 'utils', 'helpers.ts'), 'export function helper() {}');
        fs.writeFileSync(
          path.join(tmpDir, 'services', 'auth.ts'),
          'import { helper } from "../utils/helpers";\nexport class Auth {}',
        );

        const serviceMap = analyzeServiceRelationships(tmpDir);
        expect(serviceMap.relationships.length).toBeGreaterThan(0);
        expect(serviceMap.relationships[0].from).toBe('services');
        expect(serviceMap.relationships[0].to).toBe('utils');
      });

      it('should track dependencies', () => {
        fs.mkdirSync(path.join(tmpDir, 'services'));
        fs.mkdirSync(path.join(tmpDir, 'utils'));
        fs.writeFileSync(path.join(tmpDir, 'utils', 'helpers.ts'), 'export function helper() {}');
        fs.writeFileSync(
          path.join(tmpDir, 'services', 'auth.ts'),
          'import { helper } from "../utils/helpers";',
        );

        const serviceMap = analyzeServiceRelationships(tmpDir);
        const authService = serviceMap.services.get('services');
        expect(authService).toBeDefined();
        expect(authService!.dependencies).toContain('utils');
      });

      it('should track dependents', () => {
        fs.mkdirSync(path.join(tmpDir, 'services'));
        fs.mkdirSync(path.join(tmpDir, 'utils'));
        fs.writeFileSync(path.join(tmpDir, 'utils', 'helpers.ts'), 'export function helper() {}');
        fs.writeFileSync(
          path.join(tmpDir, 'services', 'auth.ts'),
          'import { helper } from "../utils/helpers";',
        );

        const serviceMap = analyzeServiceRelationships(tmpDir);
        const utilsService = serviceMap.services.get('utils');
        expect(utilsService).toBeDefined();
        expect(utilsService!.dependents).toContain('services');
      });

      it('should detect shared utilities', () => {
        fs.mkdirSync(path.join(tmpDir, 'services', 'auth'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir, 'services', 'user'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir, 'utils'));
        fs.writeFileSync(path.join(tmpDir, 'utils', 'helpers.ts'), 'export function helper() {}');
        fs.writeFileSync(
          path.join(tmpDir, 'services', 'auth', 'index.ts'),
          'import { helper } from "../../utils/helpers";',
        );
        fs.writeFileSync(
          path.join(tmpDir, 'services', 'user', 'index.ts'),
          'import { helper } from "../../utils/helpers";',
        );

        const serviceMap = analyzeServiceRelationships(tmpDir);
        expect(serviceMap.sharedUtilities.length).toBeGreaterThan(0);
      });
    });

    describe('Service map summarization', () => {
      it('should provide summary', () => {
        fs.mkdirSync(path.join(tmpDir, 'services'));
        fs.writeFileSync(path.join(tmpDir, 'services', 'auth.ts'), '');

        const serviceMap = analyzeServiceRelationships(tmpDir);
        expect(serviceMap.summary.length).toBeGreaterThan(0);
        expect(serviceMap.summary.some((s) => s.includes('Services/modules identified'))).toBe(
          true,
        );
      });

      it('should provide dependency graph', () => {
        fs.mkdirSync(path.join(tmpDir, 'services'));
        fs.writeFileSync(path.join(tmpDir, 'services', 'auth.ts'), '');

        const serviceMap = analyzeServiceRelationships(tmpDir);
        const graph = getServiceDependencyGraph(serviceMap.services);
        expect(graph.length).toBeGreaterThan(0);
      });
    });

    describe('ArchitectureEngine service integration', () => {
      it('should include service map in analysis', () => {
        fs.mkdirSync(path.join(tmpDir, 'services'));
        fs.writeFileSync(path.join(tmpDir, 'services', 'auth.ts'), '');

        const engine = new ArchitectureEngine(tmpDir);
        const serviceMap = engine.getServiceMap();

        expect(serviceMap.services.size).toBeGreaterThan(0);
      });

      it('should include service relationships in summary', async () => {
        fs.mkdirSync(path.join(tmpDir, 'services'));
        fs.writeFileSync(path.join(tmpDir, 'services', 'auth.ts'), '');

        const engine = new ArchitectureEngine(tmpDir);
        const summary = await engine.getSummary();

        expect(summary.some((s) => s.includes('Service Relationships'))).toBe(true);
      });

      it('should provide dependency graph', () => {
        fs.mkdirSync(path.join(tmpDir, 'services'));
        fs.writeFileSync(path.join(tmpDir, 'services', 'auth.ts'), '');

        const engine = new ArchitectureEngine(tmpDir);
        const graph = engine.getServiceDependencyGraph();

        expect(graph.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Issue #24: Framework and pattern detection', () => {
    describe('Framework detection', () => {
      it('should detect React from dependencies', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
          }),
        );

        const result = detectPatterns(tmpDir);
        expect(result.frameworks.length).toBeGreaterThan(0);
        const react = result.frameworks.find((f) => f.name === 'React');
        expect(react).toBeDefined();
        expect(react!.confidence).toBe('high');
      });

      it('should detect Vue from dependencies', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { vue: '^3.0.0' },
          }),
        );

        const result = detectPatterns(tmpDir);
        const vue = result.frameworks.find((f) => f.name === 'Vue');
        expect(vue).toBeDefined();
      });

      it('should detect Next.js from dependencies', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { next: '^14.0.0', react: '^18.0.0' },
          }),
        );

        const result = detectPatterns(tmpDir);
        const next = result.frameworks.find((f) => f.name === 'Next.js');
        expect(next).toBeDefined();
        expect(next!.confidence).toBe('medium');
      });

      it('should detect Express from dependencies', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { express: '^4.18.0' },
          }),
        );

        const result = detectPatterns(tmpDir);
        const express = result.frameworks.find((f) => f.name === 'Express');
        expect(express).toBeDefined();
      });

      it('should detect NestJS from dependencies', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { '@nestjs/core': '^10.0.0', '@nestjs/common': '^10.0.0' },
          }),
        );

        const result = detectPatterns(tmpDir);
        const nest = result.frameworks.find((f) => f.name === 'NestJS');
        expect(nest).toBeDefined();
        expect(nest!.confidence).toBe('high');
      });

      it('should detect Angular from dependencies', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { '@angular/core': '^17.0.0', '@angular/common': '^17.0.0' },
          }),
        );

        const result = detectPatterns(tmpDir);
        const angular = result.frameworks.find((f) => f.name === 'Angular');
        expect(angular).toBeDefined();
        expect(angular!.confidence).toBe('high');
      });

      it('should not detect frameworks without dependencies', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: {},
          }),
        );

        const result = detectPatterns(tmpDir);
        expect(result.frameworks).toHaveLength(0);
      });
    });

    describe('Architecture pattern detection', () => {
      it('should detect MVC pattern', () => {
        fs.mkdirSync(path.join(tmpDir, 'models'));
        fs.mkdirSync(path.join(tmpDir, 'views'));
        fs.mkdirSync(path.join(tmpDir, 'controllers'));

        const result = detectPatterns(tmpDir);
        const mvc = result.architecturePatterns.find((p) => p.name === 'MVC');
        expect(mvc).toBeDefined();
        expect(mvc!.confidence).toBe('high');
      });

      it('should detect Repository pattern', () => {
        fs.mkdirSync(path.join(tmpDir, 'repositories'));

        const result = detectPatterns(tmpDir);
        const repo = result.architecturePatterns.find((p) => p.name === 'Repository Pattern');
        expect(repo).toBeDefined();
      });

      it('should detect Service Layer pattern', () => {
        fs.mkdirSync(path.join(tmpDir, 'services'));

        const result = detectPatterns(tmpDir);
        const service = result.architecturePatterns.find((p) => p.name === 'Service Layer');
        expect(service).toBeDefined();
      });

      it('should detect Monorepo pattern', () => {
        fs.mkdirSync(path.join(tmpDir, 'packages'));
        fs.mkdirSync(path.join(tmpDir, 'apps'));

        const result = detectPatterns(tmpDir);
        const mono = result.architecturePatterns.find((p) => p.name === 'Monorepo');
        expect(mono).toBeDefined();
      });

      it('should detect Clean Architecture', () => {
        fs.mkdirSync(path.join(tmpDir, 'domain'));
        fs.mkdirSync(path.join(tmpDir, 'application'));
        fs.mkdirSync(path.join(tmpDir, 'infrastructure'));

        const result = detectPatterns(tmpDir);
        const clean = result.architecturePatterns.find((p) => p.name === 'Clean Architecture');
        expect(clean).toBeDefined();
      });

      it('should not detect patterns without indicators', () => {
        fs.mkdirSync(path.join(tmpDir, 'src'));

        const result = detectPatterns(tmpDir);
        expect(result.architecturePatterns).toHaveLength(0);
      });
    });

    describe('State management detection', () => {
      it('should detect Redux', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { redux: '^4.0.0', 'react-redux': '^8.0.0' },
          }),
        );

        const result = detectPatterns(tmpDir);
        const redux = result.stateManagement.find((s) => s.name === 'Redux');
        expect(redux).toBeDefined();
        expect(redux!.library).toBe('redux');
      });

      it('should detect Zustand', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { zustand: '^4.0.0' },
          }),
        );

        const result = detectPatterns(tmpDir);
        const zustand = result.stateManagement.find((s) => s.name === 'Zustand');
        expect(zustand).toBeDefined();
      });

      it('should detect MobX', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { mobx: '^6.0.0' },
          }),
        );

        const result = detectPatterns(tmpDir);
        const mobx = result.stateManagement.find((s) => s.name === 'MobX');
        expect(mobx).toBeDefined();
      });

      it('should not detect state management without dependencies', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: {},
          }),
        );

        const result = detectPatterns(tmpDir);
        expect(result.stateManagement).toHaveLength(0);
      });
    });

    describe('Pattern detection summary', () => {
      it('should provide summary', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { react: '^18.0.0' },
          }),
        );

        const result = detectPatterns(tmpDir);
        expect(result.summary.length).toBeGreaterThan(0);
        expect(result.summary.some((s) => s.includes('Detected frameworks'))).toBe(true);
      });

      it('should handle no package.json', () => {
        const result = detectPatterns(tmpDir);
        expect(result.summary.some((s) => s.includes('No frameworks detected'))).toBe(true);
      });
    });

    describe('ArchitectureEngine pattern integration', () => {
      it('should include patterns in analysis', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { react: '^18.0.0' },
          }),
        );

        const engine = new ArchitectureEngine(tmpDir);
        const patterns = engine.getPatterns();

        expect(patterns.frameworks.length).toBeGreaterThan(0);
      });

      it('should include patterns in summary', async () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: { react: '^18.0.0' },
          }),
        );

        const engine = new ArchitectureEngine(tmpDir);
        const summary = await engine.getSummary();

        expect(summary.some((s) => s.includes('Frameworks and Patterns'))).toBe(true);
      });
    });
  });
});
