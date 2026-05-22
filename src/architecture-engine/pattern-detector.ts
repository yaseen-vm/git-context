import fs from 'fs';
import path from 'path';

export interface FrameworkDetection {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface ArchitecturePattern {
  name: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface StateManagementPattern {
  name: string;
  library: string | null;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface PatternDetectionResult {
  frameworks: FrameworkDetection[];
  architecturePatterns: ArchitecturePattern[];
  stateManagement: StateManagementPattern[];
  summary: string[];
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

const FRAMEWORK_INDICATORS: Record<
  string,
  { deps: string[]; files: string[]; patterns: string[] }
> = {
  React: {
    deps: ['react', 'react-dom'],
    files: ['jsx', 'tsx'],
    patterns: ['useState', 'useEffect', 'JSX.Element', 'React.Component'],
  },
  Vue: {
    deps: ['vue'],
    files: ['vue'],
    patterns: ['defineComponent', 'createApp', 'ref(', 'reactive('],
  },
  Angular: {
    deps: ['@angular/core', '@angular/common'],
    files: ['component.ts', 'module.ts'],
    patterns: ['@Component', '@NgModule', '@Injectable'],
  },
  'Next.js': {
    deps: ['next'],
    files: ['next.config.js', 'next.config.mjs'],
    patterns: ['getServerSideProps', 'getStaticProps', 'useRouter'],
  },
  'Nuxt.js': {
    deps: ['nuxt'],
    files: ['nuxt.config.js', 'nuxt.config.ts'],
    patterns: ['defineNuxtConfig', 'useNuxtApp'],
  },
  Express: {
    deps: ['express'],
    files: [],
    patterns: ['app.get(', 'app.post(', 'app.use(', 'express.Router()'],
  },
  NestJS: {
    deps: ['@nestjs/core', '@nestjs/common'],
    files: [],
    patterns: ['@Controller', '@Injectable', '@Module', '@Get', '@Post'],
  },
  Fastify: {
    deps: ['fastify'],
    files: [],
    patterns: ['fastify.register', 'fastify.get('],
  },
  Svelte: {
    deps: ['svelte'],
    files: ['svelte'],
    patterns: ['onMount', 'onDestroy', 'createEventDispatcher'],
  },
  SvelteKit: {
    deps: ['@sveltejs/kit'],
    files: [],
    patterns: ['load', '+page.svelte', '+layout.svelte'],
  },
};

const ARCHITECTURE_PATTERNS: Record<string, { indicators: string[]; description: string }> = {
  MVC: {
    indicators: ['models', 'views', 'controllers', 'mvc'],
    description: 'Model-View-Controller pattern',
  },
  'Repository Pattern': {
    indicators: ['repositories', 'repository', 'repo'],
    description: 'Repository pattern for data access abstraction',
  },
  'Clean Architecture': {
    indicators: [
      'entities',
      'use-cases',
      'adapters',
      'frameworks',
      'domain',
      'application',
      'infrastructure',
    ],
    description: 'Clean Architecture with separated layers',
  },
  'Service Layer': {
    indicators: ['services', 'service'],
    description: 'Service layer pattern for business logic',
  },
  Microservices: {
    indicators: ['api-gateway', 'message-broker', 'event-bus', 'saga'],
    description: 'Microservices architecture',
  },
  Monorepo: {
    indicators: ['packages', 'apps', 'workspaces', 'lerna.json', 'nx.json', 'turbo.json'],
    description: 'Monorepo with multiple packages',
  },
  'Feature-based': {
    indicators: ['features', 'modules', 'pages'],
    description: 'Feature-based organization',
  },
};

const STATE_MANAGEMENT: Record<string, { deps: string[]; patterns: string[] }> = {
  Redux: {
    deps: ['redux', 'react-redux', '@reduxjs/toolkit'],
    patterns: ['createStore', 'configureStore', 'useSelector', 'useDispatch', 'createSlice'],
  },
  MobX: {
    deps: ['mobx', 'mobx-react-lite'],
    patterns: ['observable', 'action', 'computed', 'makeObservable', 'makeAutoObservable'],
  },
  Zustand: {
    deps: ['zustand'],
    patterns: ['create(', 'useStore'],
  },
  Jotai: {
    deps: ['jotai'],
    patterns: ['atom(', 'useAtom'],
  },
  Recoil: {
    deps: ['recoil'],
    patterns: ['atom(', 'selector(', 'useRecoilState', 'useRecoilValue'],
  },
  'Vue Pinia': {
    deps: ['pinia'],
    patterns: ['defineStore', 'useStore'],
  },
  Vuex: {
    deps: ['vuex'],
    patterns: ['createStore', 'mapState', 'mapGetters', 'mapActions'],
  },
  NgRx: {
    deps: ['@ngrx/store', '@ngrx/effects'],
    patterns: ['StoreModule', 'createReducer', 'createAction', 'createEffect'],
  },
};

function readPackageJson(repoPath: string): PackageJson | null {
  try {
    const pkgPath = path.join(repoPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }
}

function detectFrameworks(repoPath: string, pkg: PackageJson | null): FrameworkDetection[] {
  const frameworks: FrameworkDetection[] = [];
  const allDeps = {
    ...pkg?.dependencies,
    ...pkg?.devDependencies,
  };

  for (const [name, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
    const evidence: string[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'low';

    const depMatches = indicators.deps.filter((dep) => allDeps[dep]);
    if (depMatches.length > 0) {
      evidence.push(`Dependencies: ${depMatches.join(', ')}`);
      confidence = depMatches.length > 1 ? 'high' : 'medium';
    }

    if (indicators.files.length > 0) {
      const hasFiles = indicators.files.some((ext) => {
        try {
          const files = fs.readdirSync(repoPath);
          return files.some((f) => f.endsWith(`.${ext}`) || f.includes(ext));
        } catch {
          return false;
        }
      });
      if (hasFiles) {
        evidence.push('Framework-specific files detected');
        confidence = 'high';
      }
    }

    if (evidence.length > 0) {
      frameworks.push({ name, confidence, evidence });
    }
  }

  return frameworks;
}

function detectArchitecturePatterns(repoPath: string): ArchitecturePattern[] {
  const patterns: ArchitecturePattern[] = [];

  try {
    const entries = fs.readdirSync(repoPath, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase());
    const fileNames = entries.filter((e) => !e.isDirectory()).map((e) => e.name.toLowerCase());

    for (const [name, config] of Object.entries(ARCHITECTURE_PATTERNS)) {
      const evidence: string[] = [];
      let confidence: 'high' | 'medium' | 'low' = 'low';

      const matchingDirs = config.indicators.filter((ind) => dirNames.includes(ind));
      const matchingFiles = config.indicators.filter((ind) => fileNames.includes(ind));

      if (matchingDirs.length > 0) {
        evidence.push(`Directories: ${matchingDirs.join(', ')}`);
        confidence = matchingDirs.length > 2 ? 'high' : 'medium';
      }

      if (matchingFiles.length > 0) {
        evidence.push(`Files: ${matchingFiles.join(', ')}`);
        confidence = 'high';
      }

      if (evidence.length > 0) {
        patterns.push({
          name,
          description: config.description,
          confidence,
          evidence,
        });
      }
    }
  } catch {
    // ignore errors
  }

  return patterns;
}

function detectStateManagement(
  repoPath: string,
  pkg: PackageJson | null,
): StateManagementPattern[] {
  const patterns: StateManagementPattern[] = [];
  const allDeps = {
    ...pkg?.dependencies,
    ...pkg?.devDependencies,
  };

  for (const [name, indicators] of Object.entries(STATE_MANAGEMENT)) {
    const evidence: string[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let library: string | null = null;

    const depMatches = indicators.deps.filter((dep) => allDeps[dep]);
    if (depMatches.length > 0) {
      evidence.push(`Dependencies: ${depMatches.join(', ')}`);
      confidence = depMatches.length > 1 ? 'high' : 'medium';
      library = depMatches[0];
    }

    if (evidence.length > 0) {
      patterns.push({ name, library, confidence, evidence });
    }
  }

  return patterns;
}

function summarizeDetections(
  frameworks: FrameworkDetection[],
  architecturePatterns: ArchitecturePattern[],
  stateManagement: StateManagementPattern[],
): string[] {
  const summary: string[] = [];

  if (frameworks.length > 0) {
    summary.push('Detected frameworks:');
    for (const fw of frameworks) {
      summary.push(`  ${fw.name} (${fw.confidence} confidence)`);
      for (const ev of fw.evidence) {
        summary.push(`    - ${ev}`);
      }
    }
  } else {
    summary.push('No frameworks detected');
  }

  if (architecturePatterns.length > 0) {
    summary.push('');
    summary.push('Detected architecture patterns:');
    for (const pattern of architecturePatterns) {
      summary.push(`  ${pattern.name}: ${pattern.description}`);
      summary.push(`    Confidence: ${pattern.confidence}`);
    }
  } else {
    summary.push('No architecture patterns detected');
  }

  if (stateManagement.length > 0) {
    summary.push('');
    summary.push('Detected state management:');
    for (const sm of stateManagement) {
      summary.push(`  ${sm.name} (${sm.confidence} confidence)`);
      if (sm.library) {
        summary.push(`    Library: ${sm.library}`);
      }
    }
  }

  return summary;
}

export function detectPatterns(repoPath: string): PatternDetectionResult {
  const pkg = readPackageJson(repoPath);
  const frameworks = detectFrameworks(repoPath, pkg);
  const architecturePatterns = detectArchitecturePatterns(repoPath);
  const stateManagement = detectStateManagement(repoPath, pkg);
  const summary = summarizeDetections(frameworks, architecturePatterns, stateManagement);

  return {
    frameworks,
    architecturePatterns,
    stateManagement,
    summary,
  };
}
