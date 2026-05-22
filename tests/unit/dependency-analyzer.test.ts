import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DependencyAnalyzer } from '../../src/dependency-analyzer/analyzer.js';

describe('DependencyAnalyzer', () => {
  let tmpDir: string;
  let analyzer: DependencyAnalyzer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-analyzer-test-'));
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Issue #11: ts-morph setup', () => {
    it('should initialize without tsconfig', () => {
      analyzer = new DependencyAnalyzer(tmpDir);
      expect(analyzer.isReady()).toBe(true);
      expect(analyzer.hasTypeScriptConfig()).toBe(false);
    });

    it('should initialize with tsconfig', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { target: 'ES2022', module: 'ES2022', moduleResolution: 'node' },
        }),
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      expect(analyzer.isReady()).toBe(true);
      expect(analyzer.hasTypeScriptConfig()).toBe(true);
    });

    it('should initialize with jsconfig', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'jsconfig.json'),
        JSON.stringify({
          compilerOptions: { target: 'ES2022', module: 'ES2022', moduleResolution: 'node' },
        }),
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      expect(analyzer.isReady()).toBe(true);
      expect(analyzer.hasTypeScriptConfig()).toBe(true);
    });

    it('should analyze TypeScript files', () => {
      fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const hello = "world";');

      analyzer = new DependencyAnalyzer(tmpDir);
      const analyses = analyzer.analyzeFiles(['src/index.ts']);

      expect(analyses).toHaveLength(1);
      expect(analyses[0].filePath).toBe('src/index.ts');
      expect(analyses[0].exports).toContain('hello');
    });

    it('should analyze JavaScript files', () => {
      fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), 'export const hello = "world";');

      analyzer = new DependencyAnalyzer(tmpDir);
      const analyses = analyzer.analyzeFiles(['src/index.js']);

      expect(analyses).toHaveLength(1);
      expect(analyses[0].filePath).toBe('src/index.js');
    });
  });

  describe('Issue #12: import resolution', () => {
    it('should resolve relative imports', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'utils', 'helper.ts'),
        'export const helper = () => {};',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import { helper } from "./utils/helper"; export const main = helper;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      const analyses = analyzer.analyzeFiles(['src/index.ts', 'src/utils/helper.ts']);

      const indexAnalysis = analyses.find((a) => a.filePath === 'src/index.ts');
      expect(indexAnalysis).toBeDefined();
      expect(indexAnalysis!.imports).toHaveLength(1);
      expect(indexAnalysis!.imports[0].resolvedPath).toBe('src/utils/helper.ts');
      expect(indexAnalysis!.imports[0].namedImports).toContain('helper');
    });

    it('should resolve relative imports with index files', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'utils', 'index.ts'),
        'export { helper } from "./helper"; export const utils = {};',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'utils', 'helper.ts'),
        'export const helper = () => {};',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import { utils } from "./utils"; export const main = utils;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      const analyses = analyzer.analyzeFiles([
        'src/index.ts',
        'src/utils/index.ts',
        'src/utils/helper.ts',
      ]);

      const indexAnalysis = analyses.find((a) => a.filePath === 'src/index.ts');
      expect(indexAnalysis).toBeDefined();
      expect(indexAnalysis!.imports).toHaveLength(1);
      expect(indexAnalysis!.imports[0].resolvedPath).toBe('src/utils/index.ts');
    });

    it('should resolve imports with different extensions', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'component.tsx'),
        'export const Component = () => {};',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import { Component } from "./component"; export const App = Component;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      const analyses = analyzer.analyzeFiles(['src/index.ts', 'src/component.tsx']);

      const indexAnalysis = analyses.find((a) => a.filePath === 'src/index.ts');
      expect(indexAnalysis).toBeDefined();
      expect(indexAnalysis!.imports[0].resolvedPath).toBe('src/component.tsx');
    });

    it('should resolve path aliases from tsconfig', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ES2022',
            moduleResolution: 'node',
            paths: { '@/*': ['./src/*'] },
          },
        }),
      );
      fs.writeFileSync(path.join(tmpDir, 'src', 'utils.ts'), 'export const utils = {};');
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import { utils } from "@/utils"; export const main = utils;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      const analyses = analyzer.analyzeFiles(['src/index.ts', 'src/utils.ts']);

      const indexAnalysis = analyses.find((a) => a.filePath === 'src/index.ts');
      expect(indexAnalysis).toBeDefined();
      expect(indexAnalysis!.imports[0].resolvedPath).toBe('src/utils.ts');
    });

    it('should handle re-exports and barrel files', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'components'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'components', 'Button.tsx'),
        'export const Button = () => {};',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'components', 'index.ts'),
        'export { Button } from "./Button";',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import { Button } from "./components"; export const App = Button;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      const analyses = analyzer.analyzeFiles([
        'src/index.ts',
        'src/components/index.ts',
        'src/components/Button.tsx',
      ]);

      const componentsIndex = analyses.find((a) => a.filePath === 'src/components/index.ts');
      expect(componentsIndex).toBeDefined();
      expect(componentsIndex!.reExports).toHaveLength(1);
      expect(componentsIndex!.reExports[0].namedExports).toContain('Button');
    });

    it('should not resolve external modules', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import React from "react"; export const App = React;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      const analyses = analyzer.analyzeFiles(['src/index.ts']);

      const indexAnalysis = analyses[0];
      expect(indexAnalysis.imports[0].resolvedPath).toBeNull();
    });
  });

  describe('Issue #13: module relationship graph', () => {
    it('should build dependency graph with imports and importers', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'utils', 'helper.ts'),
        'export const helper = () => {};',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import { helper } from "./utils/helper"; export const main = helper;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/index.ts', 'src/utils/helper.ts']);

      const graph = analyzer.getGraph();
      expect(graph.files.size).toBe(2);
      expect(graph.imports.get('src/index.ts')).toContain('src/utils/helper.ts');
      expect(graph.importers.get('src/utils/helper.ts')).toContain('src/index.ts');
    });

    it('should find related files within N hops', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'a'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'src', 'b'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src', 'a', 'file1.ts'), 'export const file1 = {};');
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'b', 'file2.ts'),
        'import { file1 } from "../a/file1"; export const file2 = file1;',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import { file2 } from "./b/file2"; export const main = file2;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/index.ts', 'src/b/file2.ts', 'src/a/file1.ts']);

      const related = analyzer.findRelatedFiles('src/index.ts', 2);
      const paths = related.map((r) => r.path);
      expect(paths).toContain('src/b/file2.ts');
      expect(paths).toContain('src/a/file1.ts');
    });

    it('should support bidirectional traversal', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'utils', 'helper.ts'),
        'export const helper = () => {};',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import { helper } from "./utils/helper"; export const main = helper;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/index.ts', 'src/utils/helper.ts']);

      const importsOfIndex = analyzer.getImportsOf('src/index.ts');
      expect(importsOfIndex).toContain('src/utils/helper.ts');

      const importersOfHelper = analyzer.getImportersOf('src/utils/helper.ts');
      expect(importersOfHelper).toContain('src/index.ts');
    });

    it('should get graph statistics', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'utils', 'helper.ts'),
        'export const helper = () => {};',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import { helper } from "./utils/helper"; export const main = helper;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/index.ts', 'src/utils/helper.ts']);

      const stats = analyzer.getGraphStats();
      expect(stats.totalFiles).toBe(2);
      expect(stats.totalImports).toBe(1);
      expect(stats.filesWithNoImports).toBe(1); // helper.ts has no imports
      expect(stats.filesWithNoImporters).toBe(0); // index.ts has no importers, helper.ts has index.ts as importer
    });

    it('should detect circular dependencies', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'a.ts'),
        'import { b } from "./b"; export const a = b;',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'b.ts'),
        'import { a } from "./a"; export const b = a;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/a.ts', 'src/b.ts']);

      const cycles = analyzer.findCircularDependencies();
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should get all files in graph', () => {
      fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const main = {};');
      fs.writeFileSync(path.join(tmpDir, 'src', 'utils.ts'), 'export const utils = {};');

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/index.ts', 'src/utils.ts']);

      const files = analyzer.getFilesInGraph();
      expect(files).toContain('src/index.ts');
      expect(files).toContain('src/utils.ts');
    });
  });

  describe('Issue #14: related file discovery', () => {
    it('should find test files for source files', () => {
      fs.writeFileSync(path.join(tmpDir, 'src', 'foo.ts'), 'export const foo = {};');
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'foo.test.ts'),
        'import { foo } from "./foo"; test("foo", () => {});',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/foo.ts', 'src/foo.test.ts']);

      const testFiles = analyzer.findTestFiles('src/foo.ts');
      expect(testFiles).toContain('src/foo.test.ts');
    });

    it('should find spec files for source files', () => {
      fs.writeFileSync(path.join(tmpDir, 'src', 'bar.tsx'), 'export const Bar = () => {};');
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'bar.spec.tsx'),
        'import { Bar } from "./bar"; test("bar", () => {});',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/bar.tsx', 'src/bar.spec.tsx']);

      const testFiles = analyzer.findTestFiles('src/bar.tsx');
      expect(testFiles).toContain('src/bar.spec.tsx');
    });

    it('should find config files referencing source files', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { target: 'ES2022' },
          include: ['src/foo.ts'],
        }),
      );
      fs.writeFileSync(path.join(tmpDir, 'src', 'foo.ts'), 'export const foo = {};');

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/foo.ts']);

      const configFiles = analyzer.findConfigFilesReferencing('src/foo.ts');
      expect(configFiles).toContain('tsconfig.json');
    });

    it('should find shared utilities used by multiple files', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'utils', 'helper.ts'),
        'export const helper = () => {};',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'a.ts'),
        'import { helper } from "./utils/helper"; export const a = helper;',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'b.ts'),
        'import { helper } from "./utils/helper"; export const b = helper;',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/a.ts', 'src/b.ts', 'src/utils/helper.ts']);

      const utilities = analyzer.findSharedUtilities(['src/a.ts', 'src/b.ts']);
      expect(utilities).toContain('src/utils/helper.ts');
    });

    it('should find all related files for a set of changed files', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'utils', 'helper.ts'),
        'export const helper = () => {};',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import { helper } from "./utils/helper"; export const main = helper;',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.test.ts'),
        'import { main } from "./index"; test("main", () => {});',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/index.ts', 'src/utils/helper.ts', 'src/index.test.ts']);

      const related = analyzer.findAllRelatedFiles(['src/index.ts']);
      const paths = related.map((r) => r.path);
      expect(paths).toContain('src/utils/helper.ts');
      expect(paths).toContain('src/index.test.ts');
    });

    it('should classify related files by relation type', () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'utils', 'helper.ts'),
        'export const helper = () => {};',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.ts'),
        'import { helper } from "./utils/helper"; export const main = helper;',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'index.test.ts'),
        'import { main } from "./index"; test("main", () => {});',
      );

      analyzer = new DependencyAnalyzer(tmpDir);
      analyzer.analyzeFiles(['src/index.ts', 'src/utils/helper.ts', 'src/index.test.ts']);

      const related = analyzer.findAllRelatedFiles(['src/index.ts']);
      const testFile = related.find((r) => r.path === 'src/index.test.ts');
      const utilFile = related.find((r) => r.path === 'src/utils/helper.ts');

      expect(testFile).toBeDefined();
      expect(testFile!.relation).toBe('test');

      expect(utilFile).toBeDefined();
      expect(utilFile!.relation).toBe('import');
    });
  });
});
