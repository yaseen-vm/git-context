export interface EditorConfigRule {
  indentStyle: 'tab' | 'space' | null;
  indentSize: number | null;
  charset: string | null;
  endOfLine: 'lf' | 'crlf' | 'cr' | null;
  insertFinalNewline: boolean | null;
  trimTrailingWhitespace: boolean | null;
}

export interface EditorConfigSection {
  pattern: string;
  rules: EditorConfigRule;
}

export interface EditorConfig {
  root: boolean;
  globalRules: EditorConfigRule;
  sections: EditorConfigSection[];
}

export interface ConventionSummary {
  source: string;
  category: 'formatting' | 'lint' | 'typescript' | 'package' | 'ci' | 'test';
  conventions: string[];
}

export interface ConventionEngineResult {
  editorConfig: EditorConfig | null;
  summaries: ConventionSummary[];
}
