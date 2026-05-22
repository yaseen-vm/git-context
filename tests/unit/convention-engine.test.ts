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
import {
  parseTypeScriptConfig,
  summarizeTypeScriptConfig,
} from '../../src/convention-engine/typescript-config-parser.js';
import {
  parsePackageJson,
  summarizePackageJsonConfig,
} from '../../src/convention-engine/package-json-parser.js';

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

  describe('Issue #17: TypeScript/JS config parsing', () => {
    describe('TypeScript config parsing', () => {
      it('should return null when no tsconfig/jsconfig exists', () => {
        const config = parseTypeScriptConfig(tmpDir);
        expect(config).toBeNull();
      });

      it('should parse tsconfig.json with strict mode', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module: 'ES2022',
              moduleResolution: 'node',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true,
              declaration: true,
              sourceMap: true,
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist'],
          }),
        );

        const config = parseTypeScriptConfig(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.configFile).toBe('tsconfig.json');
        expect(config!.isStrict).toBe(true);
        expect(config!.target).toBe('ES2022');
        expect(config!.module).toBe('ES2022');
        expect(config!.moduleResolution).toBe('node');
        expect(config!.esModuleInterop).toBe(true);
        expect(config!.skipLibCheck).toBe(true);
        expect(config!.forceConsistentCasingInFileNames).toBe(true);
        expect(config!.declaration).toBe(true);
        expect(config!.sourceMap).toBe(true);
        expect(config!.include).toContain('src/**/*');
        expect(config!.exclude).toContain('node_modules');
        expect(config!.exclude).toContain('dist');
      });

      it('should parse jsconfig.json', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'jsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2020',
              module: 'commonjs',
              strict: false,
            },
            include: ['src/**/*'],
          }),
        );

        const config = parseTypeScriptConfig(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.configFile).toBe('jsconfig.json');
        expect(config!.isStrict).toBe(false);
        expect(config!.target).toBe('ES2020');
        expect(config!.module).toBe('commonjs');
      });

      it('should parse path aliases', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module: 'ES2022',
              moduleResolution: 'node',
              baseUrl: '.',
              paths: {
                '@/*': ['./src/*'],
                '@utils/*': ['./src/utils/*'],
              },
            },
          }),
        );

        const config = parseTypeScriptConfig(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.baseUrl).toBe('.');
        expect(config!.paths['@/*']).toEqual(['./src/*']);
        expect(config!.paths['@utils/*']).toEqual(['./src/utils/*']);
      });

      it('should parse JSX settings', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module: 'ES2022',
              jsx: 'react-jsx',
            },
          }),
        );

        const config = parseTypeScriptConfig(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.jsx).toBe('react-jsx');
      });

      it('should parse lib settings', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              lib: ['ES2022', 'DOM', 'DOM.Iterable'],
            },
          }),
        );

        const config = parseTypeScriptConfig(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.lib).toContain('ES2022');
        expect(config!.lib).toContain('DOM');
        expect(config!.lib).toContain('DOM.Iterable');
      });

      it('should summarize TypeScript conventions', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module: 'ES2022',
              moduleResolution: 'node',
              strict: true,
              declaration: true,
              sourceMap: true,
            },
            include: ['src/**/*'],
          }),
        );

        const config = parseTypeScriptConfig(tmpDir);
        const summary = summarizeTypeScriptConfig(config);

        expect(summary).toContain('Config file: tsconfig.json');
        expect(summary).toContain('Strict mode enabled');
        expect(summary).toContain('Target: ES2022');
        expect(summary).toContain('Module system: ES2022');
        expect(summary).toContain('Module resolution: node');
        expect(summary).toContain('Declaration files generated');
        expect(summary).toContain('Source maps enabled');
        expect(summary).toContain('Include: src/**/*');
      });

      it('should handle missing TypeScript config in summary', () => {
        const summary = summarizeTypeScriptConfig(null);
        expect(summary).toContain('No TypeScript/JavaScript configuration found');
      });

      it('should handle non-strict mode in summary', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              strict: false,
            },
          }),
        );

        const config = parseTypeScriptConfig(tmpDir);
        const summary = summarizeTypeScriptConfig(config);

        expect(summary).toContain('Strict mode disabled');
      });
    });

    describe('ConventionEngine TypeScript integration', () => {
      it('should include TypeScript config in analyze result', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              strict: true,
            },
          }),
        );

        const engine = new ConventionEngine(tmpDir);
        const result = engine.analyze();

        expect(result.typeScript).not.toBeNull();
        expect(result.typeScript!.configFile).toBe('tsconfig.json');
        expect(result.typeScript!.isStrict).toBe(true);

        const tsSummary = result.summaries.find((s) => s.source === 'TypeScript');
        expect(tsSummary).toBeDefined();
        expect(tsSummary!.category).toBe('typescript');
        expect(tsSummary!.conventions).toContain('Strict mode enabled');
      });

      it('should provide getTypeScriptConfig shortcut', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
            },
          }),
        );

        const engine = new ConventionEngine(tmpDir);
        const config = engine.getTypeScriptConfig();

        expect(config).not.toBeNull();
        expect(config!.configFile).toBe('tsconfig.json');
        expect(config!.target).toBe('ES2022');
      });

      it('should provide getTypeScriptConventions shortcut', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              strict: true,
              declaration: true,
            },
          }),
        );

        const engine = new ConventionEngine(tmpDir);
        const conventions = engine.getTypeScriptConventions();

        expect(conventions).toContain('Strict mode enabled');
        expect(conventions).toContain('Declaration files generated');
      });

      it('should handle no TypeScript config gracefully', () => {
        const engine = new ConventionEngine(tmpDir);
        const result = engine.analyze();

        expect(result.typeScript).toBeNull();
      });

      it('should prefer tsconfig over jsconfig', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              strict: true,
            },
          }),
        );
        fs.writeFileSync(
          path.join(tmpDir, 'jsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2020',
              strict: false,
            },
          }),
        );

        const engine = new ConventionEngine(tmpDir);
        const config = engine.getTypeScriptConfig();

        expect(config).not.toBeNull();
        expect(config!.configFile).toBe('tsconfig.json');
        expect(config!.isStrict).toBe(true);
      });
    });
  });

  describe('Issue #18: package.json parsing', () => {
    describe('Package.json parsing', () => {
      it('should return null when no package.json exists', () => {
        const config = parsePackageJson(tmpDir);
        expect(config).toBeNull();
      });

      it('should parse basic package.json properties', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            version: '1.0.0',
            type: 'module',
            scripts: {
              build: 'tsc',
              test: 'vitest',
              lint: 'eslint src/',
            },
            dependencies: {
              express: '^4.18.0',
            },
            devDependencies: {
              typescript: '^5.0.0',
              vitest: '^1.0.0',
            },
          }),
        );

        const config = parsePackageJson(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.name).toBe('my-app');
        expect(config!.version).toBe('1.0.0');
        expect(config!.type).toBe('module');
        expect(config!.scripts.build).toBe('tsc');
        expect(config!.scripts.test).toBe('vitest');
        expect(config!.scripts.lint).toBe('eslint src/');
        expect(config!.dependencies.express).toBe('^4.18.0');
        expect(config!.devDependencies.typescript).toBe('^5.0.0');
        expect(config!.hasBuildScript).toBe(true);
        expect(config!.hasTestScript).toBe(true);
        expect(config!.hasLintScript).toBe(true);
      });

      it('should detect framework from dependencies', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: {
              next: '^14.0.0',
              react: '^18.0.0',
            },
          }),
        );

        const config = parsePackageJson(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.detectedFramework).toBe('Next.js');
      });

      it('should detect build tool from dependencies', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            devDependencies: {
              vite: '^5.0.0',
            },
          }),
        );

        const config = parsePackageJson(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.detectedBuildTool).toBe('Vite');
      });

      it('should detect test framework from dependencies', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            devDependencies: {
              jest: '^29.0.0',
            },
          }),
        );

        const config = parsePackageJson(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.detectedTestFramework).toBe('Jest');
      });

      it('should detect Vitest as test framework', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            devDependencies: {
              vitest: '^1.0.0',
            },
          }),
        );

        const config = parsePackageJson(tmpDir);
        expect(config).not.toBeNull();
        expect(config!.detectedTestFramework).toBe('Vitest');
      });

      it('should summarize package.json conventions', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            version: '1.0.0',
            type: 'module',
            scripts: {
              build: 'tsc',
              test: 'vitest',
              lint: 'eslint src/',
              format: 'prettier --write src/',
              typecheck: 'tsc --noEmit',
            },
            dependencies: {
              express: '^4.18.0',
            },
            devDependencies: {
              typescript: '^5.0.0',
              vitest: '^1.0.0',
            },
          }),
        );

        const config = parsePackageJson(tmpDir);
        const summary = summarizePackageJsonConfig(config);

        expect(summary).toContain('Package: my-app@1.0.0');
        expect(summary).toContain('Module type: module');
        expect(summary).toContain('Test framework: Vitest');
        expect(summary).toContain('Available scripts: build, test, lint, format, typecheck');
        expect(summary).toContain('Dependencies: 1 production, 2 development');
      });

      it('should handle missing package.json in summary', () => {
        const summary = summarizePackageJsonConfig(null);
        expect(summary).toContain('No package.json found');
      });

      it('should handle package.json with no scripts', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-lib',
            version: '0.1.0',
          }),
        );

        const config = parsePackageJson(tmpDir);
        const summary = summarizePackageJsonConfig(config);

        expect(summary).toContain('Package: my-lib@0.1.0');
        expect(summary).toContain('Dependencies: 0 production, 0 development');
      });
    });

    describe('ConventionEngine package.json integration', () => {
      it('should include package.json config in analyze result', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            version: '1.0.0',
            scripts: {
              build: 'tsc',
              test: 'vitest',
            },
            devDependencies: {
              vitest: '^1.0.0',
            },
          }),
        );

        const engine = new ConventionEngine(tmpDir);
        const result = engine.analyze();

        expect(result.packageJson).not.toBeNull();
        expect(result.packageJson!.name).toBe('my-app');
        expect(result.packageJson!.detectedTestFramework).toBe('Vitest');

        const pkgSummary = result.summaries.find((s) => s.source === 'package.json');
        expect(pkgSummary).toBeDefined();
        expect(pkgSummary!.category).toBe('package');
        expect(pkgSummary!.conventions).toContain('Test framework: Vitest');
      });

      it('should provide getPackageJsonConfig shortcut', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            version: '1.0.0',
          }),
        );

        const engine = new ConventionEngine(tmpDir);
        const config = engine.getPackageJsonConfig();

        expect(config).not.toBeNull();
        expect(config!.name).toBe('my-app');
        expect(config!.version).toBe('1.0.0');
      });

      it('should provide getPackageConventions shortcut', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            scripts: {
              build: 'tsc',
              test: 'vitest',
            },
          }),
        );

        const engine = new ConventionEngine(tmpDir);
        const conventions = engine.getPackageConventions();

        expect(conventions).toContain('Package: my-app@0.0.0');
        expect(conventions).toContain('Available scripts: build, test');
      });

      it('should handle no package.json gracefully', () => {
        const engine = new ConventionEngine(tmpDir);
        const result = engine.analyze();

        expect(result.packageJson).toBeNull();
      });

      it('should detect multiple frameworks correctly', () => {
        fs.writeFileSync(
          path.join(tmpDir, 'package.json'),
          JSON.stringify({
            name: 'my-app',
            dependencies: {
              react: '^18.0.0',
            },
            devDependencies: {
              '@testing-library/react': '^14.0.0',
            },
          }),
        );

        const engine = new ConventionEngine(tmpDir);
        const config = engine.getPackageJsonConfig();

        expect(config).not.toBeNull();
        expect(config!.detectedFramework).toBe('React');
        expect(config!.detectedTestFramework).toBe('Testing Library (React)');
      });
    });
  });
});
