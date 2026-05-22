import fs from 'fs';
import path from 'path';
import type { ESLintConfig, PrettierConfig } from './types.js';

const ESLINT_CONFIG_FILES = [
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintrc.json',
  '.eslintrc',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
];

const PRETTIER_CONFIG_FILES = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.toml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
];

export function parseESLintConfig(repoPath: string): ESLintConfig | null {
  const configFile = findConfigFile(repoPath, ESLINT_CONFIG_FILES);

  if (!configFile) {
    return null;
  }

  const filePath = path.join(repoPath, configFile);
  const content = fs.readFileSync(filePath, 'utf-8');

  let config: Record<string, unknown>;

  if (configFile.endsWith('.json') || configFile === '.eslintrc') {
    try {
      config = JSON.parse(content);
    } catch {
      return createDefaultESLintConfig(configFile);
    }
  } else if (configFile.endsWith('.yaml') || configFile.endsWith('.yml')) {
    return parseESLintYaml(configFile, content);
  } else if (
    configFile.endsWith('.js') ||
    configFile.endsWith('.cjs') ||
    configFile.endsWith('.mjs') ||
    configFile.endsWith('.ts') ||
    configFile.endsWith('.mts')
  ) {
    return parseESLintJs(configFile, content);
  } else {
    try {
      config = JSON.parse(content);
    } catch {
      return createDefaultESLintConfig(configFile);
    }
  }

  return extractESLintInfo(configFile, config);
}

function parseESLintYaml(configFile: string, content: string): ESLintConfig {
  const extendsList: string[] = [];
  const plugins: string[] = [];

  const extendsMatch = content.match(/extends:\s*\[([^\]]+)\]/);
  if (extendsMatch) {
    const items = extendsMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, ''));
    extendsList.push(...items);
  }

  const pluginMatch = content.match(/plugins:\s*\[([^\]]+)\]/);
  if (pluginMatch) {
    const items = pluginMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, ''));
    plugins.push(...items);
  }

  const hasTypeScriptSupport =
    extendsList.some((e) => e.includes('typescript')) ||
    plugins.some((p) => p.includes('typescript'));
  const hasReactSupport =
    extendsList.some((e) => e.includes('react')) || plugins.some((p) => p.includes('react'));
  const hasPrettierIntegration =
    extendsList.some((e) => e.includes('prettier')) || plugins.some((p) => p.includes('prettier'));

  return {
    configFile,
    extends: extendsList,
    plugins,
    rules: {},
    hasTypeScriptSupport,
    hasReactSupport,
    hasPrettierIntegration,
  };
}

function parseESLintJs(configFile: string, content: string): ESLintConfig {
  const extendsList: string[] = [];
  const plugins: string[] = [];
  let hasTypeScriptSupport = false;
  let hasReactSupport = false;
  let hasPrettierIntegration = false;

  const importMatches = content.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g);
  for (const match of importMatches) {
    const moduleName = match[2];
    if (moduleName.includes('typescript')) {
      hasTypeScriptSupport = true;
      extendsList.push(moduleName);
    }
    if (moduleName.includes('react')) {
      hasReactSupport = true;
    }
    if (moduleName.includes('prettier')) {
      hasPrettierIntegration = true;
      extendsList.push(moduleName);
    }
  }

  if (content.includes('typescript-eslint') || content.includes('@typescript-eslint')) {
    hasTypeScriptSupport = true;
  }

  if (content.includes('eslint-config-prettier') || content.includes('prettier')) {
    hasPrettierIntegration = true;
  }

  return {
    configFile,
    extends: extendsList,
    plugins,
    rules: {},
    hasTypeScriptSupport,
    hasReactSupport,
    hasPrettierIntegration,
  };
}

function createDefaultESLintConfig(configFile: string): ESLintConfig {
  return {
    configFile,
    extends: [],
    plugins: [],
    rules: {},
    hasTypeScriptSupport: false,
    hasReactSupport: false,
    hasPrettierIntegration: false,
  };
}

function extractESLintInfo(configFile: string, config: Record<string, unknown>): ESLintConfig {
  const extendsList: string[] = [];
  const plugins: string[] = [];
  const rules = (config.rules as Record<string, unknown>) || {};

  if (Array.isArray(config.extends)) {
    extendsList.push(...config.extends.map(String));
  } else if (typeof config.extends === 'string') {
    extendsList.push(config.extends);
  }

  if (Array.isArray(config.plugins)) {
    plugins.push(...config.plugins.map(String));
  } else if (typeof config.plugins === 'string') {
    plugins.push(config.plugins);
  }

  const hasTypeScriptSupport =
    extendsList.some((e) => e.includes('typescript')) ||
    plugins.some((p) => p.includes('typescript')) ||
    !!config.parser?.toString().includes('typescript');

  const hasReactSupport =
    extendsList.some((e) => e.includes('react')) || plugins.some((p) => p.includes('react'));

  const hasPrettierIntegration =
    extendsList.some((e) => e.includes('prettier')) || plugins.some((p) => p.includes('prettier'));

  return {
    configFile,
    extends: extendsList,
    plugins,
    rules,
    hasTypeScriptSupport,
    hasReactSupport,
    hasPrettierIntegration,
  };
}

export function parsePrettierConfig(repoPath: string): PrettierConfig | null {
  const configFile = findConfigFile(repoPath, PRETTIER_CONFIG_FILES);

  if (!configFile) {
    return null;
  }

  const filePath = path.join(repoPath, configFile);
  const content = fs.readFileSync(filePath, 'utf-8');

  let options: Record<string, unknown>;

  if (configFile.endsWith('.toml')) {
    return parsePrettierToml(configFile, content);
  }

  if (configFile.endsWith('.yaml') || configFile.endsWith('.yml')) {
    return parsePrettierYaml(configFile, content);
  }

  if (configFile.endsWith('.js') || configFile.endsWith('.cjs') || configFile.endsWith('.mjs')) {
    return parsePrettierJs(configFile, content);
  }

  try {
    options = JSON.parse(content);
  } catch {
    return createDefaultPrettierConfig(configFile);
  }

  return extractPrettierInfo(configFile, options);
}

function parsePrettierToml(configFile: string, content: string): PrettierConfig {
  const options: Record<string, unknown> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (value === 'true') options[key] = true;
    else if (value === 'false') options[key] = false;
    else if (!isNaN(Number(value))) options[key] = Number(value);
    else options[key] = value.replace(/['"]/g, '');
  }

  return extractPrettierInfo(configFile, options);
}

function parsePrettierYaml(configFile: string, content: string): PrettierConfig {
  const options: Record<string, unknown> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    if (value === 'true') options[key] = true;
    else if (value === 'false') options[key] = false;
    else if (!isNaN(Number(value))) options[key] = Number(value);
    else options[key] = value.replace(/['"]/g, '');
  }

  return extractPrettierInfo(configFile, options);
}

function parsePrettierJs(configFile: string, content: string): PrettierConfig {
  const options: Record<string, unknown> = {};

  const propertyMatches = content.matchAll(/(\w+)\s*:\s*([^,}\n]+)/g);
  for (const match of propertyMatches) {
    const key = match[1].trim();
    let value: unknown = match[2].trim();

    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (!isNaN(Number(value))) value = Number(value);
    else if (typeof value === 'string') value = value.replace(/['"]/g, '');

    options[key] = value;
  }

  return extractPrettierInfo(configFile, options);
}

function createDefaultPrettierConfig(configFile: string): PrettierConfig {
  return {
    configFile,
    options: {},
    hasSemi: null,
    singleQuote: null,
    tabWidth: null,
    trailingComma: null,
    printWidth: null,
  };
}

function extractPrettierInfo(configFile: string, options: Record<string, unknown>): PrettierConfig {
  return {
    configFile,
    options,
    hasSemi: typeof options.semi === 'boolean' ? options.semi : null,
    singleQuote: typeof options.singleQuote === 'boolean' ? options.singleQuote : null,
    tabWidth: typeof options.tabWidth === 'number' ? options.tabWidth : null,
    trailingComma: typeof options.trailingComma === 'string' ? options.trailingComma : null,
    printWidth: typeof options.printWidth === 'number' ? options.printWidth : null,
  };
}

function findConfigFile(repoPath: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(repoPath, candidate))) {
      return candidate;
    }
  }
  return null;
}

export function summarizeESLintConfig(config: ESLintConfig | null): string[] {
  if (!config) {
    return ['No ESLint configuration found'];
  }

  const conventions: string[] = [];

  conventions.push(`ESLint config: ${config.configFile}`);

  if (config.extends.length > 0) {
    conventions.push(`Extends: ${config.extends.join(', ')}`);
  }

  if (config.hasTypeScriptSupport) {
    conventions.push('TypeScript linting enabled');
  }

  if (config.hasReactSupport) {
    conventions.push('React linting enabled');
  }

  if (config.hasPrettierIntegration) {
    conventions.push('Prettier integration enabled (formatting rules disabled)');
  }

  const ruleCount = Object.keys(config.rules).length;
  if (ruleCount > 0) {
    conventions.push(`${ruleCount} custom rule(s) configured`);
  }

  return conventions;
}

export function summarizePrettierConfig(config: PrettierConfig | null): string[] {
  if (!config) {
    return ['No Prettier configuration found'];
  }

  const conventions: string[] = [];

  conventions.push(`Prettier config: ${config.configFile}`);

  if (config.hasSemi !== null) {
    conventions.push(config.hasSemi ? 'Semicolons required' : 'No semicolons');
  }

  if (config.singleQuote !== null) {
    conventions.push(config.singleQuote ? 'Single quotes preferred' : 'Double quotes preferred');
  }

  if (config.tabWidth !== null) {
    conventions.push(`Tab width: ${config.tabWidth}`);
  }

  if (config.trailingComma !== null) {
    conventions.push(`Trailing commas: ${config.trailingComma}`);
  }

  if (config.printWidth !== null) {
    conventions.push(`Print width: ${config.printWidth}`);
  }

  return conventions;
}

export function summarizeLintFormatConfig(
  eslint: ESLintConfig | null,
  prettier: PrettierConfig | null,
): string[] {
  return [...summarizeESLintConfig(eslint), ...summarizePrettierConfig(prettier)];
}
