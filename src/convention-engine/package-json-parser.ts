import fs from 'fs';
import path from 'path';
import type { PackageJsonConfig } from './types.js';

const FRAMEWORK_DEPS: Record<string, string> = {
  next: 'Next.js',
  nuxt: 'Nuxt.js',
  express: 'Express',
  fastify: 'Fastify',
  koa: 'Koa',
  '@nestjs/core': 'NestJS',
  gatsby: 'Gatsby',
  svelte: 'Svelte',
  '@angular/core': 'Angular',
  react: 'React',
  vue: 'Vue',
  solid: 'SolidJS',
  astro: 'Astro',
};

const BUILD_TOOL_DEPS: Record<string, string> = {
  webpack: 'Webpack',
  vite: 'Vite',
  esbuild: 'esbuild',
  rollup: 'Rollup',
  parcel: 'Parcel',
  turbopack: 'Turbopack',
  '@swc/core': 'SWC',
  tsup: 'tsup',
  unbuild: 'unbuild',
};

const TEST_FRAMEWORK_DEPS: Record<string, string> = {
  jest: 'Jest',
  vitest: 'Vitest',
  mocha: 'Mocha',
  chai: 'Chai',
  '@testing-library/react': 'Testing Library (React)',
  '@testing-library/vue': 'Testing Library (Vue)',
  '@testing-library/svelte': 'Testing Library (Svelte)',
  cypress: 'Cypress',
  playwright: 'Playwright',
  '@playwright/test': 'Playwright',
};

export function parsePackageJson(repoPath: string): PackageJsonConfig | null {
  const configPath = path.join(repoPath, 'package.json');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, 'utf-8');

  let config: Record<string, unknown>;

  try {
    config = JSON.parse(content);
  } catch {
    return createDefaultPackageJsonConfig();
  }

  return extractPackageJsonInfo(config);
}

function createDefaultPackageJsonConfig(): PackageJsonConfig {
  return {
    name: null,
    version: null,
    type: null,
    scripts: {},
    dependencies: {},
    devDependencies: {},
    hasBuildScript: false,
    hasTestScript: false,
    hasLintScript: false,
    hasFormatScript: false,
    hasTypecheckScript: false,
    detectedFramework: null,
    detectedBuildTool: null,
    detectedTestFramework: null,
  };
}

function extractPackageJsonInfo(config: Record<string, unknown>): PackageJsonConfig {
  const name = typeof config.name === 'string' ? config.name : null;
  const version = typeof config.version === 'string' ? config.version : null;
  const type = typeof config.type === 'string' ? config.type : null;

  const scripts: Record<string, string> = {};
  if (config.scripts && typeof config.scripts === 'object') {
    for (const [key, value] of Object.entries(config.scripts as Record<string, unknown>)) {
      if (typeof value === 'string') {
        scripts[key] = value;
      }
    }
  }

  const dependencies: Record<string, string> = {};
  if (config.dependencies && typeof config.dependencies === 'object') {
    for (const [key, value] of Object.entries(config.dependencies as Record<string, unknown>)) {
      if (typeof value === 'string') {
        dependencies[key] = value;
      }
    }
  }

  const devDependencies: Record<string, string> = {};
  if (config.devDependencies && typeof config.devDependencies === 'object') {
    for (const [key, value] of Object.entries(config.devDependencies as Record<string, unknown>)) {
      if (typeof value === 'string') {
        devDependencies[key] = value;
      }
    }
  }

  const hasBuildScript = !!scripts.build;
  const hasTestScript = !!scripts.test;
  const hasLintScript = !!scripts.lint;
  const hasFormatScript = !!scripts.format;
  const hasTypecheckScript = !!scripts.typecheck;

  const allDeps = { ...dependencies, ...devDependencies };
  const detectedFramework = detectFramework(allDeps);
  const detectedBuildTool = detectBuildTool(allDeps);
  const detectedTestFramework = detectTestFramework(allDeps);

  return {
    name,
    version,
    type,
    scripts,
    dependencies,
    devDependencies,
    hasBuildScript,
    hasTestScript,
    hasLintScript,
    hasFormatScript,
    hasTypecheckScript,
    detectedFramework,
    detectedBuildTool,
    detectedTestFramework,
  };
}

function detectFramework(deps: Record<string, string>): string | null {
  for (const [dep, framework] of Object.entries(FRAMEWORK_DEPS)) {
    if (deps[dep]) {
      return framework;
    }
  }
  return null;
}

function detectBuildTool(deps: Record<string, string>): string | null {
  for (const [dep, tool] of Object.entries(BUILD_TOOL_DEPS)) {
    if (deps[dep]) {
      return tool;
    }
  }
  return null;
}

function detectTestFramework(deps: Record<string, string>): string | null {
  for (const [dep, framework] of Object.entries(TEST_FRAMEWORK_DEPS)) {
    if (deps[dep]) {
      return framework;
    }
  }
  return null;
}

export function summarizePackageJsonConfig(config: PackageJsonConfig | null): string[] {
  if (!config) {
    return ['No package.json found'];
  }

  const conventions: string[] = [];

  if (config.name) {
    conventions.push(`Package: ${config.name}@${config.version || '0.0.0'}`);
  }

  if (config.type) {
    conventions.push(`Module type: ${config.type}`);
  }

  if (config.detectedFramework) {
    conventions.push(`Framework: ${config.detectedFramework}`);
  }

  if (config.detectedBuildTool) {
    conventions.push(`Build tool: ${config.detectedBuildTool}`);
  }

  if (config.detectedTestFramework) {
    conventions.push(`Test framework: ${config.detectedTestFramework}`);
  }

  const scriptConventions: string[] = [];
  if (config.hasBuildScript) scriptConventions.push('build');
  if (config.hasTestScript) scriptConventions.push('test');
  if (config.hasLintScript) scriptConventions.push('lint');
  if (config.hasFormatScript) scriptConventions.push('format');
  if (config.hasTypecheckScript) scriptConventions.push('typecheck');

  if (scriptConventions.length > 0) {
    conventions.push(`Available scripts: ${scriptConventions.join(', ')}`);
  }

  const depCount = Object.keys(config.dependencies).length;
  const devDepCount = Object.keys(config.devDependencies).length;
  conventions.push(`Dependencies: ${depCount} production, ${devDepCount} development`);

  return conventions;
}
