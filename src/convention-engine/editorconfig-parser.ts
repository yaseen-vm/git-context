import fs from 'fs';
import path from 'path';
import type { EditorConfig, EditorConfigRule, EditorConfigSection } from './types.js';

const DEFAULT_RULE: EditorConfigRule = {
  indentStyle: null,
  indentSize: null,
  charset: null,
  endOfLine: null,
  insertFinalNewline: null,
  trimTrailingWhitespace: null,
};

export function parseEditorConfig(repoPath: string): EditorConfig | null {
  const configPath = path.join(repoPath, '.editorconfig');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  return parseEditorConfigContent(content);
}

function parseEditorConfigContent(content: string): EditorConfig {
  const lines = content.split('\n');
  let root = false;
  let globalRules: EditorConfigRule = { ...DEFAULT_RULE };
  const sections: EditorConfigSection[] = [];
  let currentSection: { pattern: string; rules: EditorConfigRule } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      if (currentSection) {
        sections.push(currentSection);
      }

      const pattern = trimmed.slice(1, -1);

      if (pattern === '*') {
        currentSection = null;
        continue;
      }

      currentSection = {
        pattern,
        rules: { ...DEFAULT_RULE },
      };
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim().toLowerCase();
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .toLowerCase();

    if (key === 'root') {
      root = value === 'true';
      continue;
    }

    const rule = currentSection ? currentSection.rules : globalRules;
    applyRule(rule, key, value);
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return { root, globalRules, sections };
}

function applyRule(rule: EditorConfigRule, key: string, value: string): void {
  switch (key) {
    case 'indent_style':
      if (value === 'tab' || value === 'space') {
        rule.indentStyle = value;
      }
      break;

    case 'indent_size':
      const size = parseInt(value, 10);
      if (!isNaN(size)) {
        rule.indentSize = size;
      }
      break;

    case 'charset':
      rule.charset = value;
      break;

    case 'end_of_line':
      if (value === 'lf' || value === 'crlf' || value === 'cr') {
        rule.endOfLine = value;
      }
      break;

    case 'insert_final_newline':
      rule.insertFinalNewline = value === 'true';
      break;

    case 'trim_trailing_whitespace':
      rule.trimTrailingWhitespace = value === 'true';
      break;
  }
}

export function summarizeEditorConfig(config: EditorConfig | null): string[] {
  if (!config) {
    return ['No .editorconfig found'];
  }

  const conventions: string[] = [];
  const { globalRules } = config;

  if (globalRules.indentStyle) {
    if (globalRules.indentSize) {
      conventions.push(`Indent with ${globalRules.indentSize} ${globalRules.indentStyle}s`);
    } else {
      conventions.push(`Indent with ${globalRules.indentStyle}s`);
    }
  }

  if (globalRules.charset) {
    conventions.push(`File encoding: ${globalRules.charset}`);
  }

  if (globalRules.endOfLine) {
    const eolMap = { lf: 'LF (Unix)', crlf: 'CRLF (Windows)', cr: 'CR (old Mac)' };
    conventions.push(`Line endings: ${eolMap[globalRules.endOfLine]}`);
  }

  if (globalRules.insertFinalNewline !== null) {
    conventions.push(
      globalRules.insertFinalNewline
        ? 'Files must end with a newline'
        : 'No final newline required',
    );
  }

  if (globalRules.trimTrailingWhitespace !== null) {
    conventions.push(
      globalRules.trimTrailingWhitespace
        ? 'Trailing whitespace is trimmed'
        : 'Trailing whitespace is preserved',
    );
  }

  if (config.root) {
    conventions.push('This is the root .editorconfig (stops upward search)');
  }

  if (config.sections.length > 0) {
    conventions.push(
      `Override rules defined for: ${config.sections.map((s) => s.pattern).join(', ')}`,
    );
  }

  return conventions;
}
