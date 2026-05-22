import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConventionEngine } from '../../src/convention-engine/index.js';
import {
  parseEditorConfig,
  summarizeEditorConfig,
} from '../../src/convention-engine/editorconfig-parser.js';
import {
  parseESLintConfig,
  parsePrettierConfig,
  summarizeESLintConfig,
  summarizePrettierConfig,
} from '../../src/convention-engine/eslint-prettier-parser.js';

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
      expect(result.summaries.length).toBeGreaterThanOrEqual(1);
      const editorConfigSummary = result.summaries.find((s) => s.source === '.editorconfig');
      expect(editorConfigSummary).toBeDefined();
      expect(editorConfigSummary!.category).toBe('formatting');
      expect(editorConfigSummary!.conventions).toContain('Indent with 2 spaces');
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

  describe('Issue #16: ESLint and Prettier parsing', () => {
    describe('ESLint parsing', () => {
      it('should return null when no ESLint config exists', () => {
        const config = parseESLintConfig(tmpDir);
        expect(config).toBeNull();
      });

      it('should parse .eslintrc.json', () => {
        fs.writeFileSync(
          path.join(tmpDir, '.eslintrc.json'),
          JSON.stringify({
            extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
            plugins: ['@typescript-eslint'],
            rules: { 'no-console': 'warn' },
          }),
        );

        const config = parseESLintConfig(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.configFile).toBe('.eslintrc.json');
        expect(config!.extends).toContain('eslint:recommended');
        expect(config!.extends).toContain('plugin:@typescript-eslint/recommended');
        expect(config!.plugins).toContain('@typescript-eslint');
        expect(config!.hasTypeScriptSupport).toBe(true);
        expect(config!.rules).toEqual({ 'no-console': 'warn' });
      });

      it('should parse eslint.config.js (flat config)', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'eslint.config.js'),
          `import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);`,
        );

        const config = parseESLintConfig(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.configFile).toBe('eslint.config.js');
        expect(config!.hasTypeScriptSupport).toBe(true);
        expect(config!.hasPrettierIntegration).toBe(true);
      });

      it('should detect React support', () => {
        fs.writeFileSync(
          path.join(tmpDir, '.eslintrc.json'),
          JSON.stringify({
            extends: ['plugin:react/recommended'],
            plugins: ['react'],
          }),
        );

        const config = parseESLintConfig(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.hasReactSupport).toBe(true);
      });

      it('should summarize ESLint conventions', () => {
        fs.writeFileSync(
          path.join(tmpDir, '.eslintrc.json'),
          JSON.stringify({
            extends: ['eslint:recommended'],
            plugins: [],
            rules: { 'no-console': 'warn', 'no-unused-vars': 'error' },
          }),
        );

        const config = parseESLintConfig(tmpDir);
        const summary = summarizeESLintConfig(config);

        expect(summary).toContain('ESLint config: .eslintrc.json');
        expect(summary).toContain('Extends: eslint:recommended');
        expect(summary).toContain('2 custom rule(s) configured');
      });

      it('should handle missing ESLint config in summary', () => {
        const summary = summarizeESLintConfig(null);
        expect(summary).toContain('No ESLint configuration found');
      });
    });

    describe('Prettier parsing', () => {
      it('should return null when no Prettier config exists', () => {
        const config = parsePrettierConfig(tmpDir);
        expect(config).toBeNull();
      });

      it('should parse .prettierrc.json', () => {
        fs.writeFileSync(
          path.join(tmpDir, '.prettierrc.json'),
          JSON.stringify({
            semi: true,
            singleQuote: true,
            tabWidth: 2,
            trailingComma: 'all',
            printWidth: 80,
          }),
        );

        const config = parsePrettierConfig(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.configFile).toBe('.prettierrc.json');
        expect(config!.hasSemi).toBe(true);
        expect(config!.singleQuote).toBe(true);
        expect(config!.tabWidth).toBe(2);
        expect(config!.trailingComma).toBe('all');
        expect(config!.printWidth).toBe(80);
      });

      it('should parse .prettierrc (JSON without extension)', () => {
        fs.writeFileSync(
          path.join(tmpDir, '.prettierrc'),
          JSON.stringify({
            semi: false,
            singleQuote: false,
          }),
        );

        const config = parsePrettierConfig(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.configFile).toBe('.prettierrc');
        expect(config!.hasSemi).toBe(false);
        expect(config!.singleQuote).toBe(false);
      });

      it('should parse prettier.config.js', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'prettier.config.js'),
          `export default {
  semi: true,
  singleQuote: true,
  tabWidth: 4,
};`,
        );

        const config = parsePrettierConfig(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.configFile).toBe('prettier.config.js');
        expect(config!.hasSemi).toBe(true);
        expect(config!.singleQuote).toBe(true);
        expect(config!.tabWidth).toBe(4);
      });

      it('should summarize Prettier conventions', () => {
        fs.writeFileSync(
          path.join(tmpDir, '.prettierrc.json'),
          JSON.stringify({
            semi: true,
            singleQuote: true,
            tabWidth: 2,
            trailingComma: 'all',
            printWidth: 100,
          }),
        );

        const config = parsePrettierConfig(tmpDir);
        const summary = summarizePrettierConfig(config);

        expect(summary).toContain('Prettier config: .prettierrc.json');
        expect(summary).toContain('Semicolons required');
        expect(summary).toContain('Single quotes preferred');
        expect(summary).toContain('Tab width: 2');
        expect(summary).toContain('Trailing commas: all');
        expect(summary).toContain('Print width: 100');
      });

      it('should handle missing Prettier config in summary', () => {
        const summary = summarizePrettierConfig(null);
        expect(summary).toContain('No Prettier configuration found');
      });
    });

    describe('ConventionEngine integration', () => {
      it('should analyze both ESLint and Prettier configs', () => {
        fs.writeFileSync(
          path.join(tmpDir, '.eslintrc.json'),
          JSON.stringify({
            extends: ['eslint:recommended'],
            rules: {},
          }),
        );
        fs.writeFileSync(
          path.join(tmpDir, '.prettierrc.json'),
          JSON.stringify({
            semi: true,
            singleQuote: true,
          }),
        );

        const engine = new ConventionEngine(tmpDir);
        const result = engine.analyze();

        expect(result.lintFormat.eslint).not.toBeNull();
        expect(result.lintFormat.prettier).not.toBeNull();
        expect(result.summaries.length).toBeGreaterThanOrEqual(3);

        const eslintSummary = result.summaries.find((s) => s.source === 'ESLint');
        expect(eslintSummary).toBeDefined();
        expect(eslintSummary!.category).toBe('lint');

        const prettierSummary = result.summaries.find((s) => s.source === 'Prettier');
        expect(prettierSummary).toBeDefined();
        expect(prettierSummary!.category).toBe('formatting');
      });

      it('should provide getLintConventions shortcut', () => {
        fs.writeFileSync(
          path.join(tmpDir, '.eslintrc.json'),
          JSON.stringify({
            extends: ['eslint:recommended'],
            rules: {},
          }),
        );

        const engine = new ConventionEngine(tmpDir);
        const conventions = engine.getLintConventions();

        expect(conventions).toContain('ESLint config: .eslintrc.json');
        expect(conventions).toContain('Extends: eslint:recommended');
      });

      it('should provide getFormatConventions shortcut', () => {
        fs.writeFileSync(
          path.join(tmpDir, '.prettierrc.json'),
          JSON.stringify({
            semi: false,
          }),
        );

        const engine = new ConventionEngine(tmpDir);
        const conventions = engine.getFormatConventions();

        expect(conventions).toContain('Prettier config: .prettierrc.json');
        expect(conventions).toContain('No semicolons');
      });

      it('should handle no lint/format configs gracefully', () => {
        const engine = new ConventionEngine(tmpDir);
        const result = engine.analyze();

        expect(result.lintFormat.eslint).toBeNull();
        expect(result.lintFormat.prettier).toBeNull();
      });
    });
  });
});
