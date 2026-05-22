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
});
