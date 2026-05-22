import fs from 'fs';
import path from 'path';

export interface Service {
  name: string;
  path: string;
  type:
    | 'service'
    | 'module'
    | 'utility'
    | 'controller'
    | 'model'
    | 'middleware'
    | 'config'
    | 'other';
  files: string[];
  dependencies: string[];
  dependents: string[];
}

export interface ServiceRelationship {
  from: string;
  to: string;
  type: 'imports' | 'uses' | 'extends' | 'implements';
  file: string;
}

export interface ServiceMap {
  services: Map<string, Service>;
  relationships: ServiceRelationship[];
  sharedUtilities: string[];
  summary: string[];
}

const SERVICE_INDICATORS: Record<string, Service['type']> = {
  service: 'service',
  services: 'service',
  controller: 'controller',
  controllers: 'controller',
  model: 'model',
  models: 'model',
  middleware: 'middleware',
  middlewares: 'middleware',
  util: 'utility',
  utils: 'utility',
  helpers: 'utility',
  config: 'config',
  configs: 'config',
  configuration: 'config',
};

const IMPORT_PATTERN = /(?:import|require)\s+(?:.*\s+from\s+)?['"]([^'"]+)['"]/g;

function detectServiceType(dirName: string): Service['type'] {
  const lower = dirName.toLowerCase();
  return SERVICE_INDICATORS[lower] || 'other';
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  let match;

  const regex = new RegExp(IMPORT_PATTERN.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }

  return imports;
}

function resolveImportPath(
  importPath: string,
  currentFile: string,
  _repoPath: string,
): string | null {
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }

  const currentDir = path.dirname(currentFile);
  const resolved = path.resolve(currentDir, importPath);

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  if (!path.extname(resolved)) {
    for (const ext of extensions) {
      if (fs.existsSync(resolved + ext)) {
        return resolved + ext;
      }
      if (fs.existsSync(path.join(resolved, 'index' + ext))) {
        return path.join(resolved, 'index' + ext);
      }
    }
  }

  if (fs.existsSync(resolved)) {
    return resolved;
  }

  return null;
}

function getServiceForFile(filePath: string, services: Map<string, Service>): string | null {
  for (const [name, service] of services) {
    if (filePath.startsWith(service.path)) {
      return name;
    }
  }
  return null;
}

function scanDirectoryForServices(dirPath: string, repoPath: string, depth: number = 0): Service[] {
  const services: Service[] = [];

  if (depth > 3) return services;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist')
        continue;

      const fullPath = path.join(dirPath, entry.name);
      const serviceType = detectServiceType(entry.name);

      if (serviceType !== 'other' || depth < 2) {
        const files = collectFiles(fullPath);
        if (files.length > 0) {
          services.push({
            name: entry.name,
            path: fullPath,
            type: serviceType,
            files,
            dependencies: [],
            dependents: [],
          });
        }
      }

      if (depth < 2) {
        services.push(...scanDirectoryForServices(fullPath, repoPath, depth + 1));
      }
    }
  } catch {
    // ignore errors
  }

  return services;
}

function collectFiles(dirPath: string, maxFiles: number = 100): string[] {
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= maxFiles) break;

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
          files.push(...collectFiles(path.join(dirPath, entry.name), maxFiles - files.length));
        }
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        files.push(path.join(dirPath, entry.name));
      }
    }
  } catch {
    // ignore errors
  }

  return files;
}

export function analyzeServiceRelationships(repoPath: string): ServiceMap {
  const services = new Map<string, Service>();
  const relationships: ServiceRelationship[] = [];
  const sharedUtilities: string[] = [];

  const discoveredServices = scanDirectoryForServices(repoPath, repoPath);

  for (const service of discoveredServices) {
    services.set(service.name, service);
  }

  for (const [serviceName, service] of services) {
    for (const file of service.files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const imports = extractImports(content);

        for (const importPath of imports) {
          const resolved = resolveImportPath(importPath, file, repoPath);
          if (!resolved) continue;

          const targetService = getServiceForFile(resolved, services);
          if (targetService && targetService !== serviceName) {
            if (!service.dependencies.includes(targetService)) {
              service.dependencies.push(targetService);
            }

            const target = services.get(targetService);
            if (target && !target.dependents.includes(serviceName)) {
              target.dependents.push(serviceName);
            }

            relationships.push({
              from: serviceName,
              to: targetService,
              type: 'imports',
              file: path.relative(repoPath, file),
            });
          }
        }
      } catch {
        // ignore read errors
      }
    }
  }

  for (const [name, service] of services) {
    if (service.type === 'utility' && service.dependents.length > 1) {
      sharedUtilities.push(name);
    }
  }

  const summary = summarizeServiceMap(services, relationships, sharedUtilities);

  return {
    services,
    relationships,
    sharedUtilities,
    summary,
  };
}

function summarizeServiceMap(
  services: Map<string, Service>,
  relationships: ServiceRelationship[],
  sharedUtilities: string[],
): string[] {
  const summary: string[] = [];

  summary.push(`Services/modules identified: ${services.size}`);
  summary.push(`Relationships found: ${relationships.length}`);

  if (sharedUtilities.length > 0) {
    summary.push(`Shared utilities: ${sharedUtilities.join(', ')}`);
  }

  const servicesByType = new Map<string, string[]>();
  for (const [name, service] of services) {
    const existing = servicesByType.get(service.type) || [];
    existing.push(name);
    servicesByType.set(service.type, existing);
  }

  for (const [type, names] of servicesByType) {
    summary.push(`  ${type}: ${names.join(', ')}`);
  }

  const highlyConnected = [...services.entries()]
    .filter(([, s]) => s.dependencies.length > 2 || s.dependents.length > 2)
    .sort(
      (a, b) =>
        b[1].dependencies.length +
        b[1].dependents.length -
        (a[1].dependencies.length + a[1].dependents.length),
    )
    .slice(0, 5);

  if (highlyConnected.length > 0) {
    summary.push('Highly connected modules:');
    for (const [name, service] of highlyConnected) {
      summary.push(
        `  ${name}: ${service.dependencies.length} dependencies, ${service.dependents.length} dependents`,
      );
    }
  }

  return summary;
}

export function getServiceDependencyGraph(services: Map<string, Service>): string[] {
  const lines: string[] = ['Service Dependency Graph:'];

  for (const [name, service] of services) {
    if (service.dependencies.length > 0) {
      lines.push(`  ${name} -> ${service.dependencies.join(', ')}`);
    }
  }

  if (lines.length === 1) {
    lines.push('  No dependencies detected');
  }

  return lines;
}
