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

export interface ESLintConfig {
  configFile: string | null;
  extends: string[];
  plugins: string[];
  rules: Record<string, unknown>;
  hasTypeScriptSupport: boolean;
  hasReactSupport: boolean;
  hasPrettierIntegration: boolean;
}

export interface PrettierConfig {
  configFile: string | null;
  options: Record<string, unknown>;
  hasSemi: boolean | null;
  singleQuote: boolean | null;
  tabWidth: number | null;
  trailingComma: string | null;
  printWidth: number | null;
}

export interface LintFormatConfig {
  eslint: ESLintConfig | null;
  prettier: PrettierConfig | null;
}

export interface ConventionSummary {
  source: string;
  category: 'formatting' | 'lint' | 'typescript' | 'package' | 'ci' | 'test';
  conventions: string[];
}

export interface ConventionEngineResult {
  editorConfig: EditorConfig | null;
  lintFormat: LintFormatConfig;
  summaries: ConventionSummary[];
}
