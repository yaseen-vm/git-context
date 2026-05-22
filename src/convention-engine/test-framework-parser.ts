import fs from 'fs';
import path from 'path';
import type { TestFrameworkConfig } from './types.js';

const TEST_CONFIG_FILES = [
  'jest.config.js',
  'jest.config.ts',
  'jest.config.mjs',
  'jest.config.cjs',
  'jest.config.json',
  'vitest.config.js',
  'vitest.config.ts',
  'vitest.config.mjs',
  'vitest.config.cjs',
  '.mocharc.js',
  '.mocharc.yml',
  '.mocharc.yaml',
  '.mocharc.json',
  '.mocharc.cjs',
  'ava.config.js',
  'ava.config.mjs',
  'ava.config.cjs',
  '.nycrc',
  '.nycrc.json',
  '.nycrc.yml',
  '.nycrc.yaml',
  'c8rc',
  'c8rc.json',
  'c8rc.yml',
  'c8rc.yaml',
];

const E2E_CONFIG_FILES = [
  'cypress.config.js',
  'cypress.config.ts',
  'cypress.config.mjs',
  'cypress.config.cjs',
  'playwright.config.js',
  'playwright.config.ts',
  'playwright.config.mjs',
  'playwright.config.cjs',
];

export function parseTestFrameworkConfig(repoPath: string): TestFrameworkConfig | null {
  const configFiles: string[] = [];
  let framework: string | null = null;
  let configFile: string | null = null;
  let hasCoverage = false;
  let coverageProvider: string | null = null;
  let testPattern: string | null = null;
  let testPathPattern: string | null = null;
  const setupFiles: string[] = [];
  let hasTypeScriptSupport = false;
  let hasReactTestingLibrary = false;
  let hasE2E = false;
  let e2eFramework: string | null = null;

  for (const candidate of TEST_CONFIG_FILES) {
    if (fs.existsSync(path.join(repoPath, candidate))) {
      configFiles.push(candidate);
    }
  }

  if (configFiles.length === 0) {
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        if (allDeps.vitest) {
          framework = 'Vitest';
          hasTypeScriptSupport = true;
        } else if (allDeps.jest) {
          framework = 'Jest';
          hasTypeScriptSupport = !!allDeps['ts-jest'] || !!allDeps['@swc/jest'];
        } else if (allDeps.mocha) {
          framework = 'Mocha';
        } else if (allDeps.ava) {
          framework = 'AVA';
        } else if (allDeps.tap) {
          framework = 'tap';
        }

        if (allDeps['@testing-library/react']) {
          hasReactTestingLibrary = true;
        }

        if (allDeps.cypress) {
          hasE2E = true;
          e2eFramework = 'Cypress';
        } else if (allDeps['@playwright/test'] || allDeps.playwright) {
          hasE2E = true;
          e2eFramework = 'Playwright';
        }

        if (allDeps.nyc) {
          hasCoverage = true;
          coverageProvider = 'nyc';
        } else if (allDeps.c8) {
          hasCoverage = true;
          coverageProvider = 'c8';
        } else if (allDeps['@vitest/coverage-v8']) {
          hasCoverage = true;
          coverageProvider = 'v8';
        } else if (allDeps['@vitest/coverage-istanbul']) {
          hasCoverage = true;
          coverageProvider = 'istanbul';
        } else if (allDeps['jest-coverage-babel']) {
          hasCoverage = true;
          coverageProvider = 'babel';
        }
      } catch {
        // Ignore parse errors
      }
    }

    if (!framework) {
      return null;
    }

    return {
      framework,
      configFile: null,
      configFiles: [],
      hasCoverage,
      coverageProvider,
      testPattern,
      testPathPattern,
      setupFiles,
      hasTypeScriptSupport,
      hasReactTestingLibrary,
      hasE2E,
      e2eFramework,
    };
  }

  configFile = configFiles[0];

  if (configFiles.some((f) => f.startsWith('jest.config'))) {
    framework = 'Jest';
  } else if (configFiles.some((f) => f.startsWith('vitest.config'))) {
    framework = 'Vitest';
    hasTypeScriptSupport = true;
  } else if (configFiles.some((f) => f.startsWith('.mocharc'))) {
    framework = 'Mocha';
  } else if (configFiles.some((f) => f.startsWith('ava.config'))) {
    framework = 'AVA';
  }

  for (const file of configFiles) {
    if (file.startsWith('.nycrc') || file.startsWith('c8rc')) {
      hasCoverage = true;
      coverageProvider = file.startsWith('.nycrc') ? 'nyc' : 'c8';
    }
  }

  if (configFile) {
    const configPath = path.join(repoPath, configFile);
    const content = fs.readFileSync(configPath, 'utf-8');

    if (configFile.endsWith('.json')) {
      try {
        const config = JSON.parse(content);
        if (config.testMatch) testPattern = String(config.testMatch);
        if (config.testPathPattern) testPathPattern = config.testPathPattern;
        if (config.setupFiles) setupFiles.push(...config.setupFiles.map(String));
        if (config.setupFilesAfterFramework)
          setupFiles.push(...config.setupFilesAfterFramework.map(String));
        if (config.coverageProvider) coverageProvider = config.coverageProvider;
      } catch {
        // Ignore parse errors
      }
    } else if (
      configFile.endsWith('.js') ||
      configFile.endsWith('.ts') ||
      configFile.endsWith('.mjs') ||
      configFile.endsWith('.cjs')
    ) {
      const testMatchMatch = content.match(/testMatch:\s*\[([^\]]+)\]/);
      if (testMatchMatch) {
        testPattern = testMatchMatch[1].trim();
      }

      const setupMatch = content.match(/setupFiles(?:AfterFramework)?:\s*\[([^\]]+)\]/);
      if (setupMatch) {
        const files = setupMatch[1].match(/['"]([^'"]+)['"]/g);
        if (files) {
          setupFiles.push(...files.map((f) => f.replace(/['"]/g, '')));
        }
      }
    } else if (configFile.endsWith('.yml') || configFile.endsWith('.yaml')) {
      const specMatch = content.match(/spec:\s*(.+)/);
      if (specMatch) {
        testPattern = specMatch[1].trim();
      }
    }
  }

  for (const file of E2E_CONFIG_FILES) {
    if (fs.existsSync(path.join(repoPath, file))) {
      hasE2E = true;
      if (file.startsWith('cypress')) {
        e2eFramework = 'Cypress';
      } else if (file.startsWith('playwright')) {
        e2eFramework = 'Playwright';
      }
    }
  }

  const packageJsonPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      if (allDeps['@testing-library/react']) {
        hasReactTestingLibrary = true;
      }

      if (!hasTypeScriptSupport) {
        hasTypeScriptSupport = !!allDeps['ts-jest'] || !!allDeps['@swc/jest'];
      }

      if (!hasCoverage) {
        if (allDeps.nyc) {
          hasCoverage = true;
          coverageProvider = 'nyc';
        } else if (allDeps.c8) {
          hasCoverage = true;
          coverageProvider = 'c8';
        } else if (allDeps['@vitest/coverage-v8']) {
          hasCoverage = true;
          coverageProvider = 'v8';
        } else if (allDeps['@vitest/coverage-istanbul']) {
          hasCoverage = true;
          coverageProvider = 'istanbul';
        } else if (allDeps['jest-coverage-babel']) {
          hasCoverage = true;
          coverageProvider = 'babel';
        }
      }

      if (!hasE2E) {
        if (allDeps.cypress) {
          hasE2E = true;
          e2eFramework = 'Cypress';
        } else if (allDeps['@playwright/test'] || allDeps.playwright) {
          hasE2E = true;
          e2eFramework = 'Playwright';
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return {
    framework,
    configFile,
    configFiles,
    hasCoverage,
    coverageProvider,
    testPattern,
    testPathPattern,
    setupFiles,
    hasTypeScriptSupport,
    hasReactTestingLibrary,
    hasE2E,
    e2eFramework,
  };
}

export function summarizeTestFrameworkConfig(config: TestFrameworkConfig | null): string[] {
  if (!config) {
    return ['No test framework configuration found'];
  }

  const conventions: string[] = [];

  if (config.framework) {
    conventions.push(`Test framework: ${config.framework}`);
  }

  if (config.configFile) {
    conventions.push(`Config file: ${config.configFile}`);
  }

  if (config.configFiles.length > 1) {
    conventions.push(`Additional configs: ${config.configFiles.slice(1).join(', ')}`);
  }

  if (config.hasCoverage) {
    conventions.push(`Coverage enabled (${config.coverageProvider || 'built-in'})`);
  }

  if (config.testPattern) {
    conventions.push(`Test pattern: ${config.testPattern}`);
  }

  if (config.testPathPattern) {
    conventions.push(`Test path pattern: ${config.testPathPattern}`);
  }

  if (config.setupFiles.length > 0) {
    conventions.push(`Setup files: ${config.setupFiles.join(', ')}`);
  }

  if (config.hasTypeScriptSupport) {
    conventions.push('TypeScript test support enabled');
  }

  if (config.hasReactTestingLibrary) {
    conventions.push('React Testing Library configured');
  }

  if (config.hasE2E) {
    conventions.push(`E2E testing: ${config.e2eFramework}`);
  }

  return conventions;
}
