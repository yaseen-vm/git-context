import { parseEditorConfig, summarizeEditorConfig } from './editorconfig-parser.js';
import type {
  EditorConfig,
  EditorConfigRule,
  EditorConfigSection,
  ConventionSummary,
  ConventionEngineResult,
} from './types.js';

export class ConventionEngine {
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  analyze(): ConventionEngineResult {
    const editorConfig = parseEditorConfig(this.repoPath);
    const summaries: ConventionSummary[] = [];

    const editorConfigConventions = summarizeEditorConfig(editorConfig);
    summaries.push({
      source: '.editorconfig',
      category: 'formatting',
      conventions: editorConfigConventions,
    });

    return {
      editorConfig,
      summaries,
    };
  }

  getEditorConfig(): EditorConfig | null {
    return parseEditorConfig(this.repoPath);
  }

  getFormattingConventions(): string[] {
    const editorConfig = parseEditorConfig(this.repoPath);
    return summarizeEditorConfig(editorConfig);
  }
}

export { parseEditorConfig, summarizeEditorConfig } from './editorconfig-parser.js';
export type {
  EditorConfig,
  EditorConfigRule,
  EditorConfigSection,
  ConventionSummary,
  ConventionEngineResult,
} from './types.js';
