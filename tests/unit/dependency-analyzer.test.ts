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
});
