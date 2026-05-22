import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConventionEngine } from '../../src/convention-engine/index.js';
import {
  parseEditorConfig,
  summarizeEditorConfig,
} from '../../src/convention-engine/editorconfig-parser.js';

describe('ConventionEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'convention-engine-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Issue #15: .editorconfig parsing', () => {
    it('should return null when no .editorconfig exists', () => {
      const config = parseEditorConfig(tmpDir);
      expect(config).toBeNull();
    });

    it('should parse basic .editorconfig properties', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.editorconfig'),
        `root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true`,
      );

      const config = parseEditorConfig(tmpDir);
      expect(config).not.toBeNull();
      expect(config!.root).toBe(true);
      expect(config!.globalRules.charset).toBe('utf-8');
      expect(config!.globalRules.endOfLine).toBe('lf');
      expect(config!.globalRules.indentStyle).toBe('space');
      expect(config!.globalRules.indentSize).toBe(2);
      expect(config!.globalRules.insertFinalNewline).toBe(true);
      expect(config!.globalRules.trimTrailingWhitespace).toBe(true);
    });

    it('should parse section overrides', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.editorconfig'),
        `root = true

[*]
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[*.json]
indent_size = 2`,
      );

      const config = parseEditorConfig(tmpDir);
      expect(config).not.toBeNull();
      expect(config!.sections).toHaveLength(2);
      expect(config!.sections[0].pattern).toBe('*.md');
      expect(config!.sections[0].rules.trimTrailingWhitespace).toBe(false);
      expect(config!.sections[1].pattern).toBe('*.json');
      expect(config!.sections[1].rules.indentSize).toBe(2);
    });

    it('should handle comments in .editorconfig', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.editorconfig'),
        `# This is a comment
root = true

# Another comment
[*]
indent_style = space`,
      );

      const config = parseEditorConfig(tmpDir);
      expect(config).not.toBeNull();
      expect(config!.root).toBe(true);
      expect(config!.globalRules.indentStyle).toBe('space');
    });

    it('should parse tab indentation', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.editorconfig'),
        `[*]
indent_style = tab
indent_size = 4`,
      );

      const config = parseEditorConfig(tmpDir);
      expect(config).not.toBeNull();
      expect(config!.globalRules.indentStyle).toBe('tab');
      expect(config!.globalRules.indentSize).toBe(4);
    });

    it('should summarize editorconfig conventions', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.editorconfig'),
        `root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true`,
      );

      const config = parseEditorConfig(tmpDir);
      const summary = summarizeEditorConfig(config);

      expect(summary).toContain('Indent with 2 spaces');
      expect(summary).toContain('File encoding: utf-8');
      expect(summary).toContain('Line endings: LF (Unix)');
      expect(summary).toContain('Files must end with a newline');
      expect(summary).toContain('Trailing whitespace is trimmed');
      expect(summary).toContain('This is the root .editorconfig (stops upward search)');
    });

    it('should handle missing .editorconfig in summary', () => {
      const summary = summarizeEditorConfig(null);
      expect(summary).toContain('No .editorconfig found');
    });

    it('should work through ConventionEngine class', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.editorconfig'),
        `root = true

[*]
charset = utf-8
indent_style = space
indent_size = 2`,
      );

      const engine = new ConventionEngine(tmpDir);
      const result = engine.analyze();

      expect(result.editorConfig).not.toBeNull();
      expect(result.summaries).toHaveLength(1);
      expect(result.summaries[0].source).toBe('.editorconfig');
      expect(result.summaries[0].category).toBe('formatting');
      expect(result.summaries[0].conventions).toContain('Indent with 2 spaces');
    });

    it('should provide getFormattingConventions shortcut', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.editorconfig'),
        `[*]
indent_style = tab
indent_size = 4`,
      );

      const engine = new ConventionEngine(tmpDir);
      const conventions = engine.getFormattingConventions();

      expect(conventions).toContain('Indent with 4 tabs');
    });

    it('should handle empty .editorconfig', () => {
      fs.writeFileSync(path.join(tmpDir, '.editorconfig'), '');

      const config = parseEditorConfig(tmpDir);
      expect(config).not.toBeNull();
      expect(config!.root).toBe(false);
      expect(config!.globalRules.indentStyle).toBeNull();
    });
  });
});
