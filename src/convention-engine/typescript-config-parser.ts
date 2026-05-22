import path from 'path';
import { findConfigFile, readJsonFile } from '../utils/index.js';
import type { TypeScriptConfig } from './types.js';

const TSCONFIG_FILES = ['tsconfig.json', 'jsconfig.json'];

export function parseTypeScriptConfig(repoPath: string): TypeScriptConfig | null {
  const configFile = findConfigFile(repoPath, TSCONFIG_FILES);

  if (!configFile) {
    return null;
  }

  const filePath = path.join(repoPath, configFile);
  let config: Record<string, unknown>;

  try {
    config = readJsonFile(filePath) as Record<string, unknown>;
  } catch (error) {
    console.warn(
      `Warning: Failed to parse ${configFile}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return createDefaultTypeScriptConfig(configFile);
  }

  return extractTypeScriptInfo(configFile, config);
}

function createDefaultTypeScriptConfig(configFile: string): TypeScriptConfig {
  return {
    configFile,
    isStrict: false,
    target: null,
    module: null,
    moduleResolution: null,
    paths: {},
    baseUrl: null,
    jsx: null,
    esModuleInterop: null,
    skipLibCheck: null,
    forceConsistentCasingInFileNames: null,
    declaration: null,
    declarationMap: null,
    sourceMap: null,
    lib: [],
    include: [],
    exclude: [],
  };
}

function extractTypeScriptInfo(
  configFile: string,
  config: Record<string, unknown>,
): TypeScriptConfig {
  const compilerOptions = (config.compilerOptions as Record<string, unknown>) || {};

  const isStrict = compilerOptions.strict === true;

  const target = typeof compilerOptions.target === 'string' ? compilerOptions.target : null;

  const module = typeof compilerOptions.module === 'string' ? compilerOptions.module : null;

  const moduleResolution =
    typeof compilerOptions.moduleResolution === 'string' ? compilerOptions.moduleResolution : null;

  const paths: Record<string, string[]> = {};
  if (compilerOptions.paths && typeof compilerOptions.paths === 'object') {
    for (const [key, value] of Object.entries(compilerOptions.paths as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        paths[key] = value.map(String);
      }
    }
  }

  const baseUrl = typeof compilerOptions.baseUrl === 'string' ? compilerOptions.baseUrl : null;

  const jsx = typeof compilerOptions.jsx === 'string' ? compilerOptions.jsx : null;

  const esModuleInterop =
    typeof compilerOptions.esModuleInterop === 'boolean' ? compilerOptions.esModuleInterop : null;

  const skipLibCheck =
    typeof compilerOptions.skipLibCheck === 'boolean' ? compilerOptions.skipLibCheck : null;

  const forceConsistentCasingInFileNames =
    typeof compilerOptions.forceConsistentCasingInFileNames === 'boolean'
      ? compilerOptions.forceConsistentCasingInFileNames
      : null;

  const declaration =
    typeof compilerOptions.declaration === 'boolean' ? compilerOptions.declaration : null;

  const declarationMap =
    typeof compilerOptions.declarationMap === 'boolean' ? compilerOptions.declarationMap : null;

  const sourceMap =
    typeof compilerOptions.sourceMap === 'boolean' ? compilerOptions.sourceMap : null;

  const lib: string[] = [];
  if (Array.isArray(compilerOptions.lib)) {
    lib.push(...compilerOptions.lib.map(String));
  }

  const include: string[] = [];
  if (Array.isArray(config.include)) {
    include.push(...config.include.map(String));
  }

  const exclude: string[] = [];
  if (Array.isArray(config.exclude)) {
    exclude.push(...config.exclude.map(String));
  }

  return {
    configFile,
    isStrict,
    target,
    module,
    moduleResolution,
    paths,
    baseUrl,
    jsx,
    esModuleInterop,
    skipLibCheck,
    forceConsistentCasingInFileNames,
    declaration,
    declarationMap,
    sourceMap,
    lib,
    include,
    exclude,
  };
}

export function summarizeTypeScriptConfig(config: TypeScriptConfig | null): string[] {
  if (!config) {
    return ['No TypeScript/JavaScript configuration found'];
  }

  const conventions: string[] = [];

  conventions.push(`Config file: ${config.configFile}`);

  if (config.isStrict) {
    conventions.push('Strict mode enabled');
  } else {
    conventions.push('Strict mode disabled');
  }

  if (config.target) {
    conventions.push(`Target: ${config.target}`);
  }

  if (config.module) {
    conventions.push(`Module system: ${config.module}`);
  }

  if (config.moduleResolution) {
    conventions.push(`Module resolution: ${config.moduleResolution}`);
  }

  if (Object.keys(config.paths).length > 0) {
    const pathEntries = Object.entries(config.paths)
      .map(([key, value]) => `${key} -> ${value[0]}`)
      .join(', ');
    conventions.push(`Path aliases: ${pathEntries}`);
  }

  if (config.baseUrl) {
    conventions.push(`Base URL: ${config.baseUrl}`);
  }

  if (config.jsx) {
    conventions.push(`JSX: ${config.jsx}`);
  }

  if (config.esModuleInterop !== null) {
    conventions.push(
      config.esModuleInterop ? 'ES module interop enabled' : 'ES module interop disabled',
    );
  }

  if (config.skipLibCheck !== null) {
    conventions.push(
      config.skipLibCheck ? 'Library type checking skipped' : 'Library type checking enabled',
    );
  }

  if (config.forceConsistentCasingInFileNames !== null) {
    conventions.push(
      config.forceConsistentCasingInFileNames
        ? 'Force consistent file name casing'
        : 'File name casing not enforced',
    );
  }

  if (config.declaration !== null) {
    conventions.push(config.declaration ? 'Declaration files generated' : 'No declaration files');
  }

  if (config.sourceMap !== null) {
    conventions.push(config.sourceMap ? 'Source maps enabled' : 'Source maps disabled');
  }

  if (config.lib.length > 0) {
    conventions.push(`Lib: ${config.lib.join(', ')}`);
  }

  if (config.include.length > 0) {
    conventions.push(`Include: ${config.include.join(', ')}`);
  }

  if (config.exclude.length > 0) {
    conventions.push(`Exclude: ${config.exclude.join(', ')}`);
  }

  return conventions;
}
